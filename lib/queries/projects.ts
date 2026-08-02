// サイドバーが必要とするプロジェクト/グループの取得。
// dashboard layout（サーバー）での prefetch と、クライアントのフックの両方から
// 同じキー・同じ整形で使うために切り出している。ズレると hydrate 後に
// 一瞬だけ違う並びが描画されてしまう。
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const projectsQueryKey = ['projects'] as const
export const projectGroupsQueryKey = ['project-groups'] as const

export interface ProjectGroup {
  id: string
  name: string
  description: string | null
  position: number
  created_at: string
}

type Client = SupabaseClient<Database>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchProjects(supabase: Client): Promise<any[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  // Inbox（クイックキャプチャの受け皿）は常に先頭に表示する（名前ベースのピン留め）
  return (data ?? []).sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => (a.name === 'Inbox' ? 0 : 1) - (b.name === 'Inbox' ? 0 : 1)
  )
}

export async function fetchProjectGroups(supabase: Client): Promise<ProjectGroup[]> {
  const { data, error } = await supabase
    .from('project_groups')
    .select('*')
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ProjectGroup[]
}
