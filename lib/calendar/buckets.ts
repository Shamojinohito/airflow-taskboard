// 日付ごとに「終日予定 / 締切 / 時間ブロック」へ振り分ける純関数。
// React に依存しないので vitest で直接検証できる。
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

export interface DayBuckets {
  allDay: CalendarTask[]
  due: CalendarTask[]
  timed: CalendarTask[]
}

/**
 * 日付ごとに「終日予定 / 締切 / 時間ブロック」へ振り分ける。
 * dateKeys は 'YYYY-MM-DD' の文字列（呼び出し側で date-fns の format 済みのものを渡す）。
 * 同じタスクが scheduled_date と due_date の両方で（別々の日に）出ることがある。
 */
export function bucketTasksByDay(dateKeys: string[], tasks: CalendarTask[]): Map<string, DayBuckets> {
  const buckets = new Map<string, DayBuckets>()
  for (const dateKey of dateKeys) {
    buckets.set(dateKey, { allDay: [], due: [], timed: [] })
  }

  for (const task of tasks) {
    if (task.scheduled_date) {
      const bucket = buckets.get(task.scheduled_date)
      if (bucket) {
        if (task.scheduled_start_time && task.scheduled_end_time) bucket.timed.push(task)
        else bucket.allDay.push(task)
      }
    }
    if (task.due_date) {
      const bucket = buckets.get(task.due_date)
      if (bucket) bucket.due.push(task)
    }
  }

  return buckets
}
