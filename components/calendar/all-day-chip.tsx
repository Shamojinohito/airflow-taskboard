'use client'

// 終日行の予定チップ。ドラッグで別の日・時間枠・Unscheduled トレイへ移せる。
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import ChipMenu from '@/components/calendar/chip-menu'
import { CLEARED_SCHEDULE, type TaskSchedule } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

interface AllDayChipProps {
  task: CalendarTask
  onClick: () => void
  onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void
}

export default function AllDayChip({ task, onClick, onSchedule }: AllDayChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    // 終日行のドロップ先 ID（calendar-allday-<date>）と衝突しないよう block を挟む
    id: `calendar-allday-block-${task.id}`,
    data: { type: 'task', source: 'calendar', task },
  })
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="group relative"
      onContextMenu={event => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        onClick={onClick}
        title={task.title}
        {...listeners}
        {...attributes}
        className={cn(
          'w-full cursor-grab truncate rounded border border-border bg-card py-0.5 pl-1.5 pr-5 text-left text-[11px] hover:bg-accent active:cursor-grabbing',
          task.status === 'done' && 'opacity-50 line-through',
          isDragging && 'opacity-40'
        )}
      >
        {task.title}
      </button>

      <ChipMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onOpenDetail={onClick}
        onUnschedule={() => onSchedule(task, CLEARED_SCHEDULE)}
      />
    </div>
  )
}
