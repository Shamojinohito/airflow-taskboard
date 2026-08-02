import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchProjects, projectsQueryKey } from '@/lib/queries/projects'

export function useProjects() {
  const supabase = createClient()

  // dashboard layout がサーバー側で prefetch 済みなので、初回描画では
  // HydrationBoundary 経由のデータが即座に入り、ここでは fetch が走らない
  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: projectsQueryKey,
    queryFn: () => fetchProjects(supabase),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return { projects, isLoading, error }
}
