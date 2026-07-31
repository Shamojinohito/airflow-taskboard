'use client'

// 空きスロットのタップから開く割り当てダイアログ。ドラッグできない環境の代替経路。
import { useState } from 'react'
import DatePicker from '@/components/tasks/date-picker'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { minutesToTime, SLOT_MINUTES, buildAllDaySchedule, buildTimedSchedule, type TaskSchedule } from '@/lib/calendar/schedule'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 00:00 から 23:30 までの 30分刻み */
const TIME_OPTIONS = Array.from(
  { length: (24 * 60) / SLOT_MINUTES },
  (_, index) => index * SLOT_MINUTES,
)

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240]

interface AssignTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: CalendarTask[]
  defaultDate: string
  /** null なら終日として開く */
  defaultStartMinutes: number | null
  onAssign: (task: CalendarTask, schedule: TaskSchedule) => void
}

export default function AssignTaskDialog({
  open, onOpenChange, tasks, defaultDate, defaultStartMinutes, onAssign,
}: AssignTaskDialogProps) {
  const [date, setDate] = useState(defaultDate)
  const [startMinutes, setStartMinutes] = useState<number | null>(defaultStartMinutes)
  const [durationMinutes, setDurationMinutes] = useState(60)

  // open / defaultDate / defaultStartMinutes の変化をレンダー中に検知してフォームをリセットする。
  // useEffect 内での setState はカスケード再レンダーを招くため使わない（react-hooks/set-state-in-effect）。
  const [prevProps, setPrevProps] = useState({ open, defaultDate, defaultStartMinutes })
  if (
    prevProps.open !== open ||
    prevProps.defaultDate !== defaultDate ||
    prevProps.defaultStartMinutes !== defaultStartMinutes
  ) {
    setPrevProps({ open, defaultDate, defaultStartMinutes })
    if (open) {
      setDate(defaultDate)
      setStartMinutes(defaultStartMinutes)
      setDurationMinutes(60)
    }
  }

  const assign = (task: CalendarTask) => {
    const schedule = startMinutes === null
      ? buildAllDaySchedule(date)
      : buildTimedSchedule(date, startMinutes, durationMinutes)
    onAssign(task, schedule)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>タスクを予定に入れる</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>日付</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-start">開始</Label>
              <select
                id="assign-start"
                value={startMinutes === null ? 'all-day' : String(startMinutes)}
                onChange={event => setStartMinutes(
                  event.target.value === 'all-day' ? null : Number(event.target.value)
                )}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="all-day">終日</option>
                {TIME_OPTIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{minutesToTime(minutes)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-duration">長さ</Label>
              <select
                id="assign-duration"
                value={durationMinutes}
                disabled={startMinutes === null}
                onChange={event => setDurationMinutes(Number(event.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
              >
                {DURATION_OPTIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{minutes}分</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>タスク</Label>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="タスクを検索..." />
              <CommandList className="max-h-56">
                <CommandEmpty>該当するタスクがありません。</CommandEmpty>
                <CommandGroup>
                  {tasks.map(task => (
                    <CommandItem
                      key={task.id}
                      value={`${task.title} ${task.project?.name ?? ''}`}
                      onSelect={() => assign(task)}
                    >
                      <span className="truncate">{task.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {task.project?.name ?? ''}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
