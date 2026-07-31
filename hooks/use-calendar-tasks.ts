// hooks/use-calendar-tasks.ts
// カレンダーの取得と更新。表示範囲に「作業予定が入る」か「締切が入る」タスクを1クエリで取得する。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isValidSchedule, type TaskSchedule } from '@/lib/calendar/schedule'
import { compareUnscheduledTasks } from '@/lib/calendar/unscheduled-order'

export interface CalendarTask {
  id: string
  project_id: string
  parent_task_id: string | null
  title: string
  status: string
  priority: string
  due_date: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  assignee_user_id: string | null
  assignee_agent_id: string | null
  project: { name: string } | null
  task_tags: { tags: { id: string; name: string; color: string } | null }[]
  assignee_agent: { id: string; name: string; type: string } | null
}

const CALENDAR_TASK_SELECT = `
  id,
  project_id,
  parent_task_id,
  title,
  status,
  priority,
  due_date,
  scheduled_date,
  scheduled_start_time,
  scheduled_end_time,
  assignee_user_id,
  assignee_agent_id,
  project:project_id(name),
  task_tags(tag_id, tags(id, name, color)),
  assignee_agent:assignee_agent_id(id, name, type)
`

export const UNSCHEDULED_TASKS_KEY = ['unscheduled-tasks'] as const

export function calendarTasksKey(rangeStart: string, rangeEnd: string) {
  return ['calendar-tasks', rangeStart, rangeEnd] as const
}

/** 表示範囲に作業予定または締切が入る親タスク */
export function useCalendarTasks(rangeStart: string, rangeEnd: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: tasks = [], isLoading, error, refetch } = useQuery({
    queryKey: calendarTasksKey(rangeStart, rangeEnd),
    queryFn: async (): Promise<CalendarTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(CALENDAR_TASK_SELECT)
        .is('parent_task_id', null)
        .or(
          `and(scheduled_date.gte.${rangeStart},scheduled_date.lte.${rangeEnd}),` +
          `and(due_date.gte.${rangeStart},due_date.lte.${rangeEnd})`
        )

      if (error) throw error
      return (data ?? []) as CalendarTask[]
    },
    enabled: Boolean(rangeStart && rangeEnd),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return { tasks: tasks as CalendarTask[], isLoading, error: error as Error | null, refetch }
}

/** まだ予定に入っていない未完了の親タスク */
export function useUnscheduledTasks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: UNSCHEDULED_TASKS_KEY,
    queryFn: async (): Promise<CalendarTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(CALENDAR_TASK_SELECT)
        .is('parent_task_id', null)
        .is('scheduled_date', null)
        .neq('status', 'done')
        // 上限100件の「選び方」を締切優先にする。優先度は TEXT で SQL 上意味のある順序にならないため、
        // ここでは締切のみで絞り込み、compareUnscheduledTasks でクライアント側の表示順を作る。
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(100)

      if (error) throw error
      return [...((data ?? []) as CalendarTask[])].sort(compareUnscheduledTasks)
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return { tasks: tasks as CalendarTask[], isLoading, error: error as Error | null }
}

/**
 * 予定の設定・移動・解除。カレンダーとトレイの両方のキャッシュを楽観的に書き換える。
 * 予定が付けばトレイから消え、外せばトレイに戻る。
 */
export function useScheduleTask(rangeStart: string, rangeEnd: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const queryClient = useQueryClient()
  const calendarKey = calendarTasksKey(rangeStart, rangeEnd)

  const mutation = useMutation({
    mutationFn: async ({ task, schedule }: { task: CalendarTask; schedule: TaskSchedule }) => {
      if (!isValidSchedule(schedule)) throw new Error('invalid schedule')
      const { error } = await supabase.from('tasks').update(schedule).eq('id', task.id)
      if (error) throw error
    },
    onMutate: async ({ task, schedule }: { task: CalendarTask; schedule: TaskSchedule }) => {
      await queryClient.cancelQueries({ queryKey: calendarKey })
      await queryClient.cancelQueries({ queryKey: UNSCHEDULED_TASKS_KEY })

      const previousCalendar = queryClient.getQueryData(calendarKey)
      const previousUnscheduled = queryClient.getQueryData(UNSCHEDULED_TASKS_KEY)
      const next = { ...task, ...schedule }

      queryClient.setQueryData(calendarKey, (current: unknown) => {
        if (!Array.isArray(current)) return current
        const without = current.filter((item: CalendarTask) => item.id !== task.id)
        // 予定が範囲内にある、または締切が範囲内にあるならカレンダーに残す
        const inRange =
          (next.scheduled_date !== null && next.scheduled_date >= rangeStart && next.scheduled_date <= rangeEnd) ||
          (next.due_date !== null && next.due_date >= rangeStart && next.due_date <= rangeEnd)
        return inRange ? [...without, next] : without
      })

      queryClient.setQueryData(UNSCHEDULED_TASKS_KEY, (current: unknown) => {
        if (!Array.isArray(current)) return current
        const without = current.filter((item: CalendarTask) => item.id !== task.id)
        if (next.scheduled_date !== null || next.status === 'done') return without
        return [...without, next].sort(compareUnscheduledTasks)
      })

      return { previousCalendar, previousUnscheduled }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCalendar !== undefined) {
        queryClient.setQueryData(calendarKey, context.previousCalendar)
      }
      if (context?.previousUnscheduled !== undefined) {
        queryClient.setQueryData(UNSCHEDULED_TASKS_KEY, context.previousUnscheduled)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
      queryClient.invalidateQueries({ queryKey: UNSCHEDULED_TASKS_KEY })
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.task.project_id] })
    },
  })

  return {
    scheduleTask: (task: CalendarTask, schedule: TaskSchedule) =>
      mutation.mutate({ task, schedule }),
    isPending: mutation.isPending,
  }
}
