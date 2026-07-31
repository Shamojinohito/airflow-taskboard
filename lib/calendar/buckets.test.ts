import { describe, expect, it } from 'vitest'
import { bucketTasksByDay } from './buckets'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

function makeTask(overrides: Partial<CalendarTask> & { id: string }): CalendarTask {
  return {
    project_id: 'p1',
    parent_task_id: null,
    title: `task-${overrides.id}`,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    scheduled_date: null,
    scheduled_start_time: null,
    scheduled_end_time: null,
    assignee_user_id: null,
    assignee_agent_id: null,
    project: null,
    task_tags: [],
    assignee_agent: null,
    ...overrides,
  }
}

const DATE_KEYS = ['2026-08-03', '2026-08-04', '2026-08-05']

describe('bucketTasksByDay', () => {
  it('開始・終了時刻が両方あるタスクは timed に入る', () => {
    const task = makeTask({
      id: 't1', scheduled_date: '2026-08-03', scheduled_start_time: '09:00', scheduled_end_time: '10:00',
    })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    expect(buckets.get('2026-08-03')?.timed).toEqual([task])
    expect(buckets.get('2026-08-03')?.allDay).toEqual([])
  })

  it('時刻のない予定日のみのタスクは allDay に入る', () => {
    const task = makeTask({ id: 't2', scheduled_date: '2026-08-03' })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    expect(buckets.get('2026-08-03')?.allDay).toEqual([task])
    expect(buckets.get('2026-08-03')?.timed).toEqual([])
  })

  it('締切のみのタスクは due に入る', () => {
    const task = makeTask({ id: 't3', due_date: '2026-08-04' })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    expect(buckets.get('2026-08-04')?.due).toEqual([task])
    expect(buckets.get('2026-08-04')?.allDay).toEqual([])
    expect(buckets.get('2026-08-04')?.timed).toEqual([])
  })

  it('予定日と締切日が範囲内の別日なら、両方の日のバケットに現れる', () => {
    const task = makeTask({
      id: 't4', scheduled_date: '2026-08-03', scheduled_start_time: '09:00', scheduled_end_time: '10:00',
      due_date: '2026-08-05',
    })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    expect(buckets.get('2026-08-03')?.timed).toEqual([task])
    expect(buckets.get('2026-08-05')?.due).toEqual([task])
  })

  it('渡した日付の範囲外の予定・締切はどのバケットにも入らない', () => {
    const task = makeTask({ id: 't5', scheduled_date: '2026-09-01', due_date: '2026-09-02' })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    for (const dateKey of DATE_KEYS) {
      const bucket = buckets.get(dateKey)!
      expect(bucket.allDay).toEqual([])
      expect(bucket.timed).toEqual([])
      expect(bucket.due).toEqual([])
    }
  })

  it('完了済み（done）タスクも通常どおりバケットに入る', () => {
    const task = makeTask({
      id: 't6', status: 'done', scheduled_date: '2026-08-03', scheduled_start_time: '09:00', scheduled_end_time: '10:00',
    })
    const buckets = bucketTasksByDay(DATE_KEYS, [task])
    expect(buckets.get('2026-08-03')?.timed).toEqual([task])
  })
})
