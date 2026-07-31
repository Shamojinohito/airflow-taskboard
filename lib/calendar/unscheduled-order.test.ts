import { describe, expect, it } from 'vitest'
import { compareUnscheduledTasks } from './unscheduled-order'

const task = (due_date: string | null, priority: string, title: string) =>
  ({ due_date, priority, title })

describe('compareUnscheduledTasks', () => {
  it('締切が近い順', () => {
    const sorted = [
      task('2026-08-10', 'low', 'b'),
      task('2026-08-01', 'low', 'a'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['a', 'b'])
  })

  it('締切なしは最後', () => {
    const sorted = [
      task(null, 'urgent', 'none'),
      task('2026-12-31', 'low', 'far'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['far', 'none'])
  })

  it('締切が同じなら優先度の高い順', () => {
    const sorted = [
      task('2026-08-01', 'low', 'low'),
      task('2026-08-01', 'urgent', 'urgent'),
      task('2026-08-01', 'medium', 'medium'),
      task('2026-08-01', 'high', 'high'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['urgent', 'high', 'medium', 'low'])
  })

  it('締切も優先度も同じならタイトル順', () => {
    const sorted = [
      task('2026-08-01', 'medium', 'ぶ'),
      task('2026-08-01', 'medium', 'あ'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['あ', 'ぶ'])
  })

  it('未知の優先度・null でも落ちない', () => {
    const sorted = [
      task(null, 'unknown', 'x'),
      task(null, 'urgent', 'y'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['y', 'x'])
  })
})
