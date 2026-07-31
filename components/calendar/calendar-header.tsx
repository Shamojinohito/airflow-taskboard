'use client'

// カレンダーのヘッダー。期間移動・週/月トグル・プロジェクトフィルタ。
import { CalendarRange, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type CalendarMode = 'week' | 'month'

interface CalendarProject {
  id: string
  name: string
}

interface CalendarHeaderProps {
  mode: CalendarMode
  onModeChange: (mode: CalendarMode) => void
  rangeLabel: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  projects: CalendarProject[]
  selectedProjectIds: string[]
  onToggleProject: (projectId: string) => void
  onClearProjectFilter: () => void
}

export default function CalendarHeader({
  mode, onModeChange, rangeLabel, onPrev, onNext, onToday,
  projects, selectedProjectIds, onToggleProject, onClearProjectFilter,
}: CalendarHeaderProps) {
  const filterActive = selectedProjectIds.length > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CalendarRange size={19} className="text-primary" />
          Calendar
        </h1>
        <span className="text-sm text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-border">
          <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label="前の期間">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={onToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="次の期間">
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="flex items-center rounded-md border border-border p-0.5">
          {(['week', 'month'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                mode === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {value === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Filter size={14} />
            <span className="hidden sm:inline">Projects</span>
            {filterActive && (
              <Badge variant="outline" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {selectedProjectIds.length}
              </Badge>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-auto">
            <DropdownMenuLabel>表示するプロジェクト</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClearProjectFilter}>
              {filterActive ? 'すべて表示' : 'すべて表示（現在）'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.map(project => (
              <DropdownMenuItem
                key={project.id}
                onSelect={event => {
                  event.preventDefault()
                  onToggleProject(project.id)
                }}
                className={cn(selectedProjectIds.includes(project.id) && 'font-semibold')}
              >
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
