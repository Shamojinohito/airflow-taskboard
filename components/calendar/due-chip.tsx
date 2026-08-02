'use client'

// 締切マーカー。作業予定ブロックとは別スタイル（旗アイコン付きの細いチップ）で終日行に出す。
// ドラッグすると動くのは締切日そのもの（掴んだチップが移る）。作業予定は変わらない。
import { useDraggable } from '@dnd-kit/core'
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

interface DueChipProps {
  task: CalendarTask
  onClick: () => void
}

export default function DueChip({ task, onClick }: DueChipProps) {
  const done = task.status === 'done'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `calendar-due-${task.id}`,
    data: { type: 'task', source: 'calendar-due', task },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      title={`締切: ${task.title}`}
      {...listeners}
      {...attributes}
      className={cn(
        'flex w-full cursor-grab items-center gap-1 truncate rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-left text-[11px] text-rose-500 hover:bg-rose-500/20 active:cursor-grabbing',
        done && 'opacity-50 line-through',
        isDragging && 'opacity-40'
      )}
    >
      <Flag size={10} className="shrink-0" />
      <span className="truncate">{task.title}</span>
    </button>
  )
}
