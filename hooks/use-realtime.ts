import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useTasksRealtime(projectId: string) {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`tasks:${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        const queryKey = ['tasks', projectId]
        const tasksWithSubtasksKey = ['tasks', projectId, 'with-subtasks']

        if (payload.eventType === 'INSERT') {
          if (payload.new.parent_task_id) {
            queryClient.invalidateQueries({ queryKey })
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            if (current.some((task: any) => task.id === payload.new.id)) {
              return current
            }
            return [...current, { ...payload.new, task_tags: [], task_links: [], assignee_agent: null }]
          })
          queryClient.invalidateQueries({ queryKey: tasksWithSubtasksKey })
          return
        }

        if (payload.eventType === 'UPDATE') {
          if (payload.new.parent_task_id) {
            queryClient.invalidateQueries({ queryKey })
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            return current.map((task: any) =>
              task.id === payload.new.id ? { ...task, ...payload.new } : task
            )
          })
          queryClient.invalidateQueries({ queryKey: tasksWithSubtasksKey })
          return
        }

        if (payload.eventType === 'DELETE') {
          if (payload.old.parent_task_id) {
            queryClient.invalidateQueries({ queryKey })
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            return current.filter((task: any) => task.id !== payload.old.id)
          })
          queryClient.invalidateQueries({ queryKey: tasksWithSubtasksKey })
          return
        }

        queryClient.invalidateQueries({ queryKey, refetchType: 'inactive' })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, queryClient])
}

export function useInboxRealtime() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('triage-inbox')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // Inbox rows join project/tags/agent data the payload lacks, so refetch instead of patching
        queryClient.invalidateQueries({ queryKey: ['triage-inbox'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}

export function useTodayRealtime() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('today-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // Today rows join project/tags/agent data the payload lacks, so refetch instead of patching
        queryClient.invalidateQueries({ queryKey: ['today-tasks'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}

export function useCalendarRealtime() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('calendar-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // カレンダー行は project/tags/agent の join を含み payload には無いため、patch せず refetch する
        queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
        queryClient.invalidateQueries({ queryKey: ['unscheduled-tasks'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}

export function useAgentRunsRealtime() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('agent-runs')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_runs',
      }, (payload) => {
        const queryKey = ['agent-runs']

        if (payload.eventType === 'INSERT') {
          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            if (current.some((run: any) => run.id === payload.new.id)) return current
            return [payload.new, ...current].slice(0, 50)
          })
          return
        }

        if (payload.eventType === 'UPDATE') {
          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            return current.map((run: any) =>
              run.id === payload.new.id ? { ...run, ...payload.new } : run
            )
          })
          return
        }

        queryClient.invalidateQueries({ queryKey, refetchType: 'inactive' })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
