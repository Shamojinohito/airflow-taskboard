// app/api/agent/project-groups/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAgentFromRequest, writeAgentAuditLog } from '@/lib/agents/api'

// エージェント作成グループの所有者解決（projects route と同じ規則）
async function resolveOwnerUserId(supabase: ReturnType<typeof createServiceClient>) {
  const envOwner = process.env.AGENT_PROJECT_OWNER_ID
  if (envOwner) return envOwner

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 2 })
  if (error || !data?.users?.length) return null
  if (data.users.length > 1) return null
  return data.users[0].id
}

export async function GET(request: Request) {
  const agent = await getAgentFromRequest(request, ['read:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const { data, error } = await (supabase.from('project_groups') as any)
    .select('id, name, description, position, created_at')
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAgentAuditLog({
    action: 'project_groups.list',
    agentId: agent.agentId,
    metadata: { count: data?.length ?? 0 },
    requestId: request.headers.get('X-Request-Id'),
  })

  return NextResponse.json({ groups: data })
}

export async function POST(request: Request) {
  const agent = await getAgentFromRequest(request, ['write:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = createServiceClient()

  // project_ids で限定されたエージェントはグループ作成不可
  const { data: agentRow } = await (supabase.from('agents') as any)
    .select('project_ids')
    .eq('id', agent.agentId)
    .maybeSingle()
  if (agentRow?.project_ids?.length) {
    return NextResponse.json(
      { error: 'Project-scoped agents cannot create groups' },
      { status: 403 }
    )
  }

  const ownerId = await resolveOwnerUserId(supabase)
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Cannot resolve group owner. Set AGENT_PROJECT_OWNER_ID env var.' },
      { status: 500 }
    )
  }

  const { data: group, error } = await (supabase.from('project_groups') as any)
    .insert({
      name,
      description: typeof body?.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null,
      owner_id: ownerId,
    })
    .select('id, name, description, position, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAgentAuditLog({
    action: 'project_groups.create',
    agentId: agent.agentId,
    idempotencyKey: request.headers.get('Idempotency-Key'),
    metadata: { name, group_id: group.id },
    requestId: request.headers.get('X-Request-Id'),
  })

  return NextResponse.json({ group }, { status: 201 })
}
