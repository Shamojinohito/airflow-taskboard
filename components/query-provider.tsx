'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider, removeOldestQuery } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useState } from 'react'

/** localStorage 上のキャッシュキー。ログアウト時に破棄するので topbar からも参照する */
export const QUERY_CACHE_KEY = 'relay:query-cache'
/** クエリの取得形（select する列や整形）を変えたら上げて、古いキャッシュを捨てる */
const BUSTER = 'v1'
/** これより古いキャッシュは復元しない（1日） */
const MAX_AGE = 1000 * 60 * 60 * 24

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // 個別フックで staleTime を指定していないクエリの既定値
        staleTime: 60_000,
        // 画面を離れても1日はキャッシュを保持する。既定の5分のままだと
        // localStorage に書き出す前に GC されて永続化がほぼ効かない
        gcTime: MAX_AGE,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))

  // storage が undefined のとき createSyncStoragePersister は no-op persister を返すので、
  // SSR 中は何も復元・永続化されない（window 参照で落ちない）
  const [persister] = useState(() => createSyncStoragePersister({
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    key: QUERY_CACHE_KEY,
    // 5MB の quota を超えたら古いクエリから捨てて書き込みをリトライする
    retry: removeOldestQuery,
  }))

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        buster: BUSTER,
        dehydrateOptions: {
          // 取得中・エラーのクエリを焼き付けない
          shouldDehydrateQuery: query => query.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
