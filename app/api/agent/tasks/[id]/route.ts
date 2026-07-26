// app/api/agent/tasks/[id]/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAgentFromRequest, writeAgentAuditLog } from '@/lib/agents/api'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const {
    action_type,
    blocked_reason,
    comment,
    due_date,
    handoff_note,
    priority,
    project_id,
    assignee_agent_id,
    assignee_user_id,
    status,
    title,
  } = body
  const requiredScopes = comment ? ['write:tasks', 'write:comments'] as const : ['write:tasks'] as const
  const agent = await getAgentFromRequest(request, [...requiredScopes])
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // プロジェクト間移動: 移動先の存在・未アーカイブと、エージェントの
  // project_ids 制限（設定時は移動元・移動先とも許可範囲内）を確認する
  let movedAcrossProjects = false
  if (project_id !== undefined) {
    if (typeof project_id !== 'string' || !project_id) {
      return NextResponse.json({ error: 'project_id must be a project UUID' }, { status: 400 })
    }

    const { data: targetProject } = await (supabase.from('projects') as any)
      .select('id, archived_at')
      .eq('id', project_id)
      .maybeSingle()
    if (!targetProject || targetProject.archived_at) {
      return NextResponse.json({ error: 'Target project not found or archived' }, { status: 404 })
    }

    const { data: task } = await (supabase.from('tasks') as any)
      .select('project_id')
      .eq('id', id)
      .maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const { data: agentRow } = await (supabase.from('agents') as any)
      .select('project_ids')
      .eq('id', agent.agentId)
      .maybeSingle()
    const allowedProjects: string[] = agentRow?.project_ids ?? []
    if (
      allowedProjects.length > 0 &&
      (!allowedProjects.includes(project_id) || !allowedProjects.includes(task.project_id))
    ) {
      return NextResponse.json(
        { error: 'Agent is not allowed to move tasks across these projects' },
        { status: 403 }
      )
    }

    movedAcrossProjects = task.project_id !== project_id
  }

  const updates: Record<string, unknown> = {}
  if (movedAcrossProjects) updates.project_id = project_id
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
    }
    updates.title = title.trim()
  }
  if (status) updates.status = status
  if (priority) updates.priority = priority
  if (action_type) updates.action_type = action_type
  if (handoff_note !== undefined) updates.handoff_note = handoff_note || null
  if (blocked_reason !== undefined) updates.blocked_reason = blocked_reason || null
  if (due_date !== undefined) {
    if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return NextResponse.json({ error: 'due_date must be YYYY-MM-DD or null' }, { status: 400 })
    }
    updates.due_date = due_date || null
  }
  if (assignee_user_id !== undefined) {
    updates.assignee_user_id = assignee_user_id
    updates.assignee_agent_id = null
  }
  if (assignee_agent_id !== undefined) {
    updates.assignee_agent_id = assignee_agent_id
    updates.assignee_user_id = null
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // タグはプロジェクト固有のため、移動時は紐付けを解除する
  if (movedAcrossProjects) {
    await (supabase.from('task_tags') as any).delete().eq('task_id', id)
  }

  if (comment) {
    await (supabase.from('task_comments') as any).insert({
      task_id: id, body: comment, author_agent_id: agent.agentId
    })
  }

  await writeAgentAuditLog({
    action: 'tasks.patch',
    agentId: agent.agentId,
    idempotencyKey: request.headers.get('Idempotency-Key'),
    metadata: { fields: Object.keys(updates), comment: Boolean(comment) },
    requestId: request.headers.get('X-Request-Id'),
    taskId: id,
  })

  return NextResponse.json({ success: true })
}
