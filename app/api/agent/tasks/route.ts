// app/api/agent/tasks/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAgentFromRequest, writeAgentAuditLog } from '@/lib/agents/api'
import { validateScheduleInput } from '@/lib/calendar/validate-schedule-input'

export async function GET(request: Request) {
  const agent = await getAgentFromRequest(request, ['read:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const supabase = createServiceClient()
  let query = (supabase.from('tasks') as any)
    .select('*, task_comments(id, body, created_at, author_agent_id)')
    .eq('assignee_agent_id', agent.agentId)

  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAgentAuditLog({
    action: 'tasks.list',
    agentId: agent.agentId,
    metadata: { status, count: data?.length ?? 0 },
    requestId: request.headers.get('X-Request-Id'),
  })

  return NextResponse.json({ tasks: data })
}

export async function POST(request: Request) {
  const agent = await getAgentFromRequest(request, ['write:tasks'])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.title || !body?.project_id) {
    return NextResponse.json({ error: 'title and project_id required' }, { status: 400 })
  }

  const scheduleError = validateScheduleInput(body)
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await (supabase.from('tasks') as any)
    .insert({
      project_id: body.project_id,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      action_type: body.action_type ?? 'other',
      due_date: body.due_date ?? null,
      scheduled_date: body.scheduled_date ?? null,
      scheduled_start_time: body.scheduled_date ? (body.scheduled_start_time ?? null) : null,
      scheduled_end_time: body.scheduled_date ? (body.scheduled_end_time ?? null) : null,
      handoff_note: body.handoff_note ?? null,
      created_by_agent_id: agent.agentId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAgentAuditLog({
    action: 'tasks.create',
    agentId: agent.agentId,
    idempotencyKey: request.headers.get('Idempotency-Key'),
    metadata: { title: body.title },
    requestId: request.headers.get('X-Request-Id'),
    taskId: data.id,
  })

  return NextResponse.json({ task: data }, { status: 201 })
}
