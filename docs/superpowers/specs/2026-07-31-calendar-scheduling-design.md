# カレンダー機能 / タスクのスケジューリング — 設計

日付: 2026-07-31

## 目的

Relay に週／月のカレンダービューを追加し、タスクを「いつ作業するか」で日付および時間枠に
割り当てられるようにする。締切（`due_date`）とは別に作業予定を持たせることで、
「締切は金曜だが作業は水曜の午前にやる」を表現できるようにする。

## 用語

- **締切** — 既存の `tasks.due_date`。いつまでに終わらせるか。
- **予定** — 本設計で追加する `scheduled_*`。いつ作業するか。
- **終日予定** — 日付だけ決まっていて時刻未定の予定。
- **時間ブロック** — 開始・終了時刻まで決まっている予定。

## データモデル

migration `supabase/migrations/0014_add_task_schedule.sql` で `tasks` に3列追加する。

```sql
ALTER TABLE tasks
  ADD COLUMN scheduled_date       DATE,
  ADD COLUMN scheduled_start_time TIME,
  ADD COLUMN scheduled_end_time   TIME;

ALTER TABLE tasks ADD CONSTRAINT task_schedule_valid CHECK (
  (scheduled_start_time IS NULL) = (scheduled_end_time IS NULL)
  AND (scheduled_start_time IS NULL OR scheduled_date IS NOT NULL)
  AND (scheduled_end_time IS NULL OR scheduled_end_time > scheduled_start_time)
);

CREATE INDEX idx_tasks_scheduled_date ON tasks(scheduled_date) WHERE scheduled_date IS NOT NULL;
```

### 状態の表現

| 状態 | `scheduled_date` | `scheduled_start_time` | `scheduled_end_time` |
|---|---|---|---|
| 未スケジュール | NULL | NULL | NULL |
| 終日予定 | あり | NULL | NULL |
| 時間ブロック | あり | あり | あり |

### `TIMESTAMPTZ` を採用しない理由

`TIMESTAMPTZ` 1組で表現すると、終日予定を「その日の 00:00」として保存することになり、
保存時と表示時のタイムゾーンが食い違うと日付がずれる。`DATE` と `TIME` を分ければ
この問題は原理的に発生しない。既存の `due_date DATE` とも表現が揃い、
週の範囲取得も `scheduled_date` 単一列のレンジ検索で済む。

### 制約と決定事項

- 日をまたぐブロックは作れない。23:00 以降にドロップした場合は終了時刻を `23:59` に丸める。
- カレンダーに載るのは親タスクのみ（`parent_task_id IS NULL`）。Today ビューと同じ扱い。
  サブタスクの時間ブロッキングは対象外。
- `due_date` の型・意味・既存ロジックは一切変更しない。Today / List / Board の挙動は不変。
- RLS は既存の `tasks` ポリシーがそのまま適用される。追加ポリシーは不要。

## 画面構成

サイドバーに `/calendar` を追加する（Today の下）。全プロジェクト横断の単一ビュー。

```
app/(dashboard)/calendar/page.tsx          ルート。週/月モード、表示範囲、フィルタの状態を保持
components/calendar/calendar-header.tsx    前後移動・今日・週/月トグル・プロジェクトフィルタ
components/calendar/week-view.tsx          終日行 + 7日×時間グリッド（メイン）
components/calendar/month-view.tsx         月グリッド（俯瞰用・チップ表示）
components/calendar/task-block.tsx         予定ブロック（ドラッグ / 下端リサイズ）
components/calendar/due-chip.tsx           締切マーカー（旗アイコン付きの細いチップ）
components/calendar/unscheduled-tray.tsx   未スケジュールタスク一覧
components/calendar/assign-task-dialog.tsx 空きスロットから cmdk でタスクを選んで割り当て
lib/calendar/schedule.ts                   純関数群（時刻↔座標、吸着、重なりレイアウト、検証）
lib/calendar/schedule.test.ts              schedule.ts の単体テスト
hooks/use-calendar-tasks.ts                期間クエリ / 未スケジュールクエリ / 更新 mutation
```

日付演算・レイアウト計算はすべて `lib/calendar/schedule.ts` の純関数に置き、
React コンポーネントは描画とイベント配線のみを担当する。これにより
カレンダーの中核ロジックをブラウザなしで vitest から検証できる。

### 週ビュー

- 時間グリッドは30分刻み。既定の表示範囲は 6:00–22:00 で、スクロールで24時間分にアクセスできる。
- 上部に終日行を置き、終日予定と締切チップを並べる。
- 同時刻に重なる複数ブロックは横に分割して並べる（レイアウト計算は `schedule.ts`）。
- モバイルでは横スクロールで7日分を保持する（日数を減らさない）。

### 月ビュー

各日セルに予定チップを積む俯瞰用ビュー。セル内は「終日予定 → 時間ブロック（開始時刻順）」で並べ、
入りきらない分は「他 N 件」で畳む。月ビューから週ビューへは日付クリックで遷移する。

### 締切の表示

`due_date` を持つタスクは、予定ブロックとは別スタイルの細いチップ（旗アイコン付き）として
終日行／月セルに表示する。予定ブロックと締切チップは同一タスクでも両方表示されうる
（水曜に作業予定、金曜が締切なら、水曜にブロック・金曜にチップ）。

