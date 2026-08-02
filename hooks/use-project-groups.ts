import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchProjectGroups, projectGroupsQueryKey } from '@/lib/queries/projects'

export type { ProjectGroup } from '@/lib/queries/projects'

export function useProjectGroups() {
  const supabase = createClient()

  // projects と同じく dashboard layout でサーバー prefetch 済み
  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: projectGroupsQueryKey,
    queryFn: () => fetchProjectGroups(supabase),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return { groups, isLoading, error }
}
