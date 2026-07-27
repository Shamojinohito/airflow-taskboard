# Project Groups (プロジェクト多層化) — Design

Date: 2026-07-28
Status: Approved (chat)

## 背景 / 目的

現状 `projects` はフラット構造で、"Estate Flow" や "Silicon Atlas" のように複数の開発案件を
1つの案件フォルダとしてまとめる階層がない。開発案件をグルーピングして見通しを良くしたい。

## 採用方針: グループ層の新設（2階層固定）

階層: **Group (Estate Flow / Silicon Atlas) > Project > Task > Subtask**

任意深度の再帰ネストは採用しない（YAGNI）。案件フォルダ用途には2階層で十分で、RLS/UI が単純。

## データモデル

新テーブル `project_groups`:

| column | type | notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| name | TEXT NOT NULL | |
| description | TEXT | nullable |
| owner_id | UUID NOT NULL | `REFERENCES auth.users(id) ON DELETE CASCADE` |
| position | INTEGER DEFAULT 0 | 並び順 |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| archived_at | TIMESTAMPTZ | ソフト削除 |

`projects` に列追加:

- `group_id UUID REFERENCES project_groups(id) ON DELETE SET NULL`（NULL = 未分類）
- INDEX `idx_projects_group_id`

グループ削除時は所属プロジェクトを削除せず `group_id` を NULL に戻す（`ON DELETE SET NULL`）。

## RLS

既存 projects と同じ owner ベース。`owner_id = auth.uid()` で select/insert/update/delete を許可。

## RPC（SECURITY DEFINER, 既存 create_project に準拠）

- `create_project_group(group_name TEXT, group_description TEXT DEFAULT NULL)` → `project_groups`
- `create_project` を **3引数版に拡張**: `create_project(project_name TEXT, project_description TEXT DEFAULT NULL, project_group_id UUID DEFAULT NULL)`。
  旧 2引数版は DROP して置き換える（挿入時に `group_id` をセット）。GRANT を新シグネチャで再付与。

プロジェクトのグループ移動は RPC を追加せず、既存 RLS 下での直接 `update projects set group_id` で対応。

## UI

### サイドバー（`components/layout/sidebar.tsx`）

Projects セクションを **グループ折りたたみツリー**に変更:

```
Projects                              [+group] [+project]
  ▸ Estate Flow            (chevron で開閉)
      • project A
      • project B
  ▸ Silicon Atlas
      • project C
  Ungrouped
      • Inbox   ← 従来どおり先頭ピン留め
      • project D
```

- グループ見出しは chevron クリックで開閉（開閉状態は localStorage に保存）
- グループ末尾の「＋」で配下にプロジェクト作成（`CreateProjectDialog` に group を渡す）
- ヘッダの「＋group」で `CreateGroupDialog` を開く
- 各プロジェクト行に `...` の `DropdownMenu` を出し「グループへ移動 / グループから外す」を提供
- 既存の DnD（タスクをサイドバーの project にドロップ）は現状維持

### ダイアログ

- `CreateGroupDialog`（新規, `create-group-dialog.tsx`）: name / description。`create_project_group` RPC 呼び出し。
- `CreateProjectDialog`（既存改修）: 任意の **グループ選択 `Select`** を追加。作成時 `create_project` に `project_group_id` を渡す。RPC 未適用環境向けフォールバック（直接 insert）にも `group_id` を含める。

### フック

- `hooks/use-project-groups.ts`（新規）: `project_groups` を position 順で取得。
- `hooks/use-projects.ts`（改修）: `select('*')` は維持（`group_id` 込み）。Inbox 先頭ピンは維持。

## agent API

- `GET /api/agent/projects`: レスポンスに `group_id` を含める。任意クエリ `?group_id=` で絞り込み。
- `POST /api/agent/projects`: body に任意 `group_id` を受け付け、insert に反映。
- 新規 `GET/POST /api/agent/project-groups`:
  - GET: グループ一覧（`read:tasks` スコープ）
  - POST: グループ作成（`write:tasks` スコープ、project-scoped エージェントは 403、owner は `resolveOwnerUserId` 準拠）
  - 監査ログ `project_groups.list` / `project_groups.create` を記録
- `/api/v1/agent/project-groups` に re-export を追加。

## スコープ外（今回やらない）

- 任意深度のネスト（2階層固定）
- iPhone ウィジェット（Scriptable）のグループ対応 — 必要なら次段
- グループ単位のアーカイブ一括操作 UI（テーブルに `archived_at` は用意するが UI は最小）
- グループ間ドラッグ移動（移動は DropdownMenu で対応）

## テスト / 検証

- マイグレーション適用後、`create_project_group` / 3引数 `create_project` が通ること（SQL）
- サイドバーでグループ作成 → 配下にプロジェクト作成 → ツリー表示・開閉
- 既存プロジェクトを `...` メニューでグループへ移動 / 解除
- agent API: group 作成・一覧、project 作成時の group_id、group_id 絞り込み
- 認証必須のため UI 検証はユーザーのログイン後に Browser pane で実施
