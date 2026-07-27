'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CreateGroupDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const queryClient = useQueryClient()
  const supabase = createClient()

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    setErrorMessage('')

    let { data: group, error } = await (supabase as any)
      .rpc('create_project_group', {
        group_name: name.trim(),
        group_description: description.trim() || null,
      })

    // RPC 未適用環境向けフォールバック（直接 insert）
    if (error?.code === '42883' || error?.code === 'PGRST202') {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setErrorMessage(userError?.message ?? 'ログイン状態を確認できませんでした。再ログインしてください。')
        setLoading(false)
        return
      }
      const directResult = await supabase
        .from('project_groups')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          owner_id: user.id,
        } as any)
        .select()
        .single()
      group = directResult.data
      error = directResult.error
    }

    if (error) {
      setErrorMessage(error.message)
    } else if (group) {
      await queryClient.invalidateQueries({ queryKey: ['project-groups'] })
      await queryClient.refetchQueries({ queryKey: ['project-groups'] })
      setName('')
      setDescription('')
      onOpenChange(false)
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Estate Flow" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional description" />
          </div>
          {errorMessage && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
