'use client'

// 月ビュー（俯瞰用）。セル内は 終日予定 → 時間ブロック（開始時刻順）で並べ、
// 入りきらない分は「他 N 件」に畳む。日付をクリックすると週ビューへ移る。
import { useMemo } from 'react'
import { format, isSameMonth, isToday } from 'date-fns'
import DueChip from '@/components/calendar/due-chip'
import { bucketTasksByDay } from '@/lib/calendar/buckets'
import { timeToMinutes } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 1セルに出すチップ（予定 + 締切）の上限 */
const MAX_CHIPS_PER_DAY = 3

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface MonthViewProps {
  days: Date[]
  month: Date
  tasks: CalendarTask[]
  onTaskClick: (task: CalendarTask) => void
  onDaySelect: (date: Date) => void
}

type Chip = { kind: 'scheduled'; task: CalendarTask } | { kind: 'due'; task: CalendarTask }

export default function MonthView({ days, month, tasks, onTaskClick, onDaySelect }: MonthViewProps) {
  const dateKeys = useMemo(() => days.map(day => format(day, 'yyyy-MM-dd')), [days])
  const buckets = useMemo(() => bucketTasksByDay(dateKeys, tasks), [dateKeys, tasks])

  return (
    <div className="flex h-full min-w-[640px] flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map(weekday => (
          <div key={weekday} className="px-2 py-1.5 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const bucket = buckets.get(dateKey)
          // 終日予定 → 時間ブロック（開始時刻順）→ 締切チップ。折り畳みは合計件数に対して掛ける
          const chips: Chip[] = [
            ...(bucket?.allDay ?? []).map(task => ({ kind: 'scheduled', task }) as const),
            ...[...(bucket?.timed ?? [])]
              .sort((a, b) => timeToMinutes(a.scheduled_start_time!) - timeToMinutes(b.scheduled_start_time!))
              .map(task => ({ kind: 'scheduled', task }) as const),
            ...(bucket?.due ?? []).map(task => ({ kind: 'due', task }) as const),
          ]
          const shown = chips.slice(0, MAX_CHIPS_PER_DAY)
          const hiddenCount = chips.length - shown.length

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-24 space-y-1 border-b border-r border-border p-1',
                !isSameMonth(day, month) && 'bg-muted/30'
              )}
            >
              <button
                type="button"
                onClick={() => onDaySelect(day)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold hover:bg-accent',
                  isToday(day) && 'bg-primary text-primary-foreground hover:bg-primary',
                  !isSameMonth(day, month) && 'text-muted-foreground'
                )}
              >
                {format(day, 'd')}
              </button>

              {shown.map(chip => chip.kind === 'due' ? (
                <DueChip key={`d-${chip.task.id}`} task={chip.task} onClick={() => onTaskClick(chip.task)} />
              ) : (
                <button
                  key={`s-${chip.task.id}`}
                  type="button"
                  onClick={() => onTaskClick(chip.task)}
                  className={cn(
                    'flex w-full items-center gap-1 truncate rounded border border-border bg-card px-1 py-0.5 text-left text-[10px] hover:bg-accent',
                    chip.task.status === 'done' && 'opacity-50 line-through'
                  )}
                >
                  {chip.task.scheduled_start_time && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {chip.task.scheduled_start_time.slice(0, 5)}
                    </span>
                  )}
                  <span className="truncate">{chip.task.title}</span>
                </button>
              ))}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => onDaySelect(day)}
                  className="w-full px-1 text-left text-[10px] text-muted-foreground hover:text-foreground"
                >
                  他 {hiddenCount} 件
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
