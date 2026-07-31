'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDroppable } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bot, CalendarCheck, CalendarRange, CheckSquare, ChevronDown, ChevronRight, FolderKanban,
  FolderPlus, Inbox, MoreHorizontal, Plus, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useProjects } from '@/hooks/use-projects'
import { useProjectGroups, type ProjectGroup } from '@/hooks/use-project-groups'
import CreateProjectDialog from '@/components/projects/create-project-dialog'
import CreateGroupDialog from '@/components/projects/create-group-dialog'
import { useCallback, useEffect, useState } from 'react'
import RelayLogo from '@/components/brand/relay-logo'

const COLLAPSED_GROUPS_KEY = 'relay:sidebar-collapsed-groups'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  /** タスクのドロップ受け入れを有効化する（レイアウト直下のインスタンスのみ。
      モバイルSheet側と droppable id が重複しないよう既定は無効） */
  dndEnabled?: boolean
}

// タスクをドロップできるナビ項目のラッパー。isOver でハイライトする
function DroppableNavItem({
  id,
  data,
  children,
}: {
  id: string
  data: Record<string, unknown>
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id, data })
  return (
    <div ref={setNodeRef} className={cn('rounded-lg transition-shadow', isOver && 'bg-primary/10 ring-2 ring-primary/60')}>
      {children}
    </div>
  )
}

const navItemClassName = (active: boolean) => cn(
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors",
  active
    ? "bg-primary/12 text-primary ring-1 ring-primary/20"
    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
)

