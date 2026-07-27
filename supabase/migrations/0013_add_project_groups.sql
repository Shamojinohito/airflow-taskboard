-- Project groups: 案件フォルダ層（Group > Project > Task > Subtask の2階層固定）

CREATE TABLE project_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position     INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  archived_at  TIMESTAMPTZ
);

-- プロジェクトの所属グループ（NULL = 未分類）。グループ削除時はプロジェクトを残し NULL に戻す
ALTER TABLE projects
  ADD COLUMN group_id UUID REFERENCES project_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_group_id ON projects(group_id);
CREATE INDEX idx_project_groups_owner ON project_groups(owner_id);

-- RLS: 既存 projects と同じ owner ベース
ALTER TABLE project_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_groups_select" ON project_groups
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "project_groups_insert" ON project_groups
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "project_groups_update" ON project_groups
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "project_groups_delete" ON project_groups
  FOR DELETE USING (owner_id = auth.uid());

-- グループ作成 RPC（create_project に準拠）
CREATE OR REPLACE FUNCTION public.create_project_group(
  group_name TEXT,
  group_description TEXT DEFAULT NULL
)
RETURNS public.project_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group public.project_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF group_name IS NULL OR btrim(group_name) = '' THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;

  INSERT INTO public.project_groups (name, description, owner_id)
  VALUES (btrim(group_name), NULLIF(btrim(group_description), ''), auth.uid())
  RETURNING * INTO new_group;

  RETURN new_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_group(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_group(TEXT, TEXT) TO authenticated;

-- create_project を 3引数版へ拡張（group_id を任意指定）。旧2引数版は置き換える
DROP FUNCTION IF EXISTS public.create_project(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_project(
  project_name TEXT,
  project_description TEXT DEFAULT NULL,
  project_group_id UUID DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_project public.projects;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF project_name IS NULL OR btrim(project_name) = '' THEN
    RAISE EXCEPTION 'Project name is required';
  END IF;

  -- 指定グループは呼び出しユーザーの所有物でなければならない
  IF project_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_groups
    WHERE id = project_group_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Project group not found';
  END IF;

  INSERT INTO public.projects (name, description, owner_id, group_id)
  VALUES (
    btrim(project_name),
    NULLIF(btrim(project_description), ''),
    auth.uid(),
    project_group_id
  )
  RETURNING * INTO new_project;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (new_project.id, auth.uid(), 'owner')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN new_project;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project(TEXT, TEXT, UUID) TO authenticated;
