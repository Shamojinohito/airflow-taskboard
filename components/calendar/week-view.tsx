'use client'

// 週ビュー: 上部に終日行、下に 7日 × 24時間のグリッド。
// タスクの描画は Task 7、ドロップ受け口は Task 9 で追加する。
import { useEffect, useRef } from 'react'
import { format, isToday } from 'date-fns'
import { HOUR_HEIGHT_PX } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 初期表示でスクロールして見せる時刻 */
const INITIAL_SCROLL_HOUR = 6

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface WeekViewProps {
  days: Date[]
  tasks: CalendarTask[]
  onTaskClick: (taskId: string) => void
}

export default function WeekView({ days }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT_PX
    }
  }, [])

  return (
    <div className="flex h-full min-w-[720px] flex-col">
      {/* 曜日ヘッダー + 終日行 */}
      <div className="flex border-b border-border bg-background/70 backdrop-blur">
        <div className="w-14 shrink-0 border-r border-border" />
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          return (
            <div key={dateKey} className="flex-1 border-r border-border last:border-r-0">
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
              <div
                data-all-day-cell={dateKey}
                className="min-h-9 space-y-1 border-t border-border px-1 py-1"
              />
            </div>
          )
        })}
      </div>

      {/* 時間グリッド */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
            return (
              <div
                key={dateKey}
                data-day-column={dateKey}
                className="relative flex-1 border-r border-border last:border-r-0"
              >
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT_PX }}
                    className="border-b border-border/50"
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
