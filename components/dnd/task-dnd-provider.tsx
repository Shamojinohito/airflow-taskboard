'use client'

// ダッシュボード全体を包む共通 DndContext。
// - サイドバーのプロジェクト項目へのドロップ → タスクのプロジェクト移動
// - サイドバーの My Tasks へのドロップ → 自分にアサイン
// - ボード内・リスト内のドロップは各ビューが useDndMonitor で処理する
import { useCallback, useState, type ReactNode } from 'react'
import {
  closestCorners, CollisionDetection, DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  pointerWithin, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TaskCard } from '@/components/board/task-card'

export interface TaskDragData {
  type: 'task'
  /** calendar-due は締切チップ（掴むと締切日が動く）、calendar は作業予定 */
  source: 'board' | 'list' | 'calendar' | 'calendar-due' | 'tray'
  listId?: string
  /** 時間ブロックを移動するとき、元の長さ（分）を保つために持ち回る */
  durationMinutes?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any
}

function isSidebarId(id: unknown) {
  return String(id).startsWith('sidebar-')
}

export default function TaskDndProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [activeDrag, setActiveDrag] = useState<TaskDragData | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }
  }))

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)
    // closestCorners はボード内の並び位置決め用のフォールバック。
    // ポインタが乗っていないサイドバーを誤検出しないよう除外する
    const fallbackCollisions = pointerCollisions.length > 0
      ? pointerCollisions
      : closestCorners(args).filter(collision => !isSidebarId(collision.id))
    const collisions = fallbackCollisions.filter(collision => collision.id !== args.active.id)

    const sidebarCollision = collisions.find(collision => isSidebarId(collision.id))
    if (sidebarCollision) return [sidebarCollision]

    // カレンダーのドロップ先はボード/リストの行より優先する
    const calendarCollision = collisions.find(collision => {
      const type = collision.data?.droppableContainer.data.current?.type
      return type === 'calendar-day' || type === 'calendar-all-day' || type === 'calendar-unscheduled'
    })
    if (calendarCollision) return [calendarCollision]

    const taskCollision = collisions.find(collision =>
      collision.data?.droppableContainer.data.current?.type === 'task'
    )
    if (taskCollision) return [taskCollision]

    const rowCollision = collisions.find(collision =>
      collision.data?.droppableContainer.data.current?.type === 'list-row'
    )
    if (rowCollision) return [rowCollision]

    const columnCollision = collisions.find(collision =>
      collision.data?.droppableContainer.data.current?.type === 'column'
    )
    if (columnCollision) return [columnCollision]

    return collisions
  }, [])

  const invalidateTaskViews = (projectIds: (string | null | undefined)[]) => {
    for (const projectId of projectIds) {
      if (projectId) queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    }
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['today-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['triage-inbox'] })
    queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['unscheduled-tasks'] })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null)
    const data = event.active.data.current as TaskDragData | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overData = event.over?.data.current as any
    if (!data || data.type !== 'task' || !overData) return

    const task = data.task

    if (overData.type === 'sidebar-project') {
      const targetProjectId = overData.projectId as string
      if (!targetProjectId || targetProjectId === task.project_id) return
      // サブタスク単体を移動する場合は親から切り離す（親子の跨りプロジェクトを防ぐ）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { project_id: targetProjectId }
      if (task.parent_task_id) updates.parent_task_id = null
      const { error } = await (supabase.from('tasks') as any)
        .update(updates)
        .eq('id', task.id)
      if (!error) {
        // 親タスクの移動はサブタスクも一緒に移す
        await (supabase.from('tasks') as any)
          .update({ project_id: targetProjectId })
          .eq('parent_task_id', task.id)
      }
      invalidateTaskViews([task.project_id, targetProjectId])
      return
    }

    if (overData.type === 'sidebar-my-tasks') {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId || task.assignee_user_id === userId) return
      await (supabase.from('tasks') as any)
        .update({ assignee_user_id: userId, assignee_agent_id: null })
        .eq('id', task.id)
      invalidateTaskViews([task.project_id])
      return
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event: DragStartEvent) =>
        setActiveDrag((event.active.data.current as TaskDragData | undefined) ?? null)}
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeDrag?.source === 'board' ? (
          <TaskCard task={activeDrag.task} onClick={() => {}} />
        ) : activeDrag?.source === 'calendar-due' ? (
          // 締切チップは掴んでいるものが分かるよう、カレンダー上と同じ配色にする
          <div className="flex w-64 items-center gap-1.5 truncate rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500 shadow-md">
            <Flag size={12} className="shrink-0" />
            <span className="truncate">締切: {activeDrag.task.title}</span>
          </div>
        ) : activeDrag ? (
          <div className="w-64 truncate rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-md">
            {activeDrag.task.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
