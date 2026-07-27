import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ProjectGroup {
  id: string
  name: string
  description: string | null
  position: number
  created_at: string
}

export function useProjectGroups() {
  const supabase = createClient()

  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ['project-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_groups')
        .select('*')
        .is('archived_at', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectGroup[]
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return { groups, isLoading, error }
}
