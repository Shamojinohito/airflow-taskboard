'use client'

// 締切マーカー。作業予定ブロックとは別スタイル（旗アイコン付きの細いチップ）で終日行に出す。
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

interface DueChipProps {
  task: CalendarTask
  onClick: () => void
}

export default function DueChip({ task, onClick }: DueChipProps) {
  const done = task.status === 'done'

  return (
    <button
      type="button"
      onClick={onClick}
      title={`締切: ${task.title}`}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-left text-[11px] text-rose-500 hover:bg-rose-500/20',
        done && 'opacity-50 line-through'
      )}
    >
      <Flag size={10} className="shrink-0" />
      <span className="truncate">{task.title}</span>
    </button>
  )
}
