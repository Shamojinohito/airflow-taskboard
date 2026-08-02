import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query'
import Sidebar from '@/components/layout/sidebar'
import TopBar from '@/components/layout/topbar'
import TaskDndProvider from '@/components/dnd/task-dnd-provider'
import { QueryProvider } from '@/components/query-provider'
import { createClient } from '@/lib/supabase/server'
import {
  fetchProjectGroups, fetchProjects, projectGroupsQueryKey, projectsQueryKey,
} from '@/lib/queries/projects'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // サイドバーのプロジェクト/グループをサーバーで先に取っておく。
  // これが無いと「HTML → JSダウンロード → hydrate → Supabase へ取得」という
  // ウォーターフォールになり、初回はサイドバーがスケルトンのまま数百ms待たされる。
  // prefetchQuery はエラーを握り潰し失敗分は dehydrate されないので、Supabase が
  // 落ちていてもレイアウトは描画され、クライアント側が通常どおり取得しに行く。
  const queryClient = new QueryClient()
  const supabase = await createClient()
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: projectsQueryKey,
      queryFn: () => fetchProjects(supabase),
    }),
    queryClient.prefetchQuery({
      queryKey: projectGroupsQueryKey,
      queryFn: () => fetchProjectGroups(supabase),
    }),
  ])

  return (
    <QueryProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaskDndProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar className="hidden md:flex" dndEnabled />
            <div className="flex flex-col flex-1 overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </div>
        </TaskDndProvider>
      </HydrationBoundary>
    </QueryProvider>
  )
}
