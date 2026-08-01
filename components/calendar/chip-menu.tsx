'use client'

// 予定チップ共通の「…」メニュー。時間ブロック・終日チップ・月ビューのチップで使い回す。
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ChipMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenDetail: () => void
  /** 予定を外して Unscheduled に戻す */
  onUnschedule: () => void
  className?: string
}

export default function ChipMenu({
  open, onOpenChange, onOpenDetail, onUnschedule, className,
}: ChipMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="予定のメニュー"
        className={cn(
          'absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus:opacity-100 group-hover:opacity-100',
          className
        )}
      >
        <MoreHorizontal size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpenDetail}>詳細を開く</DropdownMenuItem>
        <DropdownMenuItem onClick={onUnschedule}>予定を外す</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
