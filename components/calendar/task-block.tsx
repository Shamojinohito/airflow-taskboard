'use client'

// 時間グリッド上の予定ブロック。ドラッグ・リサイズ・右クリックメニューに対応する。
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import ChipMenu from '@/components/calendar/chip-menu'
import { cn } from '@/lib/utils'
import {
  buildTimedSchedule, CLEARED_SCHEDULE, DEFAULT_BLOCK_MINUTES, getDurationMinutes, minutesToPx,
  pxToMinutes, snapDurationMinutes, timeToMinutes, type TaskSchedule,
} from '@/lib/calendar/schedule'
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
  onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void
}

export default function TaskBlock({ task, position, onClick, onSchedule }: TaskBlockProps) {
  const durationMinutes = getDurationMinutes(task) ?? undefined
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `calendar-block-${task.id}`,
    data: { type: 'task', source: 'calendar', durationMinutes, task },
  })

  // リサイズ中はローカルの長さで描画し、pointerup で初めて保存する
  const [draftDuration, setDraftDuration] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const savedDuration = getDurationMinutes(task) ?? DEFAULT_BLOCK_MINUTES
  const shownDuration = draftDuration ?? savedDuration

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const originDuration = savedDuration
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = pxToMinutes(moveEvent.clientY - startY)
      setDraftDuration(snapDurationMinutes(originDuration + delta))
    }

    const cleanup = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      target.removeEventListener('pointercancel', handleCancel)
    }

    const handleUp = (upEvent: PointerEvent) => {
      cleanup()
      const delta = pxToMinutes(upEvent.clientY - startY)
      const nextDuration = snapDurationMinutes(originDuration + delta)
      setDraftDuration(null)
      if (nextDuration !== originDuration && task.scheduled_date && task.scheduled_start_time) {
        onSchedule(task, buildTimedSchedule(
          task.scheduled_date,
          timeToMinutes(task.scheduled_start_time),
          nextDuration,
        ))
      }
    }

    // ジェスチャーが取り消された場合はリサイズを破棄するだけで、保存はしない
    const handleCancel = () => {
      cleanup()
      setDraftDuration(null)
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
    target.addEventListener('pointercancel', handleCancel)
  }

  const done = task.status === 'done'
  const top = minutesToPx(position.startMinutes)
  const height = Math.max(18, minutesToPx(shownDuration) - 2)
  const widthPercent = 100 / position.columnCount
  const startLabel = task.scheduled_start_time ? task.scheduled_start_time.slice(0, 5) : ''

  return (
    <div
      style={{
        top,
        height,
        left: `${position.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
      className="group absolute px-px"
      onContextMenu={event => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        onClick={onClick}
        {...listeners}
        {...attributes}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded border border-l-2 border-border bg-card px-1.5 py-0.5 text-left shadow-sm transition-colors hover:bg-accent',
          PRIORITY_ACCENT[task.priority] ?? 'border-l-border',
          done && 'opacity-50',
          isDragging && 'opacity-40'
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

      <ChipMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onOpenDetail={onClick}
        onUnschedule={() => onSchedule(task, CLEARED_SCHEDULE)}
      />

      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize rounded-b bg-transparent hover:bg-primary/40"
      />
    </div>
  )
}
