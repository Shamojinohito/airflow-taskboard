// hooks/use-tasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TaskStatus } from '@/lib/task-status'

export type { TaskStatus }

interface UseTasksOptions {
  includeSubtasks?: boolean
}

function withSubtaskCounts(tasks: any[]) {
  const counts = new Map<string, { total: number; done: number }>()

  for (const task of tasks) {
    if (!task.parent_task_id) continue
    const current = counts.get(task.parent_task_id) ?? { total: 0, done: 0 }
    current.total += 1
    if (task.status === 'done') current.done += 1
    counts.set(task.parent_task_id, current)
  }

  return tasks.map(task => {
    const subtaskCount = counts.get(task.id) ?? { total: 0, done: 0 }
    return {
      ...task,
      subtask_count: subtaskCount.total,
      completed_subtask_count: subtaskCount.done,
      is_subtask: Boolean(task.parent_task_id),
    }
  })
}

export function useTasks(projectId: string, options: UseTasksOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const queryClient = useQueryClient()
  const includeSubtasks = options.includeSubtasks ?? false
  const queryKey = includeSubtasks ? ['tasks', projectId, 'with-subtasks'] : ['tasks', projectId]

  const { data: tasks = [], isLoading, error, refetch } = useQuery({
    queryKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async (): Promise<any[]> => {
      // description はボード/リストのどこにも描画されない（詳細パネルと編集フォームは
      // 自分で該当行を select し直す）。タスク1件あたり最も重いテキスト列なので取らない
      const query = supabase
        .from('tasks')
        .select(`
          id,
          project_id,
          parent_task_id,
          title,
          status,
          priority,
          action_type,
          handoff_note,
          blocked_reason,
          assignee_user_id,
          assignee_agent_id,
          due_date,
          position,
          created_at,
          updated_at,
          task_tags(tag_id, tags(id, name, color)),
          task_links(id, url, title),
          assignee_agent:assignee_agent_id(id, name, type)
        `)
        .eq('project_id', projectId)
        .order('position', { ascending: true })

      const { data, error } = await query
      if (error) throw error

      const enrichedTasks = withSubtaskCounts(data ?? [])
      return includeSubtasks
        ? enrichedTasks
        : enrichedTasks.filter(task => !task.parent_task_id)
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId)
      if (error) throw error
    },
    onMutate: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      await queryClient.cancelQueries({ queryKey })
      const previousTasks = queryClient.getQueryData(queryKey)

      queryClient.setQueryData(queryKey, (current: unknown) => {
        if (!Array.isArray(current)) return current
        return current.map((task: any) =>
          task.id === taskId ? { ...task, status } : task
        )
      })

      return { previousTasks }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(queryKey, context.previousTasks)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      queryClient.invalidateQueries({ queryKey: ['triage-inbox'] })
    },
  })

  return { tasks, isLoading, error, updateStatus, refetch }
}
