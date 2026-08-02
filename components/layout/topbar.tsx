'use client'

import { Bell, Clock3, LogOut, Menu, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import Sidebar from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/client'
import { QUERY_CACHE_KEY } from '@/components/query-provider'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface HeaderIdentity {
  email?: string
  avatarUrl?: string
}

export default function TopBar() {
  const [identity, setIdentity] = useState<HeaderIdentity | null>(null)
  const [todayLabel, setTodayLabel] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  useEffect(() => {
    // getUser() は Auth サーバーへの往復が入る。表示に必要なのは email とアバターだけで、
    // どちらもアクセストークンのクレームに載っているので getClaims()（ローカル検証）で足りる
    supabase.auth.getClaims().then(({ data }) => {
      const claims = data?.claims
      if (!claims) return
      const metadata = claims.user_metadata as { avatar_url?: string } | undefined
      setIdentity({ email: claims.email, avatarUrl: metadata?.avatar_url })
    })
    setTodayLabel(new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()).replaceAll('/', '.'))
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    // クエリキャッシュは localStorage に永続化されている。消さないと次に別アカウントで
    // ログインしたとき、前のユーザーのプロジェクト/タスクが一瞬表示される
    queryClient.clear()
    try {
      localStorage.removeItem(QUERY_CACHE_KEY)
    } catch {
      // storage unavailable — メモリ側は clear 済み
    }
    router.push('/login')
  }

  const initials = identity?.email?.slice(0, 2).toUpperCase() ?? '?'

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => setNavOpen(true)}
        >
          <Menu size={18} />
          <span className="sr-only">Open navigation</span>
        </Button>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 gap-0 p-0" aria-label="Navigation" showCloseButton={false}>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-1.5">
          <Radio size={13} className="text-emerald-400" />
          <span>Relay online</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <Clock3 size={13} />
          <span>{todayLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Bell size={16} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={identity?.avatarUrl} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={signOut}>
              <LogOut size={14} className="mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
