import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** イベントをまとめる窓。この時間内の変更は refetch 1回に集約される */
const COALESCE_MS = 300

/**
 * postgres_changes は 1 行の変更ごとにイベントが飛ぶ。エージェントの一括更新や
 * ドラッグでの並べ替えのように短時間に数十件が流れると、invalidateQueries が
 * 同じ回数だけ全件 refetch を起こして描画が固まる。
 * 最初のイベントで 1 回だけ refetch を予約し、窓の間に来た分は吸収する。
 */
function useCoalescedInvalidate(queryKeys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 配列リテラルを渡す呼び出し側でも useCallback が作り直されないよう、値で比較する
  const serializedKeys = JSON.stringify(queryKeys)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return useCallback(() => {
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      for (const queryKey of JSON.parse(serializedKeys) as unknown[][]) {
        queryClient.invalidateQueries({ queryKey })
      }
    }, COALESCE_MS)
  }, [queryClient, serializedKeys])
}

export function useTasksRealtime(projectId: string) {
  const queryClient = useQueryClient()
  const supabase = createClient()
  // キャッシュへの patch は即時。refetch を伴う invalidate だけまとめる
  // （['tasks', projectId] は前方一致なので with-subtasks 側も巻き込む）
  const invalidateAll = useCoalescedInvalidate([['tasks', projectId]])
  const invalidateWithSubtasks = useCoalescedInvalidate([['tasks', projectId, 'with-subtasks']])

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

        if (payload.eventType === 'INSERT') {
          if (payload.new.parent_task_id) {
            invalidateAll()
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            if (current.some((task: any) => task.id === payload.new.id)) {
              return current
            }
            return [...current, { ...payload.new, task_tags: [], task_links: [], assignee_agent: null }]
          })
          invalidateWithSubtasks()
          return
        }

        if (payload.eventType === 'UPDATE') {
          if (payload.new.parent_task_id) {
            invalidateAll()
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            return current.map((task: any) =>
              task.id === payload.new.id ? { ...task, ...payload.new } : task
            )
          })
          invalidateWithSubtasks()
          return
        }

        if (payload.eventType === 'DELETE') {
          if (payload.old.parent_task_id) {
            invalidateAll()
            return
          }

          queryClient.setQueryData(queryKey, (current: unknown) => {
            if (!Array.isArray(current)) return current
            return current.filter((task: any) => task.id !== payload.old.id)
          })
          invalidateWithSubtasks()
          return
        }

        queryClient.invalidateQueries({ queryKey, refetchType: 'inactive' })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, queryClient, invalidateAll, invalidateWithSubtasks])
}

export function useInboxRealtime() {
  const supabase = createClient()
  const invalidate = useCoalescedInvalidate([['triage-inbox']])

  useEffect(() => {
    const channel = supabase
      .channel('triage-inbox')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // Inbox rows join project/tags/agent data the payload lacks, so refetch instead of patching
        invalidate()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invalidate])
}

export function useTodayRealtime() {
  const supabase = createClient()
  const invalidate = useCoalescedInvalidate([['today-tasks']])

  useEffect(() => {
    const channel = supabase
      .channel('today-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // Today rows join project/tags/agent data the payload lacks, so refetch instead of patching
        invalidate()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invalidate])
}

export function useCalendarRealtime() {
  const supabase = createClient()
  const invalidate = useCoalescedInvalidate([['calendar-tasks'], ['unscheduled-tasks']])

  useEffect(() => {
    const channel = supabase
      .channel('calendar-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // カレンダー行は project/tags/agent の join を含み payload には無いため、patch せず refetch する
        invalidate()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invalidate])
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
