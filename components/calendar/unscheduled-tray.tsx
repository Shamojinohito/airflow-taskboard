'use client'

// まだ予定に入っていないタスクの置き場。ここからカレンダーへドラッグして割り当てる。
import { Inbox } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

const PRIORITY_ACCENT: Record<string, string> = {
  low: 'border-l-blue-400',
  medium: 'border-l-yellow-400',
  high: 'border-l-orange-400',
  urgent: 'border-l-red-400',
}

interface UnscheduledTrayProps {
  tasks: CalendarTask[]
  isLoading: boolean
  onTaskClick: (taskId: string) => void
}

export function UnscheduledTaskCard({
  task, onClick,
}: { task: CalendarTask; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border border-l-2 border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent',
        PRIORITY_ACCENT[task.priority] ?? 'border-l-border'
      )}
    >
      <div className="truncate text-xs font-medium">{task.title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{task.project?.name ?? ''}</span>
        {task.due_date && (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            due {task.due_date.slice(5)}
          </Badge>
        )}
      </div>
    </button>
  )
}

export default function UnscheduledTray({ tasks, isLoading, onTaskClick }: UnscheduledTrayProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Inbox size={15} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Unscheduled</span>
        <Badge variant="outline" className="ml-auto px-1.5 py-0 text-[10px]">
          {tasks.length}
        </Badge>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {isLoading && (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}
        {!isLoading && tasks.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            すべてのタスクが予定に入っています。
          </p>
        )}
        {tasks.map(task => (
          <UnscheduledTaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task.id)}
          />
        ))}
      </div>
    </div>
  )
}
