// app/api/agent/projects/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAgentFromRequest, writeAgentAuditLog } from '@/lib/agents/api'

export async function GET(request: Request) {
  const agent = await getAgentFromRequest(request, ['read:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // エージェントに project_ids が設定されていればそのプロジェクトに限定
  const { data: agentRow } = await (supabase.from('agents') as any)
    .select('project_ids')
    .eq('id', agent.agentId)
    .maybeSingle()

  let query = (supabase.from('projects') as any)
    .select('id, name, description, group_id, created_at')
    .is('archived_at', null)

  if (agentRow?.project_ids?.length) query = query.in('id', agentRow.project_ids)

  // 任意: ?group_id= でグループ絞り込み
  const groupIdFilter = new URL(request.url).searchParams.get('group_id')
  if (groupIdFilter) query = query.eq('group_id', groupIdFilter)

  const { data, error } = await query.order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAgentAuditLog({
    action: 'projects.list',
    agentId: agent.agentId,
    metadata: { count: data?.length ?? 0 },
    requestId: request.headers.get('X-Request-Id'),
  })

  return NextResponse.json({ projects: data })
}

// エージェント作成プロジェクトの所有者。AGENT_PROJECT_OWNER_ID が未設定なら
// auth.users が1人だけのときそのユーザーに帰属させる
async function resolveOwnerUserId(supabase: ReturnType<typeof createServiceClient>) {
  const envOwner = process.env.AGENT_PROJECT_OWNER_ID
  if (envOwner) return envOwner

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 2 })
  if (error || !data?.users?.length) return null
  if (data.users.length > 1) return null
  return data.users[0].id
}

export async function POST(request: Request) {
  const agent = await getAgentFromRequest(request, ['write:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = createServiceClient()

  // project_ids で特定プロジェクトに限定されたエージェントは新規作成不可
  const { data: agentRow } = await (supabase.from('agents') as any)
    .select('project_ids')
    .eq('id', agent.agentId)
    .maybeSingle()
  if (agentRow?.project_ids?.length) {
    return NextResponse.json(
      { error: 'Project-scoped agents cannot create projects' },
      { status: 403 }
    )
  }

  const ownerId = await resolveOwnerUserId(supabase)
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Cannot resolve project owner. Set AGENT_PROJECT_OWNER_ID env var.' },
      { status: 500 }
    )
  }

  // 任意 group_id: 指定時は owner の所有グループでなければ 400
  const groupId = typeof body?.group_id === 'string' && body.group_id ? body.group_id : null
  if (groupId) {
    const { data: groupRow } = await (supabase.from('project_groups') as any)
      .select('id')
      .eq('id', groupId)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (!groupRow) {
      return NextResponse.json({ error: 'Project group not found' }, { status: 400 })
    }
  }

  const { data: project, error } = await (supabase.from('projects') as any)
    .insert({
      name,
      description: typeof body?.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null,
      owner_id: ownerId,
      group_id: groupId,
    })
    .select('id, name, description, group_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase.from('project_members') as any)
    .upsert({ project_id: project.id, user_id: ownerId, role: 'owner' })

  await writeAgentAuditLog({
    action: 'projects.create',
    agentId: agent.agentId,
    idempotencyKey: request.headers.get('Idempotency-Key'),
    metadata: { name, project_id: project.id, group_id: groupId },
    requestId: request.headers.get('X-Request-Id'),
  })

  return NextResponse.json({ project }, { status: 201 })
}
