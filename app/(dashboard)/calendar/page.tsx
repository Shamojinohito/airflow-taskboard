'use client'

import { useMemo, useState } from 'react'
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfWeek, format,
  startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { Inbox } from 'lucide-react'
import AssignTaskDialog from '@/components/calendar/assign-task-dialog'
import CalendarHeader, { type CalendarMode } from '@/components/calendar/calendar-header'
import UnscheduledTray from '@/components/calendar/unscheduled-tray'
import WeekView from '@/components/calendar/week-view'
import TaskDetailPanel from '@/components/tasks/task-detail-panel'
import { buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCalendarTasks, useScheduleTask, useUnscheduledTasks, type CalendarTask } from '@/hooks/use-calendar-tasks'
import { useProjects } from '@/hooks/use-projects'
import { useCalendarRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'

/** 週の開始は日曜（既存の DatePicker と揃える） */
const WEEK_OPTIONS = { weekStartsOn: 0 } as const

export default function CalendarPage() {
  const [mode, setMode] = useState<CalendarMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<{ date: string; startMinutes: number | null } | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
  const { projects } = useProjects()
  useCalendarRealtime()

  const { rangeStart, rangeEnd, days, rangeLabel } = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(anchorDate, WEEK_OPTIONS)
      const end = endOfWeek(anchorDate, WEEK_OPTIONS)
      return {
        rangeStart: format(start, 'yyyy-MM-dd'),
        rangeEnd: format(end, 'yyyy-MM-dd'),
        days: Array.from({ length: 7 }, (_, index) => addDays(start, index)),
        rangeLabel: `${format(start, 'yyyy.MM.dd')} – ${format(end, 'MM.dd')}`,
      }
    }

    const start = startOfWeek(startOfMonth(anchorDate), WEEK_OPTIONS)
    const end = endOfWeek(endOfMonth(anchorDate), WEEK_OPTIONS)
    // endOfWeek は 23:59:59.999 を返すため ms 差の割り算では1日多く数えてしまう。
    // 暦日の差で数える
    const dayCount = differenceInCalendarDays(end, start) + 1
    return {
      rangeStart: format(start, 'yyyy-MM-dd'),
      rangeEnd: format(end, 'yyyy-MM-dd'),
      days: Array.from({ length: dayCount }, (_, index) => addDays(start, index)),
      rangeLabel: format(anchorDate, 'yyyy.MM'),
    }
  }, [mode, anchorDate])

  const { tasks } = useCalendarTasks(rangeStart, rangeEnd)

  const { tasks: unscheduledTasks, isLoading: unscheduledLoading } = useUnscheduledTasks()
  const { scheduleTask } = useScheduleTask(rangeStart, rangeEnd)

  const visibleUnscheduled = useMemo(() => {
    if (selectedProjectIds.length === 0) return unscheduledTasks
    return unscheduledTasks.filter(task => selectedProjectIds.includes(task.project_id))
  }, [unscheduledTasks, selectedProjectIds])

  const visibleTasks = useMemo(() => {
    if (selectedProjectIds.length === 0) return tasks
    return tasks.filter(task => selectedProjectIds.includes(task.project_id))
  }, [tasks, selectedProjectIds])

  const step = (direction: 1 | -1) => {
    setAnchorDate(current => mode === 'week'
      ? addDays(current, 7 * direction)
      : direction === 1 ? addMonths(current, 1) : subMonths(current, 1))
  }

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds(current => current.includes(projectId)
      ? current.filter(id => id !== projectId)
      : [...current, projectId])
  }

  const selectedTask =
    visibleTasks.find((task: CalendarTask) => task.id === selectedTaskId) ??
    visibleUnscheduled.find((task: CalendarTask) => task.id === selectedTaskId)

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <CalendarHeader
          mode={mode}
          onModeChange={setMode}
          rangeLabel={rangeLabel}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setAnchorDate(new Date())}
          projects={(projects as { id: string; name: string }[]) ?? []}
          selectedProjectIds={selectedProjectIds}
          onToggleProject={toggleProject}
          onClearProjectFilter={() => setSelectedProjectIds([])}
        />

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
            <UnscheduledTray
              tasks={visibleUnscheduled}
              isLoading={unscheduledLoading}
              onTaskClick={setSelectedTaskId}
            />
          </aside>
          <div className="flex-1 overflow-x-auto">
            <WeekView
              days={days}
              tasks={visibleTasks}
              onTaskClick={setSelectedTaskId}
              onSchedule={scheduleTask}
              onSlotSelect={(date, startMinutes) => setAssignTarget({ date, startMinutes })}
            />
          </div>
        </div>
      </div>

      {selectedTaskId && selectedTask && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
        <SheetTrigger
          className={cn(buttonVariants({ size: 'sm' }), 'fixed bottom-4 right-4 z-20 gap-1.5 shadow-lg lg:hidden')}
        >
          <Inbox size={14} />
          Unscheduled
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[70vh] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Unscheduled tasks</SheetTitle>
          </SheetHeader>
          <UnscheduledTray
            tasks={visibleUnscheduled}
            isLoading={unscheduledLoading}
            onTaskClick={taskId => {
              setTrayOpen(false)
              setSelectedTaskId(taskId)
            }}
          />
        </SheetContent>
      </Sheet>

      <AssignTaskDialog
        open={assignTarget !== null}
        onOpenChange={open => { if (!open) setAssignTarget(null) }}
        tasks={visibleUnscheduled}
        defaultDate={assignTarget?.date ?? rangeStart}
        defaultStartMinutes={assignTarget?.startMinutes ?? null}
        onAssign={scheduleTask}
      />
    </div>
  )
}