// サイドバーのプロジェクト行。移動メニュー付き。dndEnabled 時はドロップ対象になる
function ProjectRow({
  project,
  groups,
  active,
  dndEnabled,
  onNavigate,
  onMove,
  indented,
}: {
  project: any
  groups: ProjectGroup[]
  active: boolean
  dndEnabled: boolean
  onNavigate?: () => void
  onMove: (projectId: string, groupId: string | null) => void
  indented: boolean
}) {
  const row = (
    <div className="group/proj flex items-center gap-1 rounded-lg">
      <Link
        href={`/projects/${project.id}`}
        className={cn(navItemClassName(active), "min-w-0 flex-1 truncate", indented && "pl-2")}
        onClick={onNavigate}
      >
        <FolderKanban size={15} className="flex-shrink-0" />
        <span className="truncate">{project.name}</span>
      </Link>
      {/* modal={false}: 親の Sheet(Dialog) がすでにスクロールロック中。
          入れ子でロックを重ねると iOS Safari がプロセスクラッシュするため無効化 */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-sidebar-accent hover:text-foreground focus:opacity-100 md:opacity-0 md:group-hover/proj:opacity-100"
          aria-label="Project options"
        >
          <MoreHorizontal size={15} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Move to group</DropdownMenuLabel>
          {groups.length === 0 && (
            <DropdownMenuItem disabled>No groups yet</DropdownMenuItem>
          )}
          {groups.map(group => (
            <DropdownMenuItem
              key={group.id}
              disabled={project.group_id === group.id}
              onClick={() => onMove(project.id, group.id)}
            >
              {group.name}
            </DropdownMenuItem>
          ))}
          {project.group_id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMove(project.id, null)}>
                Remove from group
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return dndEnabled ? (
    <DroppableNavItem
      id={`sidebar-project:${project.id}`}
      data={{ type: 'sidebar-project', projectId: project.id }}
    >
      {row}
    </DroppableNavItem>
  ) : row
}

export default function Sidebar({ className, onNavigate, dndEnabled = false }: SidebarProps) {
  const pathname = usePathname()
  const { projects, isLoading, error } = useProjects()
  const { groups } = useProjectGroups()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [createGroupId, setCreateGroupId] = useState<string | null>(null)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 折りたたみ状態を localStorage で永続化
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY)
      // マウント後に外部ストア(localStorage)から復元する定型パターン。
      // lazy initializer だと SSR とハイドレーションで不一致になるため effect で行う
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCollapsed(new Set(JSON.parse(raw)))
    } catch {
      // storage unavailable — 開いた状態のまま
    }
  }, [])

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      try {
        localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]))
      } catch {
        // storage unavailable — 永続化はスキップ
      }
      return next
    })
  }, [])

  const moveProject = useCallback(async (projectId: string, groupId: string | null) => {
    // 楽観更新
    queryClient.setQueryData(['projects'], (current: unknown) => {
      if (!Array.isArray(current)) return current
      return current.map((p: any) => p.id === projectId ? { ...p, group_id: groupId } : p)
    })
    const { error } = await (supabase.from('projects') as any)
      .update({ group_id: groupId })
      .eq('id', projectId)
    if (error) {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  }, [queryClient, supabase])

  const openCreateForGroup = (groupId: string | null) => {
    setCreateGroupId(groupId)
    setCreateOpen(true)
  }

  const allProjects = projects as any[]
  const ungrouped = allProjects.filter(p => !p.group_id)

  return (
    <aside className={cn("flex h-full w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar", className)}>
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <RelayLogo className="size-9" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-wide text-sidebar-foreground">Relay</div>
            <div className="text-[11px] text-muted-foreground">Agent handoff board</div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          <Link href="/inbox" className={navItemClassName(pathname === '/inbox')} onClick={onNavigate}>
            <Inbox size={16} />
            <span>Inbox</span>
          </Link>

          <Link href="/today" className={navItemClassName(pathname === '/today')} onClick={onNavigate}>
            <CalendarCheck size={16} />
            <span>Today</span>
          </Link>

          <Link href="/calendar" className={navItemClassName(pathname === '/calendar')} onClick={onNavigate}>
            <CalendarRange size={16} />
            <span>Calendar</span>
          </Link>

          {dndEnabled ? (
            <DroppableNavItem id="sidebar-my-tasks" data={{ type: 'sidebar-my-tasks' }}>
              <Link href="/my-tasks" className={navItemClassName(pathname === '/my-tasks')} onClick={onNavigate}>
                <CheckSquare size={16} />
                <span>My Tasks</span>
              </Link>
            </DroppableNavItem>
          ) : (
            <Link href="/my-tasks" className={navItemClassName(pathname === '/my-tasks')} onClick={onNavigate}>
              <CheckSquare size={16} />
              <span>My Tasks</span>
            </Link>
          )}

          <div className="px-3 pb-1 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Projects
              </span>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title="New group" onClick={() => setCreateGroupOpen(true)}>
                  <FolderPlus size={13} />
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title="New project" onClick={() => openCreateForGroup(null)}>
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-1 px-3">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <p className="px-3 py-2 text-xs text-destructive">
              Failed to load projects
            </p>
          ) : allProjects.length === 0 && groups.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No projects yet. Use the + above to create one.
            </p>
          ) : (
            <>
              {/* グループごとのツリー */}
              {groups.map(group => {
                const groupProjects = allProjects.filter(p => p.group_id === group.id)
                const isCollapsed = collapsed.has(group.id)
                return (
                  <div key={group.id} className="space-y-0.5">
                    <div className="group/grp flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent"
                      >
                        {isCollapsed ? <ChevronRight size={14} className="flex-shrink-0" /> : <ChevronDown size={14} className="flex-shrink-0" />}
                        <span className="truncate">{group.name}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">{groupProjects.length}</span>
                      </button>
                      <Button variant="ghost" size="icon-sm"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground opacity-100 hover:text-foreground focus:opacity-100 md:opacity-0 md:group-hover/grp:opacity-100"
                        title="New project in group" onClick={() => openCreateForGroup(group.id)}>
                        <Plus size={12} />
                      </Button>
                    </div>
                    {!isCollapsed && (
                      <div className="space-y-0.5 pl-3">
                        {groupProjects.length === 0 ? (
                          <p className="px-3 py-1 text-[11px] text-muted-foreground">Empty</p>
                        ) : (
                          groupProjects.map(project => (
                            <ProjectRow
                              key={project.id}
                              project={project}
                              groups={groups}
                              active={pathname.startsWith(`/projects/${project.id}`)}
                              dndEnabled={dndEnabled}
                              onNavigate={onNavigate}
                              onMove={moveProject}
                              indented
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 未分類プロジェクト */}
              {ungrouped.length > 0 && (
                <div className="space-y-0.5">
                  {groups.length > 0 && (
                    <div className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      Ungrouped
                    </div>
                  )}
                  {ungrouped.map(project => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      groups={groups}
                      active={pathname.startsWith(`/projects/${project.id}`)}
                      dndEnabled={dndEnabled}
                      onNavigate={onNavigate}
                      onMove={moveProject}
                      indented={false}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="px-3 pb-1 pt-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Agents
            </span>
          </div>

          <Link href="/agents" className={navItemClassName(pathname === '/agents')} onClick={onNavigate}>
            <Bot size={15} />
            <span>Agents</span>
          </Link>

          <Link href="/settings" className={navItemClassName(pathname === '/settings')} onClick={onNavigate}>
            <Settings size={15} />
            <span>Settings</span>
          </Link>
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-lg border border-border/70 bg-background/45 px-3 py-2 text-xs text-muted-foreground">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400" />
          Realtime sync active
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} defaultGroupId={createGroupId} />
      <CreateGroupDialog open={createGroupOpen} onOpenChange={setCreateGroupOpen} />
    </aside>
  )
}
