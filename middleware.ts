import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証不要なパスは Supabase クライアントを作る前に抜ける。
  // 以前は getUser() のあとに判定していたため、エージェントAPIの全リクエストが
  // 無駄に Auth サーバーへの往復を1回払っていた。
  // - /api/agent/*, /api/v1/agent/*: APIキー/専用JWTで認証するためセッション不要
  // - /auth/callback: OAuth コード交換前でセッションがまだ無い
  if (
    pathname.startsWith('/api/agent') ||
    pathname.startsWith('/api/v1/agent') ||
    pathname.startsWith('/auth/callback')
  ) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() は毎リクエスト Auth サーバーへ HTTP で問い合わせる。
  // このプロジェクトは非対称鍵(ES256)で JWT を発行しているため、getClaims() なら
  // JWKS をプロセス内キャッシュ(GLOBAL_JWKS)から引いてローカル検証でき往復が消える。
  // 対称鍵(HS256)に戻した場合は内部で getUser() が走るだけなので後退はしない。
  // getClaims() は内部で getSession() を呼ぶので、期限切れトークンの更新と
  // Cookie の書き戻し（上の setAll）は従来どおり動く。
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
