'use client'

// 週ビュー: 上部に終日行（終日予定 + 締切チップ）、下に 7日 × 24時間のグリッド。
import { useEffect, useMemo, useRef } from 'react'
import { format, isToday } from 'date-fns'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import AllDayChip from '@/components/calendar/all-day-chip'
import DueChip from '@/components/calendar/due-chip'
import TaskBlock from '@/components/calendar/task-block'
import { bucketTasksByDay } from '@/lib/calendar/buckets'
import { allDayDroppableId, dayColumnDroppableId, layoutBlocks, toCalendarBlock } from '@/lib/calendar/layout'
import {
  buildAllDaySchedule, buildTimedSchedule, DEFAULT_BLOCK_MINUTES, HOUR_HEIGHT_PX, pxToMinutes,
  snapStartMinutes, type TaskSchedule,
} from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 初期表示でスクロールして見せる時刻 */
const INITIAL_SCROLL_HOUR = 6

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function AllDayDropZone({
  date, onSlotSelect, children,
}: { date: string; onSlotSelect: (date: string, startMinutes: number | null) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: allDayDroppableId(date),
    data: { type: 'calendar-all-day', date },
  })

  return (
    <div
      ref={setNodeRef}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        onSlotSelect(date, null)
      }}
      className={cn(
        'min-h-9 space-y-1 border-t border-border px-1 py-1 transition-colors',
        isOver && 'bg-primary/10'
      )}
    >
      {children}
    </div>
  )
}

function DayColumnDropZone({
  date, onSlotSelect, children,
}: { date: string; onSlotSelect: (date: string, startMinutes: number | null) => void; children: React.ReactNode }) {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const { setNodeRef, isOver } = useDroppable({
    id: dayColumnDroppableId(date),
    // over.rect はドラッグ開始時に一度だけ計測され、以後更新されない（dnd-kit の既定計測頻度は
    // Optimized で数値ではないため周期再計測が走らない）。ドロップ時に正しい位置を取るため、
    // 列ノードへの参照を data 経由で公開し、呼び出し側で最新の getBoundingClientRect を取らせる。
    data: { type: 'calendar-day', date, getTop: () => nodeRef.current?.getBoundingClientRect().top },
  })
  const setRefs = (node: HTMLDivElement | null) => {
    nodeRef.current = node
    setNodeRef(node)
  }

  return (
    <div
      ref={setRefs}
      onClick={event => {
        // ブロック上のクリックは無視し、空き部分のみ拾う
        if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.slotBackground) return
        const rect = event.currentTarget.getBoundingClientRect()
        onSlotSelect(date, snapStartMinutes(pxToMinutes(event.clientY - rect.top)))
      }}
      className={cn(
        // min-w-0: flex アイテムの既定 min-width:auto だと中身の min-content 幅より縮まず、
        // 長いタイトルの日だけ列が広がって曜日ごとの幅が崩れる
        'relative min-w-0 flex-1 border-r border-border last:border-r-0 transition-colors',
        isOver && 'bg-primary/5'
      )}
    >
      {children}
    </div>
  )
}

interface WeekViewProps {
  days: Date[]
  tasks: CalendarTask[]
  onTaskClick: (task: CalendarTask) => void
  onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void
  onSlotSelect: (date: string, startMinutes: number | null) => void
}