### 完了タスクの扱い

完了タスクはカレンダー上から消さず、取り消し線と減光で残す。作業記録としての価値を失わないため。
未スケジュールトレイには表示しない。

## 割り当て操作

デスクトップはドラッグ＆ドロップ、モバイルはタップ経路を用意する。

### ドラッグ（デスクトップ）

既存のグローバル `TaskDndProvider` の `DndContext` をそのまま使い、カレンダー側は
`useDndMonitor` でドロップを処理する（Board / List と同じパターン）。

- ドロップ先 ID: `calendar-slot-{yyyy-MM-dd}-{開始分}` / `calendar-allday-{yyyy-MM-dd}`
- トレイ → 時間枠: そのスロットを開始時刻に、終了時刻は **+60分**
- トレイ → 終日枠: `scheduled_date` のみセット、時刻2列は NULL
- カレンダー内ブロックの移動も同じ経路を通る（`TaskDragData.source` に `'calendar' | 'tray'` を追加）
- `TaskDndProvider` の `collisionDetection` にカレンダー用の分岐を1つ追加する。
  サイドバーへのドロップを最優先する現在の挙動は維持する。

### リサイズ

ブロック下端のリサイズは dnd-kit を使わず素の pointer イベントで実装し、30分刻みに吸着させる。
最小の長さは30分。dnd-kit に2軸目を持ち込むより単純で、モバイルでの誤操作も避けられる。

### タップ（モバイル）

- 空きスロットをタップ → `assign-task-dialog` が開く → cmdk で未スケジュールタスクを検索 → 割り当て
- トレイのタスクをタップ → 同じダイアログで日付と時刻を指定
- 未スケジュールトレイはモバイルでは下部シートとして開閉する

### 解除

予定ブロックの右クリック（モバイルは長押し）メニューから「予定を外す」で3列を NULL に戻す。
タスクは未スケジュールトレイへ戻る。

### 更新方式

すべての予定変更は楽観的更新で行う。`onMutate` でキャッシュを書き換え、失敗時にロールバックし、
`onSettled` で invalidate する。既存の `hooks/use-tasks.ts` および Today ページと同じ書き方に揃える。

## データ取得とリアルタイム

- **期間クエリ** — 表示範囲に `scheduled_date` が入るタスク、または `due_date` が入るタスクを
  1クエリで取得する（Supabase の `.or()`）。プロジェクト名・タグ・担当エージェントを join。
  `queryKey: ['calendar-tasks', rangeStart, rangeEnd]`
- **未スケジュールクエリ** — `scheduled_date IS NULL` かつ `status != 'done'` かつ
  `parent_task_id IS NULL`。`due_date` 昇順 → 優先度順、上限100件。
  `queryKey: ['unscheduled-tasks']`
- **プロジェクトフィルタ** — サーバ側ではなくクライアント側で絞る。取得済みデータを
  絞るだけなのでフィルタ切り替えで再取得が走らない。
- **リアルタイム** — `hooks/use-realtime.ts` に `useCalendarRealtime()` を追加する。
  ペイロードに join 列が含まれないため、Today と同じく invalidate 方式にする。

## Agent API / MCP

`app/api/agent/tasks/route.ts`（POST）と `app/api/agent/tasks/[id]/route.ts`（PATCH）に
3フィールドを追加する。`/api/v1/agent/*` は同じハンドラを re-export しているため自動で追随する。
GET は `select('*')` なので読み取りは変更不要。

バリデーション（既存の `due_date` の書き方に合わせる）:

- `scheduled_date` — `YYYY-MM-DD` または `null`
- `scheduled_start_time` / `scheduled_end_time` — `HH:MM` または `null`。必ず両方セットで指定する。
  片方だけの指定は 400。`end > start` でなければ 400。
- `scheduled_date` に `null` を指定した場合、時刻2列も自動で `null` にする。

これによりエージェントから「このタスクを明日10時から2時間で入れる」が実行できる。

MCP サーバ（relay-mcp、別リポジトリ）の `task_create` / `task_update` のツールスキーマにも
同じフィールドが必要かは計画時に確認する。必要なら別作業として切り出す。

## テスト

`lib/calendar/schedule.test.ts`（vitest）で以下を検証する。

- ドロップ座標 → `scheduled_date` / 時刻2列への変換（30分吸着、既定60分、終日枠）
- 23:00 以降のドロップで日をまたがず `23:59` に丸められること
- 重なるブロックの横並びレイアウト計算
- 不正な組み合わせを弾くこと（時刻の片側だけ、`end <= start`、日付なしの時刻）
- リサイズ後の最小長（30分）の担保

UI は実ブラウザで確認する（全ルートが認証必須のため、ログイン後の Browser pane で検証）。

## 対象外

- 1タスクを複数の時間ブロックに分割すること（`task_schedule_blocks` テーブル案）
- Google カレンダー等の外部カレンダー連携
- 繰り返し予定
- 他メンバーの予定を並べるリソース配分ビュー
- プロジェクト内の Calendar タブ（横断ビューのみ）
- Today ビューに `scheduled_date` を反映すること（締切ベースの現状を維持）
- サブタスクのスケジューリング
