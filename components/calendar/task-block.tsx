'use client'

// 時間グリッド上の予定ブロック。ドラッグとリサイズは後続タスクで追加する。
import { cn } from '@/lib/utils'
import { minutesToPx } from '@/lib/calendar/schedule'
import type { PositionedBlock } from '@/lib/calendar/layout'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

const PRIORITY_ACCENT: Record<string, string> = {
  low: 'border-l-blue-400',
  medium: 'border-l-yellow-400',
  high: 'border-l-orange-400',
  urgent: 'border-l-red-400',
}

interface TaskBlockProps {
  task: CalendarTask
  position: PositionedBlock
  onClick: () => void
}

export default function TaskBlock({ task, position, onClick }: TaskBlockProps) {
  const done = task.status === 'done'
  const top = minutesToPx(position.startMinutes)
  const height = Math.max(18, minutesToPx(position.endMinutes - position.startMinutes) - 2)
  const widthPercent = 100 / position.columnCount
  const startLabel = task.scheduled_start_time
    ? task.scheduled_start_time.slice(0, 5)
    : ''

  return (
    <div
      style={{
        top,
        height,
        left: `${position.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
      className="absolute px-px"
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded border border-l-2 border-border bg-card px-1.5 py-0.5 text-left shadow-sm transition-colors hover:bg-accent',
          PRIORITY_ACCENT[task.priority] ?? 'border-l-border',
          done && 'opacity-50'
        )}
      >
        <span className={cn('truncate text-[11px] font-medium leading-tight', done && 'line-through')}>
          {task.title}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {startLabel}
          {task.project?.name ? ` · ${task.project.name}` : ''}
        </span>
      </button>
    </div>
  )
}