export default function WeekView({ days, tasks, onTaskClick, onSchedule, onSlotSelect }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dateKeys = useMemo(() => days.map(day => format(day, 'yyyy-MM-dd')), [days])
  const buckets = useMemo(() => bucketTasksByDay(dateKeys, tasks), [dateKeys, tasks])

  useDndMonitor({
    onDragEnd: event => {
      const dragged = event.active.data.current as
        | { type?: string; source?: string; durationMinutes?: number; task?: CalendarTask }
        | undefined
      const dropped = event.over?.data.current as
        | { type?: string; date?: string; getTop?: () => number | undefined }
        | undefined
      if (!dragged?.task || dragged.type !== 'task' || !dropped?.date) return

      if (dropped.type === 'calendar-all-day') {
        onSchedule(dragged.task, buildAllDaySchedule(dropped.date))
        return
      }

      if (dropped.type !== 'calendar-day' || !event.over) return

      // ドラッグ中の要素の上端が取れない場合は位置が信頼できないので、00:00 に落とさず何もしない
      const draggedTop = event.active.rect.current.translated?.top
      if (draggedTop === undefined) return

      // ドラッグ中の要素の上端が、日カラムの上端から何px下にあるかで開始時刻を決める。
      // event.over.rect はドラッグ開始時の一度きりの計測値で、オートスクロール後は古くなるため使わない。
      const columnTop = dropped.getTop?.() ?? event.over.rect.top
      const minutes = pxToMinutes(draggedTop - columnTop)
      const duration = dragged.durationMinutes ?? DEFAULT_BLOCK_MINUTES
      onSchedule(dragged.task, buildTimedSchedule(dropped.date, minutes, duration))
    },
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT_PX
    }
  }, [])

  return (
    <div className="flex h-full min-w-[720px] flex-col">
      {/* ヘッダー行と時間グリッドは同じスクロールコンテナに入れ、ヘッダーは sticky で固定する。
          別々のコンテナに分けると、スクロールバーの幅だけ内容幅が変わって列位置がずれる */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* 曜日ヘッダー + 終日行 */}
        <div className="sticky top-0 z-20 flex border-b border-border bg-background/95 backdrop-blur">
          <div className="w-14 shrink-0 border-r border-border" />
          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const bucket = buckets.get(dateKey)
            return (
              <div key={dateKey} className="min-w-0 flex-1 border-r border-border last:border-r-0">
                <div className="px-2 py-2 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {format(day, 'EEE')}
                  </div>
                  <div className={cn(
                    'mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-semibold',
                    isToday(day) && 'bg-primary text-primary-foreground'
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
                <AllDayDropZone date={dateKey} onSlotSelect={onSlotSelect}>
                  {bucket?.allDay.map(task => (
                    <AllDayChip
                      key={`allday-${task.id}`}
                      task={task}
                      onClick={() => onTaskClick(task)}
                      onSchedule={onSchedule}
                    />
                  ))}
                  {bucket?.due.map(task => (
                    <DueChip
                      key={`due-${task.id}`}
                      task={task}
                      onClick={() => onTaskClick(task)}
                    />
                  ))}
                </AllDayDropZone>
              </div>
            )
          })}
        </div>

        {/* 時間グリッド */}
        <div className="flex">
          <div className="w-14 shrink-0 border-r border-border">
            {HOURS.map(hour => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT_PX }}
                className="relative border-b border-border/50"
              >
                <span className="absolute -top-2 right-1 text-[10px] tabular-nums text-muted-foreground">
                  {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                </span>
              </div>
            ))}
          </div>

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const timed = buckets.get(dateKey)?.timed ?? []
            const positions = layoutBlocks(timed.map(task =>
              toCalendarBlock(task.id, task.scheduled_start_time!, task.scheduled_end_time!)
            ))
            const taskById = new Map(timed.map(task => [task.id, task]))

            return (
              <DayColumnDropZone key={dateKey} date={dateKey} onSlotSelect={onSlotSelect}>
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    data-slot-background="1"
                    style={{ height: HOUR_HEIGHT_PX }}
                    className="border-b border-border/50"
                  />
                ))}
                {positions.map(position => {
                  const task = taskById.get(position.id)
                  if (!task) return null
                  return (
                    <TaskBlock
                      key={task.id}
                      task={task}
                      position={position}
                      onClick={() => onTaskClick(task)}
                      onSchedule={onSchedule}
                    />
                  )
                })}
              </DayColumnDropZone>
            )
          })}
        </div>
      </div>
    </div>
  )
}
