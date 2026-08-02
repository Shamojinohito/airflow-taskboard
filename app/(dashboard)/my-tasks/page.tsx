'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import TaskDetailPanel from '@/components/tasks/task-detail-panel'
import TaskForm from '@/components/tasks/task-form'
import TaskListView from '@/components/tasks/task-list-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckSquare, Plus } from 'lucide-react'
import type { TaskStatus } from '@/lib/task-status'

interface Task {
  id: string
  parent_task_id: string | null
  title: string
  priority: string
  due_date: string | null
  status: string
  project_id: string
  assignee_user_id: string | null
  assignee_agent_id: string | null
  project: { name: string } | null
  task_tags: { tags: { id: string; name: string; color: string } | null }[]
  task_links: { id: string; url: string; title: string | null }[]
  assignee_agent: { name: string; type: string } | null
}

export default function MyTasksPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: async () => {
      // getUser() だと取得のたびに Auth サーバーへ往復が入る。必要なのは user id だけで、
      // アクセストークンの sub クレームに入っているので getClaims()（ローカル検証）で足りる
      const { data: claimsData } = await supabase.auth.getClaims()
      const userId = claimsData?.claims?.sub
      if (!userId) return []

      const { data, error } = await (supabase.from('tasks') as any)
        .select(`
          id,
          parent_task_id,
          project_id,
          title,
          status,
          priority,
          due_date,
          assignee_user_id,
          assignee_agent_id,
          project:project_id(name),
          task_tags(tag_id, tags(id, name, color)),
          task_links(id, url, title),
          assignee_agent:assignee_agent_id(id, name, type)
        `)
        .eq('assignee_user_id', userId)
        .order('due_date', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data ?? []) as Task[]
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('tasks') as any)
        .update({ status })
        .eq('id', taskId)
      if (error) throw error
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] })
      const previousTasks = queryClient.getQueryData(['my-tasks'])
      queryClient.setQueryData(['my-tasks'], (current: unknown) => {
        if (!Array.isArray(current)) return current
        return current.map((task: Task) =>
          task.id === taskId ? { ...task, status } : task
        )
      })
      return { previousTasks }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['my-tasks'], context.previousTasks)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      const task = (tasks as Task[]).find(t => t.id === variables.taskId)
      if (task) queryClient.invalidateQueries({ queryKey: ['tasks', task.project_id] })
    },
  })

  const changeStatus = (taskId: string, status: TaskStatus) => {
    updateStatus.mutate({ taskId, status })
  }

  const openCount = (tasks as Task[]).filter(task => task.status !== 'done').length
  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background/70 px-4 py-4 backdrop-blur sm:px-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <CheckSquare size={19} className="text-primary" />
              My Tasks
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Assigned work collected across projects.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-2 py-1">{openCount} open</Badge>
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              <span className="hidden sm:inline">Add Task</span>
              <span className="sr-only sm:hidden">Add Task</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {!loading && !error && tasks.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p>No tasks assigned to you.</p>
              <Link href="/" className="mt-2 inline-block text-sm text-primary hover:underline">
                Browse projects
              </Link>
            </div>
          ) : (
            <TaskListView
              tasks={tasks as any[]}
              isLoading={loading}
              error={error as Error | null}
              onRetry={() => refetch()}
              onTaskClick={setSelectedTaskId}
              onStatusChange={changeStatus}
              showProject
              defaultSortKey="due_date"
            />
          )}
        </div>
      </div>

      {selectedTaskId && selectedTask && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {createOpen && (
        <TaskForm
          initialStatus="todo"
          assignToMe
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
