# カレンダー機能 / タスクスケジューリング 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relay に週／月のカレンダービュー `/calendar` を追加し、タスクを日付・時間枠にドラッグまたはタップで割り当てられるようにする。

**Architecture:** `tasks` に `scheduled_date DATE` / `scheduled_start_time TIME` / `scheduled_end_time TIME` の3列を追加し、締切 `due_date` とは独立した「作業予定」を表現する。カレンダーの計算ロジック（時刻↔ピクセル変換、スロット吸着、重なりレイアウト、ドロップ先ID）はすべて `lib/calendar/` の純関数に切り出して vitest で検証し、React コンポーネントは描画とイベント配線のみを担当する。ドラッグは既存のグローバル `TaskDndProvider` の `DndContext` に相乗りし、カレンダー側は `useDndMonitor` でドロップを受ける（Board / List と同じパターン）。

**Tech Stack:** Next.js 16.2.7 (App Router) / React 19.2.4 / TypeScript / Supabase (`@supabase/ssr`, `@supabase/supabase-js`) / TanStack Query v5 / dnd-kit / date-fns v4 / Tailwind v4 / shadcn-style UI (`components/ui/`) / vitest v4

**設計書:** `docs/superpowers/specs/2026-07-31-calendar-scheduling-design.md`

## Global Constraints

- **Next.js 16 は訓練データと異なる。** コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読むこと（`AGENTS.md` の指示）。
- **`DropdownMenuItem` のハンドラは `onSelect` ではなく `onClick`。** Base UI の `MenuItem` に
  `onSelect` は無く、`div` の汎用属性として型チェックを素通りしたうえで一切発火しない（＝黙って死ぬ）。
  メニューを閉じたくない場合は `closeOnClick={false}` を併用する。既存作法は
  `components/layout/sidebar.tsx:116`。なお `CommandItem`（cmdk）の `onSelect` は正しいので混同しないこと。
- **`components/ui/` は Radix ではなく Base UI（`@base-ui/react`）のラッパー。`asChild` は存在しない。**
  `DropdownMenuTrigger` / `SheetTrigger` / `DialogTrigger` にボタンを入れ子にせず、トリガー自体に
  className を当てる（既存作法は `components/layout/sidebar.tsx:93`）。ボタン見た目が要る場合は
  `cn(buttonVariants({ variant, size }), '追加クラス')` を使う（`buttonVariants` は
  `components/ui/button.tsx` から export 済み）。
- **既存の `due_date` の型・意味・利用箇所を変更しない。** Today / List / Board / Inbox / My Tasks の挙動は不変であること。
- **カレンダーに載るのは親タスクのみ**（`parent_task_id IS NULL`）。サブタスクのスケジューリングは対象外。
- **日をまたぐブロックは作らない。** 終了時刻の上限は `23:59`。
- **タイムゾーン変換を一切行わない。** `scheduled_date` は `YYYY-MM-DD` 文字列、時刻は `HH:MM` 文字列としてそのまま扱う。`new Date()` を経由した日付文字列の再生成をしない。
- 既存コードのスタイルに合わせる: Supabase クライアントの型は `(supabase.from('tasks') as any)` でキャスト、コメントは日本語、`'use client'` はクライアントコンポーネントの先頭。
- コンポーネントのファイルは1責務。肥大化させない。
- **不可逆操作（`npx supabase db push` = 本番DBへのマイグレーション適用）の前にユーザーへ確認を取り、承認を待つこと**（`AGENTS.md` の安全弁）。
- 検証コマンド: `npm test`（vitest）/ `npm run lint` / `npm run build`

## テスト方針（重要）

このリポジトリには **コンポーネントテストの環境がない**（`@testing-library/*` も jsdom も未導入、vitest の設定ファイルもなく `vitest run` がデフォルト設定で走るだけ）。導入は本計画のスコープ外とする。

したがって:

- **純関数（`lib/calendar/`）は TDD で書く。** テストを先に書き、失敗を確認してから実装する。カレンダーの正しさの大半はここに集約されているため、ロジックは必ず純関数側へ寄せること。
- **React コンポーネントは `npm run lint` + `npm run build` + 実ブラウザ確認をゲートとする。** コンポーネント内にテストできないロジックを書きそうになったら、それは `lib/calendar/` に移すサインである。
- 実ブラウザ確認は全ルートが認証必須のため、ユーザーがログインした状態の Browser pane で行う。

## File Structure

**新規作成**

| ファイル | 責務 |
|---|---|
| `supabase/migrations/0014_add_task_schedule.sql` | `tasks` に3列＋CHECK制約＋部分インデックスを追加 |
| `lib/calendar/schedule.ts` | 時刻⇔分⇔ピクセル変換、スロット吸着、スケジュール生成、検証 |
| `lib/calendar/schedule.test.ts` | 上記の単体テスト |
| `lib/calendar/layout.ts` | ドロップ先ID の生成/解析、重なりブロックの横並びレイアウト |
| `lib/calendar/layout.test.ts` | 上記の単体テスト |
| `lib/calendar/unscheduled-order.ts` | 未スケジュールタスクの並び順比較関数 |
| `lib/calendar/unscheduled-order.test.ts` | 上記の単体テスト |
| `lib/calendar/validate-schedule-input.ts` | エージェント API から届く `scheduled_*` の検証 |
| `lib/calendar/validate-schedule-input.test.ts` | 上記の単体テスト |
| `hooks/use-calendar-tasks.ts` | 期間クエリ / 未スケジュールクエリ / スケジュール更新 mutation |
| `app/(dashboard)/calendar/page.tsx` | ルート。週/月モード・表示範囲・プロジェクトフィルタの状態を保持 |
| `components/calendar/calendar-header.tsx` | 前後移動・Today・週/月トグル・プロジェクトフィルタ |
| `components/calendar/week-view.tsx` | 終日行 + 7日×時間グリッド。ドロップ受け口 |
| `components/calendar/month-view.tsx` | 月グリッド（チップ表示、日付クリックで週へ） |
| `components/calendar/task-block.tsx` | 予定ブロック。ドラッグ・リサイズ・メニュー |
| `components/calendar/due-chip.tsx` | 締切マーカー（旗アイコン付きの細いチップ） |
| `components/calendar/unscheduled-tray.tsx` | 未スケジュールタスク一覧（デスクトップは左パネル、モバイルは下部シート） |
| `components/calendar/assign-task-dialog.tsx` | cmdk でタスクを選び日時を指定して割り当て |

**変更**

| ファイル | 変更内容 |
|---|---|
| `components/layout/sidebar.tsx` | Today の下に `/calendar` へのリンクを追加 |
| `components/dnd/task-dnd-provider.tsx` | `collisionDetection` にカレンダー用分岐、`invalidateTaskViews` にカレンダーの queryKey を追加 |
| `hooks/use-realtime.ts` | `useCalendarRealtime()` を追加 |
| `app/api/agent/tasks/route.ts` | POST に `scheduled_*` 3フィールドを追加 |
| `app/api/agent/tasks/[id]/route.ts` | PATCH に `scheduled_*` 3フィールドを追加 |

---

## Task 1: DBスキーマにスケジュール列を追加

**Files:**
- Create: `supabase/migrations/0014_add_task_schedule.sql`

**Interfaces:**
- Consumes: なし
- Produces: `tasks.scheduled_date DATE` / `tasks.scheduled_start_time TIME` / `tasks.scheduled_end_time TIME`。以降すべてのタスクがこの3列に依存する。

- [ ] **Step 1: マイグレーションファイルを作成**

`supabase/migrations/0014_add_task_schedule.sql`:

```sql
-- タスクの作業予定（scheduled）。締切 due_date とは独立した「いつやるか」を表す。
--
-- 表現:
--   未スケジュール : scheduled_date = NULL
--   終日予定       : scheduled_date のみ（時刻2列は NULL）
--   時間ブロック   : 3列すべて
--
-- TIMESTAMPTZ ではなく DATE + TIME に分けているのは、終日予定を「その日の00:00」として
-- 保存するとタイムゾーン次第で日付がずれるため。分けておけば変換が発生しない。

ALTER TABLE tasks
  ADD COLUMN scheduled_date       DATE,
  ADD COLUMN scheduled_start_time TIME,
  ADD COLUMN scheduled_end_time   TIME;

ALTER TABLE tasks ADD CONSTRAINT task_schedule_valid CHECK (
  -- 時刻は必ずセットで持つ
  (scheduled_start_time IS NULL) = (scheduled_end_time IS NULL)
  -- 日付なしに時刻だけは持てない
  AND (scheduled_start_time IS NULL OR scheduled_date IS NOT NULL)
  -- 終了は開始より後（日をまたぐブロックは作らない）
  AND (scheduled_end_time IS NULL OR scheduled_end_time > scheduled_start_time)
);

CREATE INDEX idx_tasks_scheduled_date
  ON tasks(scheduled_date)
  WHERE scheduled_date IS NOT NULL;
```

- [ ] **Step 2: ユーザーに適用の承認を得る（STOP）**

`npx supabase db push` は本番 Supabase への不可逆操作にあたる。実行前にユーザーへ次を伝えて承認を待つこと:

> `supabase/migrations/0014_add_task_schedule.sql` を本番 Supabase に適用します（`tasks` に3列追加＋CHECK制約＋インデックス。既存データは変更しません）。進めますか？

承認が得られるまで Step 3 に進まない。

- [ ] **Step 3: マイグレーションを適用**

Run: `npx supabase db push`
Expected: `0014_add_task_schedule.sql` が適用され、エラーなく完了する。

- [ ] **Step 4: 列と制約が入ったことを確認**

Supabase の SQL エディタ（またはユーザーの用意した接続）で次を実行する:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name LIKE 'scheduled%'
ORDER BY column_name;
```

Expected: 3行返る（`scheduled_date` = `date`、`scheduled_end_time` = `time without time zone`、`scheduled_start_time` = `time without time zone`）。

続けて制約が効いていることを確認する（エラーになるのが正しい）:

```sql
-- 時刻の片側だけ → 失敗するはず
UPDATE tasks SET scheduled_date = '2026-08-01', scheduled_start_time = '10:00', scheduled_end_time = NULL
WHERE id = (SELECT id FROM tasks LIMIT 1);
```

Expected: `new row for relation "tasks" violates check constraint "task_schedule_valid"`

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/0014_add_task_schedule.sql
git commit -m "feat(db): タスクに作業予定の列(scheduled_date/start_time/end_time)を追加"
```

---

## Task 2: スケジュール計算の純関数（時刻・吸着・生成・検証）

**Files:**
- Create: `lib/calendar/schedule.ts`
- Test: `lib/calendar/schedule.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface TaskSchedule { scheduled_date: string | null; scheduled_start_time: string | null; scheduled_end_time: string | null }`
  - `const SLOT_MINUTES = 30` / `DEFAULT_BLOCK_MINUTES = 60` / `MIN_BLOCK_MINUTES = 30` / `DAY_END_MINUTES = 1439` / `HOUR_HEIGHT_PX = 48`
  - `timeToMinutes(time: string): number`
  - `minutesToTime(minutes: number): string`
  - `snapStartMinutes(minutes: number): number`
  - `snapDurationMinutes(minutes: number): number`
  - `minutesToPx(minutes: number): number`
  - `pxToMinutes(px: number): number`
  - `buildTimedSchedule(date: string, startMinutes: number, durationMinutes?: number): TaskSchedule`
  - `buildAllDaySchedule(date: string): TaskSchedule`
  - `const CLEARED_SCHEDULE: TaskSchedule`
  - `isValidSchedule(schedule: TaskSchedule): boolean`
  - `getDurationMinutes(schedule: TaskSchedule): number | null`

- [ ] **Step 1: 失敗するテストを書く**

`lib/calendar/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildAllDaySchedule,
  buildTimedSchedule,
  CLEARED_SCHEDULE,
  DAY_END_MINUTES,
  getDurationMinutes,
  isValidSchedule,
  minutesToPx,
  minutesToTime,
  pxToMinutes,
  snapDurationMinutes,
  snapStartMinutes,
  timeToMinutes,
} from './schedule'

describe('timeToMinutes / minutesToTime', () => {
  it('HH:MM を分に変換する', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:30')).toBe(570)
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  it('秒付きの TIME 値も受け付ける（Postgres は 09:30:00 を返す）', () => {
    expect(timeToMinutes('09:30:00')).toBe(570)
  })

  it('分を HH:MM に変換する', () => {
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(570)).toBe('09:30')
    expect(minutesToTime(1439)).toBe('23:59')
  })

  it('範囲外の分は 0〜23:59 に丸める', () => {
    expect(minutesToTime(-10)).toBe('00:00')
    expect(minutesToTime(2000)).toBe('23:59')
  })

  it('不正な文字列は例外', () => {
    expect(() => timeToMinutes('9:30')).toThrow()
    expect(() => timeToMinutes('')).toThrow()
  })
})

describe('snapStartMinutes', () => {
  it('30分刻みに切り下げる', () => {
    expect(snapStartMinutes(0)).toBe(0)
    expect(snapStartMinutes(29)).toBe(0)
    expect(snapStartMinutes(30)).toBe(30)
    expect(snapStartMinutes(599)).toBe(570)
  })

  it('負値は 0 に、遅すぎる開始は 23:30 に丸める（30分の枠が入る最後のスロット）', () => {
    expect(snapStartMinutes(-50)).toBe(0)
    expect(snapStartMinutes(1430)).toBe(1410)
    expect(snapStartMinutes(9999)).toBe(1410)
  })
})

describe('snapDurationMinutes', () => {
  it('30分刻みに丸め、最小30分を保証する', () => {
    expect(snapDurationMinutes(60)).toBe(60)
    expect(snapDurationMinutes(44)).toBe(30)
    expect(snapDurationMinutes(46)).toBe(60)
    expect(snapDurationMinutes(1)).toBe(30)
    expect(snapDurationMinutes(-100)).toBe(30)
  })
})

describe('minutesToPx / pxToMinutes', () => {
  it('1時間 = 48px で相互変換する', () => {
    expect(minutesToPx(60)).toBe(48)
    expect(minutesToPx(30)).toBe(24)
    expect(pxToMinutes(48)).toBe(60)
    expect(pxToMinutes(24)).toBe(30)
  })
})

describe('buildTimedSchedule', () => {
  it('既定は60分の枠', () => {
    expect(buildTimedSchedule('2026-08-03', 540)).toEqual({
      scheduled_date: '2026-08-03',
      scheduled_start_time: '09:00',
      scheduled_end_time: '10:00',
    })
  })

  it('開始は30分刻みに吸着する', () => {
    expect(buildTimedSchedule('2026-08-03', 553).scheduled_start_time).toBe('09:00')
  })

  it('所要時間を指定できる', () => {
    expect(buildTimedSchedule('2026-08-03', 540, 120).scheduled_end_time).toBe('11:00')
  })

  it('日をまたがず 23:59 で止まる', () => {
    const schedule = buildTimedSchedule('2026-08-03', 23 * 60, 120)
    expect(schedule.scheduled_start_time).toBe('23:00')
    expect(schedule.scheduled_end_time).toBe('23:59')
  })

  it('最小30分を下回らない', () => {
    expect(buildTimedSchedule('2026-08-03', 540, 5).scheduled_end_time).toBe('09:30')
  })
})

describe('buildAllDaySchedule / CLEARED_SCHEDULE', () => {
  it('終日予定は日付のみ持つ', () => {
    expect(buildAllDaySchedule('2026-08-03')).toEqual({
      scheduled_date: '2026-08-03',
      scheduled_start_time: null,
      scheduled_end_time: null,
    })
  })

  it('予定解除は3列すべて null', () => {
    expect(CLEARED_SCHEDULE).toEqual({
      scheduled_date: null,
      scheduled_start_time: null,
      scheduled_end_time: null,
    })
  })
})

describe('isValidSchedule', () => {
  it('DBの CHECK 制約と同じ組み合わせを許可する', () => {
    expect(isValidSchedule(CLEARED_SCHEDULE)).toBe(true)
    expect(isValidSchedule(buildAllDaySchedule('2026-08-03'))).toBe(true)
    expect(isValidSchedule(buildTimedSchedule('2026-08-03', 540))).toBe(true)
  })

  it('時刻の片側だけは不正', () => {
    expect(isValidSchedule({
      scheduled_date: '2026-08-03', scheduled_start_time: '09:00', scheduled_end_time: null,
    })).toBe(false)
  })

  it('日付なしの時刻は不正', () => {
    expect(isValidSchedule({
      scheduled_date: null, scheduled_start_time: '09:00', scheduled_end_time: '10:00',
    })).toBe(false)
  })

  it('終了が開始以前は不正', () => {
    expect(isValidSchedule({
      scheduled_date: '2026-08-03', scheduled_start_time: '10:00', scheduled_end_time: '10:00',
    })).toBe(false)
    expect(isValidSchedule({
      scheduled_date: '2026-08-03', scheduled_start_time: '11:00', scheduled_end_time: '10:00',
    })).toBe(false)
  })
})

describe('getDurationMinutes', () => {
  it('時間ブロックは長さを返す', () => {
    expect(getDurationMinutes(buildTimedSchedule('2026-08-03', 540, 90))).toBe(90)
  })

  it('終日・未スケジュールは null', () => {
    expect(getDurationMinutes(buildAllDaySchedule('2026-08-03'))).toBeNull()
    expect(getDurationMinutes(CLEARED_SCHEDULE)).toBeNull()
  })
})

describe('DAY_END_MINUTES', () => {
  it('23:59 を指す', () => {
    expect(DAY_END_MINUTES).toBe(1439)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/calendar/schedule.test.ts`
Expected: FAIL（`Failed to resolve import "./schedule"`）

- [ ] **Step 3: 実装を書く**

`lib/calendar/schedule.ts`:

```ts
// カレンダーの時刻計算。React に依存しない純関数のみを置く。
// 日付は 'YYYY-MM-DD'、時刻は 'HH:MM' の文字列で扱い、タイムゾーン変換は一切しない。

export interface TaskSchedule {
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
}

/** グリッドの刻み幅（分） */
export const SLOT_MINUTES = 30
/** 時間枠にドロップしたときの既定の長さ（分） */
export const DEFAULT_BLOCK_MINUTES = 60
/** ブロックの最小の長さ（分） */
export const MIN_BLOCK_MINUTES = 30
/** 1日の終端。日をまたぐブロックは作らない（23:59） */
export const DAY_END_MINUTES = 23 * 60 + 59
/** 週ビューの1時間あたりの高さ（px） */
export const HOUR_HEIGHT_PX = 48

/** 30分の枠が収まる最後の開始スロット（23:30） */
const LAST_START_MINUTES = DAY_END_MINUTES - MIN_BLOCK_MINUTES + 1

export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!match) throw new Error(`invalid time: ${time}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_END_MINUTES, Math.round(minutes)))
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** ドロップ位置から開始時刻を決める。切り下げなので、掴んだ位置より後ろにずれない */
export function snapStartMinutes(minutes: number): number {
  const snapped = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES
  return Math.max(0, Math.min(LAST_START_MINUTES, snapped))
}

/** リサイズ後の長さを30分刻みに丸める。最小30分 */
export function snapDurationMinutes(minutes: number): number {
  const snapped = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES
  return Math.max(MIN_BLOCK_MINUTES, snapped)
}

export function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT_PX
}

export function pxToMinutes(px: number): number {
  return (px / HOUR_HEIGHT_PX) * 60
}

export function buildTimedSchedule(
  date: string,
  startMinutes: number,
  durationMinutes: number = DEFAULT_BLOCK_MINUTES,
): TaskSchedule {
  const start = snapStartMinutes(startMinutes)
  const duration = Math.max(MIN_BLOCK_MINUTES, Math.round(durationMinutes))
  const end = Math.min(DAY_END_MINUTES, start + duration)
  return {
    scheduled_date: date,
    scheduled_start_time: minutesToTime(start),
    scheduled_end_time: minutesToTime(end),
  }
}

export function buildAllDaySchedule(date: string): TaskSchedule {
  return { scheduled_date: date, scheduled_start_time: null, scheduled_end_time: null }
}

export const CLEARED_SCHEDULE: TaskSchedule = {
  scheduled_date: null,
  scheduled_start_time: null,
  scheduled_end_time: null,
}

/** DB の task_schedule_valid と同じ判定。書き込み前にここで弾く */
export function isValidSchedule(schedule: TaskSchedule): boolean {
  const hasStart = schedule.scheduled_start_time !== null
  const hasEnd = schedule.scheduled_end_time !== null
  if (hasStart !== hasEnd) return false
  if (!hasStart) return true
  if (!schedule.scheduled_date) return false
  return timeToMinutes(schedule.scheduled_end_time!) > timeToMinutes(schedule.scheduled_start_time!)
}

export function getDurationMinutes(schedule: TaskSchedule): number | null {
  if (!schedule.scheduled_start_time || !schedule.scheduled_end_time) return null
  return timeToMinutes(schedule.scheduled_end_time) - timeToMinutes(schedule.scheduled_start_time)
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/calendar/schedule.test.ts`
Expected: PASS（全ケース green）

- [ ] **Step 5: コミット**

```bash
git add lib/calendar/schedule.ts lib/calendar/schedule.test.ts
git commit -m "feat(calendar): スケジュール計算の純関数を追加"
```

---

## Task 3: ドロップ先IDと重なりレイアウトの純関数

**Files:**
- Create: `lib/calendar/layout.ts`
- Test: `lib/calendar/layout.test.ts`

**Interfaces:**
- Consumes: `lib/calendar/schedule.ts` の `timeToMinutes`
- Produces:
  - `dayColumnDroppableId(date: string): string` → `calendar-day-{date}`
  - `allDayDroppableId(date: string): string` → `calendar-allday-{date}`
  - `parseCalendarDroppableId(id: string): { kind: 'day' | 'all-day'; date: string } | null`
  - `interface CalendarBlock { id: string; startMinutes: number; endMinutes: number }`
  - `interface PositionedBlock extends CalendarBlock { column: number; columnCount: number }`
  - `layoutBlocks(blocks: CalendarBlock[]): PositionedBlock[]`
  - `toCalendarBlock(id: string, startTime: string, endTime: string): CalendarBlock`

- [ ] **Step 1: 失敗するテストを書く**

`lib/calendar/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  allDayDroppableId,
  dayColumnDroppableId,
  layoutBlocks,
  parseCalendarDroppableId,
  toCalendarBlock,
} from './layout'

describe('droppable id', () => {
  it('日カラムと終日行の ID を作る', () => {
    expect(dayColumnDroppableId('2026-08-03')).toBe('calendar-day-2026-08-03')
    expect(allDayDroppableId('2026-08-03')).toBe('calendar-allday-2026-08-03')
  })

  it('作った ID を解析できる', () => {
    expect(parseCalendarDroppableId('calendar-day-2026-08-03'))
      .toEqual({ kind: 'day', date: '2026-08-03' })
    expect(parseCalendarDroppableId('calendar-allday-2026-08-03'))
      .toEqual({ kind: 'all-day', date: '2026-08-03' })
  })

  it('カレンダー以外の ID は null（サイドバーやボードのドロップ先と衝突しない）', () => {
    expect(parseCalendarDroppableId('sidebar-my-tasks')).toBeNull()
    expect(parseCalendarDroppableId('column-todo')).toBeNull()
    expect(parseCalendarDroppableId('calendar-day-2026-8-3')).toBeNull()
    expect(parseCalendarDroppableId('')).toBeNull()
  })
})

describe('toCalendarBlock', () => {
  it('HH:MM をブロックに変換する', () => {
    expect(toCalendarBlock('t1', '09:00', '10:30'))
      .toEqual({ id: 't1', startMinutes: 540, endMinutes: 630 })
  })
})

describe('layoutBlocks', () => {
  it('重ならないブロックは全幅（columnCount 1）', () => {
    const result = layoutBlocks([
      { id: 'a', startMinutes: 540, endMinutes: 600 },
      { id: 'b', startMinutes: 660, endMinutes: 720 },
    ])
    expect(result).toEqual([
      { id: 'a', startMinutes: 540, endMinutes: 600, column: 0, columnCount: 1 },
      { id: 'b', startMinutes: 660, endMinutes: 720, column: 0, columnCount: 1 },
    ])
  })

  it('完全に重なる2つは半分ずつに割れる', () => {
    const result = layoutBlocks([
      { id: 'a', startMinutes: 540, endMinutes: 600 },
      { id: 'b', startMinutes: 540, endMinutes: 600 },
    ])
    expect(result.map(block => [block.id, block.column, block.columnCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ])
  })

  it('連鎖して重なる3つは同じクラスタとして扱い、空いた列を再利用する', () => {
    // a 9:00-10:00 / b 9:30-10:30 / c 10:00-11:00
    const result = layoutBlocks([
      { id: 'c', startMinutes: 600, endMinutes: 660 },
      { id: 'a', startMinutes: 540, endMinutes: 600 },
      { id: 'b', startMinutes: 570, endMinutes: 630 },
    ])
    expect(result.map(block => [block.id, block.column, block.columnCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ])
  })

  it('隣接（前の終了 = 次の開始）は重なりとみなさない', () => {
    const result = layoutBlocks([
      { id: 'a', startMinutes: 540, endMinutes: 600 },
      { id: 'b', startMinutes: 600, endMinutes: 660 },
    ])
    expect(result.every(block => block.columnCount === 1)).toBe(true)
  })

  it('空配列を渡しても落ちない', () => {
    expect(layoutBlocks([])).toEqual([])
  })

  it('開始時刻順に並べて返す', () => {
    const result = layoutBlocks([
      { id: 'late', startMinutes: 660, endMinutes: 720 },
      { id: 'early', startMinutes: 540, endMinutes: 600 },
    ])
    expect(result.map(block => block.id)).toEqual(['early', 'late'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/calendar/layout.test.ts`
Expected: FAIL（`Failed to resolve import "./layout"`）

- [ ] **Step 3: 実装を書く**

`lib/calendar/layout.ts`:

```ts
// カレンダーのドロップ先 ID と、重なるブロックの横並びレイアウト計算。

import { timeToMinutes } from './schedule'

const DATE_PATTERN = '(\\d{4}-\\d{2}-\\d{2})'
const DAY_ID_RE = new RegExp(`^calendar-day-${DATE_PATTERN}$`)
const ALL_DAY_ID_RE = new RegExp(`^calendar-allday-${DATE_PATTERN}$`)

export function dayColumnDroppableId(date: string): string {
  return `calendar-day-${date}`
}

export function allDayDroppableId(date: string): string {
  return `calendar-allday-${date}`
}

export function parseCalendarDroppableId(
  id: string,
): { kind: 'day' | 'all-day'; date: string } | null {
  const day = DAY_ID_RE.exec(id)
  if (day) return { kind: 'day', date: day[1] }

  const allDay = ALL_DAY_ID_RE.exec(id)
  if (allDay) return { kind: 'all-day', date: allDay[1] }

  return null
}

export interface CalendarBlock {
  id: string
  startMinutes: number
  endMinutes: number
}

export interface PositionedBlock extends CalendarBlock {
  /** 0 始まりの列番号 */
  column: number
  /** 同じクラスタ内の列数。幅 = 1 / columnCount */
  columnCount: number
}

export function toCalendarBlock(id: string, startTime: string, endTime: string): CalendarBlock {
  return { id, startMinutes: timeToMinutes(startTime), endMinutes: timeToMinutes(endTime) }
}

/**
 * 重なり合うブロックを横に分割する。
 * 連鎖して重なるものを1つのクラスタにまとめ、クラスタ内で貪欲に列を割り当てる。
 * 列が空けば（前のブロックが終わっていれば）その列を再利用する。
 */
export function layoutBlocks(blocks: CalendarBlock[]): PositionedBlock[] {
  const sorted = [...blocks].sort((a, b) =>
    a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.id.localeCompare(b.id)
  )

  const result: PositionedBlock[] = []
  let cluster: PositionedBlock[] = []
  let columnEnds: number[] = []
  let clusterMaxEnd = -1

  const flushCluster = () => {
    const columnCount = columnEnds.length || 1
    for (const block of cluster) result.push({ ...block, columnCount })
    cluster = []
    columnEnds = []
    clusterMaxEnd = -1
  }

  for (const block of sorted) {
    // クラスタ内のどのブロックとも重ならなくなったら、そこで区切る
    if (cluster.length > 0 && block.startMinutes >= clusterMaxEnd) flushCluster()

    let column = columnEnds.findIndex(end => end <= block.startMinutes)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(block.endMinutes)
    } else {
      columnEnds[column] = block.endMinutes
    }

    cluster.push({ ...block, column, columnCount: 0 })
    clusterMaxEnd = Math.max(clusterMaxEnd, block.endMinutes)
  }

  if (cluster.length > 0) flushCluster()

  return result
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/calendar/layout.test.ts`
Expected: PASS

- [ ] **Step 5: 既存テストも壊れていないことを確認**

Run: `npm test`
Expected: PASS（`lib/quick-add/parse.test.ts` を含め全部 green）

- [ ] **Step 6: コミット**

```bash
git add lib/calendar/layout.ts lib/calendar/layout.test.ts
git commit -m "feat(calendar): ドロップ先IDと重なりレイアウトの計算を追加"
```

---

## Task 4: 未スケジュールタスクの並び順

**Files:**
- Create: `lib/calendar/unscheduled-order.ts`
- Test: `lib/calendar/unscheduled-order.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `compareUnscheduledTasks(a: UnscheduledSortable, b: UnscheduledSortable): number` と
  `interface UnscheduledSortable { due_date: string | null; priority: string | null; title: string | null }`

> `priority` は TEXT 列のため Postgres の `ORDER BY` ではアルファベット順（high, low, medium, urgent）になってしまう。優先度の意味順で並べるためクライアント側で比較する。

- [ ] **Step 1: 失敗するテストを書く**

`lib/calendar/unscheduled-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compareUnscheduledTasks } from './unscheduled-order'

const task = (due_date: string | null, priority: string, title: string) =>
  ({ due_date, priority, title })

describe('compareUnscheduledTasks', () => {
  it('締切が近い順', () => {
    const sorted = [
      task('2026-08-10', 'low', 'b'),
      task('2026-08-01', 'low', 'a'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['a', 'b'])
  })

  it('締切なしは最後', () => {
    const sorted = [
      task(null, 'urgent', 'none'),
      task('2026-12-31', 'low', 'far'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['far', 'none'])
  })

  it('締切が同じなら優先度の高い順', () => {
    const sorted = [
      task('2026-08-01', 'low', 'low'),
      task('2026-08-01', 'urgent', 'urgent'),
      task('2026-08-01', 'medium', 'medium'),
      task('2026-08-01', 'high', 'high'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['urgent', 'high', 'medium', 'low'])
  })

  it('締切も優先度も同じならタイトル順', () => {
    const sorted = [
      task('2026-08-01', 'medium', 'ぶ'),
      task('2026-08-01', 'medium', 'あ'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['あ', 'ぶ'])
  })

  it('未知の優先度・null でも落ちない', () => {
    const sorted = [
      task(null, 'unknown', 'x'),
      task(null, 'urgent', 'y'),
    ].sort(compareUnscheduledTasks)
    expect(sorted.map(t => t.title)).toEqual(['y', 'x'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/calendar/unscheduled-order.test.ts`
Expected: FAIL（`Failed to resolve import "./unscheduled-order"`）

- [ ] **Step 3: 実装を書く**

`lib/calendar/unscheduled-order.ts`:

```ts
// 未スケジュールトレイの並び順。締切が近い順 → 優先度が高い順 → タイトル順。
// priority は TEXT 列で Postgres の ORDER BY がアルファベット順になるため、
// 意味順の比較はクライアント側で行う。

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/** 締切なしを最後に送るための番兵 */
const NO_DUE_DATE = '9999-12-31'

export interface UnscheduledSortable {
  due_date: string | null
  priority: string | null
  title: string | null
}

export function compareUnscheduledTasks(a: UnscheduledSortable, b: UnscheduledSortable): number {
  const dueA = a.due_date ?? NO_DUE_DATE
  const dueB = b.due_date ?? NO_DUE_DATE
  if (dueA !== dueB) return dueA < dueB ? -1 : 1

  const rankA = PRIORITY_RANK[a.priority ?? ''] ?? 0
  const rankB = PRIORITY_RANK[b.priority ?? ''] ?? 0
  if (rankA !== rankB) return rankB - rankA

  return (a.title ?? '').localeCompare(b.title ?? '', undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/calendar/unscheduled-order.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/calendar/unscheduled-order.ts lib/calendar/unscheduled-order.test.ts
git commit -m "feat(calendar): 未スケジュールタスクの並び順を追加"
```

---

## Task 5: データ取得フックとリアルタイム

**Files:**
- Create: `hooks/use-calendar-tasks.ts`
- Modify: `hooks/use-realtime.ts`（末尾に `useCalendarRealtime` を追加）

**Interfaces:**
- Consumes: `lib/calendar/schedule.ts` の `TaskSchedule` / `isValidSchedule`、`lib/calendar/unscheduled-order.ts` の `compareUnscheduledTasks`
- Produces:
  - `interface CalendarTask { ... }`（下記実装参照。以降のコンポーネントはこの型を受け取る）
  - `useCalendarTasks(rangeStart: string, rangeEnd: string)` → `{ tasks: CalendarTask[]; isLoading: boolean; error: Error | null; refetch }`
  - `useUnscheduledTasks()` → `{ tasks: CalendarTask[]; isLoading: boolean; error: Error | null }`
  - `useScheduleTask(rangeStart: string, rangeEnd: string)` → `{ scheduleTask(task: CalendarTask, schedule: TaskSchedule): void }`
  - `calendarTasksKey(rangeStart, rangeEnd)` / `UNSCHEDULED_TASKS_KEY`
  - `useCalendarRealtime()`（`hooks/use-realtime.ts` から）

- [ ] **Step 1: `hooks/use-calendar-tasks.ts` を作成**

```ts
// hooks/use-calendar-tasks.ts
// カレンダーの取得と更新。表示範囲に「作業予定が入る」か「締切が入る」タスクを1クエリで取得する。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isValidSchedule, type TaskSchedule } from '@/lib/calendar/schedule'
import { compareUnscheduledTasks } from '@/lib/calendar/unscheduled-order'

export interface CalendarTask {
  id: string
  project_id: string
  parent_task_id: string | null
  title: string
  status: string
  priority: string
  due_date: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  assignee_user_id: string | null
  assignee_agent_id: string | null
  project: { name: string } | null
  task_tags: { tags: { id: string; name: string; color: string } | null }[]
  assignee_agent: { id: string; name: string; type: string } | null
}

const CALENDAR_TASK_SELECT = `
  id,
  project_id,
  parent_task_id,
  title,
  status,
  priority,
  due_date,
  scheduled_date,
  scheduled_start_time,
  scheduled_end_time,
  assignee_user_id,
  assignee_agent_id,
  project:project_id(name),
  task_tags(tag_id, tags(id, name, color)),
  assignee_agent:assignee_agent_id(id, name, type)
`

export const UNSCHEDULED_TASKS_KEY = ['unscheduled-tasks'] as const

export function calendarTasksKey(rangeStart: string, rangeEnd: string) {
  return ['calendar-tasks', rangeStart, rangeEnd] as const
}

/** 表示範囲に作業予定または締切が入る親タスク */
export function useCalendarTasks(rangeStart: string, rangeEnd: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: tasks = [], isLoading, error, refetch } = useQuery({
    queryKey: calendarTasksKey(rangeStart, rangeEnd),
    queryFn: async (): Promise<CalendarTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(CALENDAR_TASK_SELECT)
        .is('parent_task_id', null)
        .or(
          `and(scheduled_date.gte.${rangeStart},scheduled_date.lte.${rangeEnd}),` +
          `and(due_date.gte.${rangeStart},due_date.lte.${rangeEnd})`
        )

      if (error) throw error
      return (data ?? []) as CalendarTask[]
    },
    enabled: Boolean(rangeStart && rangeEnd),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return { tasks: tasks as CalendarTask[], isLoading, error: error as Error | null, refetch }
}

/** まだ予定に入っていない未完了の親タスク */
export function useUnscheduledTasks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: UNSCHEDULED_TASKS_KEY,
    queryFn: async (): Promise<CalendarTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(CALENDAR_TASK_SELECT)
        .is('parent_task_id', null)
        .is('scheduled_date', null)
        .neq('status', 'done')
        .limit(100)

      if (error) throw error
      return [...((data ?? []) as CalendarTask[])].sort(compareUnscheduledTasks)
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return { tasks: tasks as CalendarTask[], isLoading, error: error as Error | null }
}

/**
 * 予定の設定・移動・解除。カレンダーとトレイの両方のキャッシュを楽観的に書き換える。
 * 予定が付けばトレイから消え、外せばトレイに戻る。
 */
export function useScheduleTask(rangeStart: string, rangeEnd: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const queryClient = useQueryClient()
  const calendarKey = calendarTasksKey(rangeStart, rangeEnd)

  const mutation = useMutation({
    mutationFn: async ({ task, schedule }: { task: CalendarTask; schedule: TaskSchedule }) => {
      if (!isValidSchedule(schedule)) throw new Error('invalid schedule')
      const { error } = await supabase.from('tasks').update(schedule).eq('id', task.id)
      if (error) throw error
    },
    onMutate: async ({ task, schedule }: { task: CalendarTask; schedule: TaskSchedule }) => {
      await queryClient.cancelQueries({ queryKey: calendarKey })
      await queryClient.cancelQueries({ queryKey: UNSCHEDULED_TASKS_KEY })

      const previousCalendar = queryClient.getQueryData(calendarKey)
      const previousUnscheduled = queryClient.getQueryData(UNSCHEDULED_TASKS_KEY)
      const next = { ...task, ...schedule }

      queryClient.setQueryData(calendarKey, (current: unknown) => {
        if (!Array.isArray(current)) return current
        const without = current.filter((item: CalendarTask) => item.id !== task.id)
        // 予定が範囲内にある、または締切が範囲内にあるならカレンダーに残す
        const inRange =
          (next.scheduled_date !== null && next.scheduled_date >= rangeStart && next.scheduled_date <= rangeEnd) ||
          (next.due_date !== null && next.due_date >= rangeStart && next.due_date <= rangeEnd)
        return inRange ? [...without, next] : without
      })

      queryClient.setQueryData(UNSCHEDULED_TASKS_KEY, (current: unknown) => {
        if (!Array.isArray(current)) return current
        const without = current.filter((item: CalendarTask) => item.id !== task.id)
        if (next.scheduled_date !== null || next.status === 'done') return without
        return [...without, next].sort(compareUnscheduledTasks)
      })

      return { previousCalendar, previousUnscheduled }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCalendar !== undefined) {
        queryClient.setQueryData(calendarKey, context.previousCalendar)
      }
      if (context?.previousUnscheduled !== undefined) {
        queryClient.setQueryData(UNSCHEDULED_TASKS_KEY, context.previousUnscheduled)
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
      queryClient.invalidateQueries({ queryKey: UNSCHEDULED_TASKS_KEY })
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.task.project_id] })
    },
  })

  return {
    scheduleTask: (task: CalendarTask, schedule: TaskSchedule) =>
      mutation.mutate({ task, schedule }),
    isPending: mutation.isPending,
  }
}
```

- [ ] **Step 2: `hooks/use-realtime.ts` に `useCalendarRealtime` を追加**

`useAgentRunsRealtime` の定義の**前**（`useTodayRealtime` の直後）に次を挿入する:

```ts
export function useCalendarRealtime() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('calendar-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        // カレンダー行は project/tags/agent の join を含み payload には無いため、patch せず refetch する
        queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
        queryClient.invalidateQueries({ queryKey: ['unscheduled-tasks'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
```

- [ ] **Step 3: 型とビルドを確認**

Run: `npm run lint && npm run build`
Expected: エラーなし。`hooks/use-calendar-tasks.ts` はまだどこからも使われていないが、型チェックは通ること。

- [ ] **Step 4: コミット**

```bash
git add hooks/use-calendar-tasks.ts hooks/use-realtime.ts
git commit -m "feat(calendar): カレンダーのデータ取得フックとリアルタイム購読を追加"
```

---

## Task 6: `/calendar` ルート・ヘッダー・サイドバーリンク（空のグリッド）

このタスクの完了時点で「`/calendar` を開くと週のグリッドが表示され、前後移動・Today・週/月トグル・プロジェクトフィルタが操作できる」状態になる。タスクの描画は Task 7。

**Files:**
- Create: `app/(dashboard)/calendar/page.tsx`
- Create: `components/calendar/calendar-header.tsx`
- Create: `components/calendar/week-view.tsx`
- Modify: `components/layout/sidebar.tsx`（import 行と Today リンクの直後）

**Interfaces:**
- Consumes: `hooks/use-calendar-tasks.ts` の `useCalendarTasks` / `CalendarTask`、`hooks/use-realtime.ts` の `useCalendarRealtime`、`hooks/use-projects.ts` の `useProjects`、`lib/calendar/schedule.ts` の `HOUR_HEIGHT_PX` / `minutesToTime`
- Produces:
  - `CalendarHeader` props: `{ mode, onModeChange, rangeLabel, onPrev, onNext, onToday, projects, selectedProjectIds, onToggleProject, onClearProjectFilter }`
  - `WeekView` props: `{ days: Date[]; tasks: CalendarTask[]; onTaskClick: (taskId: string) => void }`
  - `type CalendarMode = 'week' | 'month'`（`components/calendar/calendar-header.tsx` から export）

- [ ] **Step 1: `components/calendar/calendar-header.tsx` を作成**

```tsx
'use client'

// カレンダーのヘッダー。期間移動・週/月トグル・プロジェクトフィルタ。
import { CalendarRange, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type CalendarMode = 'week' | 'month'

interface CalendarProject {
  id: string
  name: string
}

interface CalendarHeaderProps {
  mode: CalendarMode
  onModeChange: (mode: CalendarMode) => void
  rangeLabel: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  projects: CalendarProject[]
  selectedProjectIds: string[]
  onToggleProject: (projectId: string) => void
  onClearProjectFilter: () => void
}

export default function CalendarHeader({
  mode, onModeChange, rangeLabel, onPrev, onNext, onToday,
  projects, selectedProjectIds, onToggleProject, onClearProjectFilter,
}: CalendarHeaderProps) {
  const filterActive = selectedProjectIds.length > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CalendarRange size={19} className="text-primary" />
          Calendar
        </h1>
        <span className="text-sm text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-border">
          <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label="前の期間">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={onToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="次の期間">
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="flex items-center rounded-md border border-border p-0.5">
          {(['week', 'month'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                mode === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {value === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Filter size={14} />
            <span className="hidden sm:inline">Projects</span>
            {filterActive && (
              <Badge variant="outline" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {selectedProjectIds.length}
              </Badge>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-auto">
            <DropdownMenuLabel>表示するプロジェクト</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClearProjectFilter}>
              {filterActive ? 'すべて表示' : 'すべて表示（現在）'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.map(project => (
              <DropdownMenuItem
                key={project.id}
                // 複数選択できるよう、トグルしてもメニューを閉じない
                closeOnClick={false}
                onClick={() => onToggleProject(project.id)}
                className={cn(selectedProjectIds.includes(project.id) && 'font-semibold')}
              >
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `components/calendar/week-view.tsx` を作成（グリッドのみ）**

```tsx
'use client'

// 週ビュー: 上部に終日行、下に 7日 × 24時間のグリッド。
// タスクの描画は Task 7、ドロップ受け口は Task 9 で追加する。
import { useEffect, useRef } from 'react'
import { format, isToday } from 'date-fns'
import { HOUR_HEIGHT_PX } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 初期表示でスクロールして見せる時刻 */
const INITIAL_SCROLL_HOUR = 6

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface WeekViewProps {
  days: Date[]
  tasks: CalendarTask[]
  onTaskClick: (taskId: string) => void
}

export default function WeekView({ days }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT_PX
    }
  }, [])

  return (
    <div className="flex h-full min-w-[720px] flex-col">
      {/* 曜日ヘッダー + 終日行 */}
      <div className="flex border-b border-border bg-background/70 backdrop-blur">
        <div className="w-14 shrink-0 border-r border-border" />
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          return (
            <div key={dateKey} className="flex-1 border-r border-border last:border-r-0">
              <div className="px-2 py-2 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {format(day, 'EEE')}
                </div>
                <div className={cn(
                  'mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-semibold',
                  isToday(day) && 'bg-primary text-primary-foreground'
                )}>
                  {format(day, 'd')}
                </div>
              </div>
              <div
                data-all-day-cell={dateKey}
                className="min-h-9 space-y-1 border-t border-border px-1 py-1"
              />
            </div>
          )
        })}
      </div>

      {/* 時間グリッド */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex">
          <div className="w-14 shrink-0 border-r border-border">
            {HOURS.map(hour => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT_PX }}
                className="relative border-b border-border/50"
              >
                <span className="absolute -top-2 right-1 text-[10px] tabular-nums text-muted-foreground">
                  {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                </span>
              </div>
            ))}
          </div>

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            return (
              <div
                key={dateKey}
                data-day-column={dateKey}
                className="relative flex-1 border-r border-border last:border-r-0"
              >
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT_PX }}
                    className="border-b border-border/50"
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `app/(dashboard)/calendar/page.tsx` を作成**

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfWeek, format,
  startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import CalendarHeader, { type CalendarMode } from '@/components/calendar/calendar-header'
import WeekView from '@/components/calendar/week-view'
import TaskDetailPanel from '@/components/tasks/task-detail-panel'
import { useCalendarTasks, type CalendarTask } from '@/hooks/use-calendar-tasks'
import { useProjects } from '@/hooks/use-projects'
import { useCalendarRealtime } from '@/hooks/use-realtime'

/** 週の開始は日曜（既存の DatePicker と揃える） */
const WEEK_OPTIONS = { weekStartsOn: 0 } as const

export default function CalendarPage() {
  const [mode, setMode] = useState<CalendarMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const { projects } = useProjects()
  useCalendarRealtime()

  const { rangeStart, rangeEnd, days, rangeLabel } = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(anchorDate, WEEK_OPTIONS)
      const end = endOfWeek(anchorDate, WEEK_OPTIONS)
      return {
        rangeStart: format(start, 'yyyy-MM-dd'),
        rangeEnd: format(end, 'yyyy-MM-dd'),
        days: Array.from({ length: 7 }, (_, index) => addDays(start, index)),
        rangeLabel: `${format(start, 'yyyy.MM.dd')} – ${format(end, 'MM.dd')}`,
      }
    }

    const start = startOfWeek(startOfMonth(anchorDate), WEEK_OPTIONS)
    const end = endOfWeek(endOfMonth(anchorDate), WEEK_OPTIONS)
    // endOfWeek は 23:59:59.999 を返すため ms 差の割り算では1日多く数えてしまう。
    // 暦日の差で数える
    const dayCount = differenceInCalendarDays(end, start) + 1
    return {
      rangeStart: format(start, 'yyyy-MM-dd'),
      rangeEnd: format(end, 'yyyy-MM-dd'),
      days: Array.from({ length: dayCount }, (_, index) => addDays(start, index)),
      rangeLabel: format(anchorDate, 'yyyy.MM'),
    }
  }, [mode, anchorDate])

  const { tasks } = useCalendarTasks(rangeStart, rangeEnd)

  const visibleTasks = useMemo(() => {
    if (selectedProjectIds.length === 0) return tasks
    return tasks.filter(task => selectedProjectIds.includes(task.project_id))
  }, [tasks, selectedProjectIds])

  const step = (direction: 1 | -1) => {
    setAnchorDate(current => mode === 'week'
      ? addDays(current, 7 * direction)
      : direction === 1 ? addMonths(current, 1) : subMonths(current, 1))
  }

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds(current => current.includes(projectId)
      ? current.filter(id => id !== projectId)
      : [...current, projectId])
  }

  const selectedTask = visibleTasks.find((task: CalendarTask) => task.id === selectedTaskId)

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <CalendarHeader
          mode={mode}
          onModeChange={setMode}
          rangeLabel={rangeLabel}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setAnchorDate(new Date())}
          projects={(projects as { id: string; name: string }[]) ?? []}
          selectedProjectIds={selectedProjectIds}
          onToggleProject={toggleProject}
          onClearProjectFilter={() => setSelectedProjectIds([])}
        />

        <div className="flex-1 overflow-x-auto">
          <WeekView days={days} tasks={visibleTasks} onTaskClick={setSelectedTaskId} />
        </div>
      </div>

      {selectedTaskId && selectedTask && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectId={selectedTask.project_id}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: サイドバーにリンクを追加**

`components/layout/sidebar.tsx` の lucide-react import（7〜10行目）に `CalendarRange` を追加する:

```tsx
import {
  Bot, CalendarCheck, CalendarRange, CheckSquare, ChevronDown, ChevronRight, FolderKanban,
  FolderPlus, Inbox, MoreHorizontal, Plus, Settings,
} from 'lucide-react'
```

Today のリンク（`<Link href="/today" ...>` のブロック）の直後に次を挿入する:

```tsx
          <Link href="/calendar" className={navItemClassName(pathname === '/calendar')} onClick={onNavigate}>
            <CalendarRange size={16} />
            <span>Calendar</span>
          </Link>
```

- [ ] **Step 5: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし。`/calendar` がルート一覧に現れる。

- [ ] **Step 6: ブラウザで確認**

ユーザーにログイン済みのブラウザで `/calendar` を開いてもらい、次を確認する:
- サイドバーに Calendar が出て、クリックで遷移する
- 週のグリッド（日〜土 × 24時間）が表示され、初期スクロール位置が 6:00 付近
- ← → Today で週が移動し、ヘッダーの期間ラベルが変わる
- Week / Month トグルが切り替わる（Month はまだ週グリッドのまま = Task 11 で実装）
- Projects フィルタのメニューが開く

- [ ] **Step 7: コミット**

```bash
git add app/\(dashboard\)/calendar/page.tsx components/calendar/calendar-header.tsx components/calendar/week-view.tsx components/layout/sidebar.tsx
git commit -m "feat(calendar): /calendar ルートと週グリッドの骨格を追加"
```

---

## Task 7: 週ビューにタスクを描画（予定ブロックと締切チップ）

**Files:**
- Create: `components/calendar/task-block.tsx`
- Create: `components/calendar/due-chip.tsx`
- Modify: `components/calendar/week-view.tsx`

**Interfaces:**
- Consumes: `lib/calendar/schedule.ts` の `HOUR_HEIGHT_PX` / `minutesToPx` / `timeToMinutes`、`lib/calendar/layout.ts` の `layoutBlocks` / `toCalendarBlock` / `PositionedBlock`、`hooks/use-calendar-tasks.ts` の `CalendarTask`
- Produces:
  - `TaskBlock` props: `{ task: CalendarTask; position: PositionedBlock; onClick: () => void }`
  - `DueChip` props: `{ task: CalendarTask; onClick: () => void }`
  - `WeekView` が `tasks` を実際に描画するようになる

- [ ] **Step 1: `components/calendar/due-chip.tsx` を作成**

```tsx
'use client'

// 締切マーカー。作業予定ブロックとは別スタイル（旗アイコン付きの細いチップ）で終日行に出す。
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

interface DueChipProps {
  task: CalendarTask
  onClick: () => void
}

export default function DueChip({ task, onClick }: DueChipProps) {
  const done = task.status === 'done'

  return (
    <button
      type="button"
      onClick={onClick}
      title={`締切: ${task.title}`}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-left text-[11px] text-rose-500 hover:bg-rose-500/20',
        done && 'opacity-50 line-through'
      )}
    >
      <Flag size={10} className="shrink-0" />
      <span className="truncate">{task.title}</span>
    </button>
  )
}
```

- [ ] **Step 2: `components/calendar/task-block.tsx` を作成**

```tsx
'use client'

// 時間グリッド上の予定ブロック。ドラッグとリサイズは後続タスクで追加する。
import { cn } from '@/lib/utils'
import { minutesToPx } from '@/lib/calendar/schedule'
import type { PositionedBlock } from '@/lib/calendar/layout'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

const PRIORITY_ACCENT: Record<string, string> = {
  low: 'border-l-blue-400',
  medium: 'border-l-yellow-400',
  high: 'border-l-orange-400',
  urgent: 'border-l-red-400',
}

interface TaskBlockProps {
  task: CalendarTask
  position: PositionedBlock
  onClick: () => void
}

export default function TaskBlock({ task, position, onClick }: TaskBlockProps) {
  const done = task.status === 'done'
  const top = minutesToPx(position.startMinutes)
  const height = Math.max(18, minutesToPx(position.endMinutes - position.startMinutes) - 2)
  const widthPercent = 100 / position.columnCount
  const startLabel = task.scheduled_start_time
    ? task.scheduled_start_time.slice(0, 5)
    : ''

  return (
    <div
      style={{
        top,
        height,
        left: `${position.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
      className="absolute px-px"
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded border border-l-2 border-border bg-card px-1.5 py-0.5 text-left shadow-sm transition-colors hover:bg-accent',
          PRIORITY_ACCENT[task.priority] ?? 'border-l-border',
          done && 'opacity-50'
        )}
      >
        <span className={cn('truncate text-[11px] font-medium leading-tight', done && 'line-through')}>
          {task.title}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {startLabel}
          {task.project?.name ? ` · ${task.project.name}` : ''}
        </span>
      </button>
    </div>
  )
}
```

- [ ] **Step 3: `week-view.tsx` にタスクの振り分けと描画を追加**

`components/calendar/week-view.tsx` を次の内容に置き換える:

```tsx
'use client'

// 週ビュー: 上部に終日行（終日予定 + 締切チップ）、下に 7日 × 24時間のグリッド。
import { useEffect, useMemo, useRef } from 'react'
import { format, isToday } from 'date-fns'
import DueChip from '@/components/calendar/due-chip'
import TaskBlock from '@/components/calendar/task-block'
import { layoutBlocks, toCalendarBlock } from '@/lib/calendar/layout'
import { HOUR_HEIGHT_PX } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 初期表示でスクロールして見せる時刻 */
const INITIAL_SCROLL_HOUR = 6

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface DayBuckets {
  allDay: CalendarTask[]
  due: CalendarTask[]
  timed: CalendarTask[]
}

/** 日付ごとに「終日予定 / 締切 / 時間ブロック」へ振り分ける */
export function bucketTasksByDay(days: Date[], tasks: CalendarTask[]) {
  const buckets = new Map<string, DayBuckets>()
  for (const day of days) {
    buckets.set(format(day, 'yyyy-MM-dd'), { allDay: [], due: [], timed: [] })
  }

  for (const task of tasks) {
    if (task.scheduled_date) {
      const bucket = buckets.get(task.scheduled_date)
      if (bucket) {
        if (task.scheduled_start_time && task.scheduled_end_time) bucket.timed.push(task)
        else bucket.allDay.push(task)
      }
    }
    if (task.due_date) {
      const bucket = buckets.get(task.due_date)
      if (bucket) bucket.due.push(task)
    }
  }

  return buckets
}

interface WeekViewProps {
  days: Date[]
  tasks: CalendarTask[]
  onTaskClick: (taskId: string) => void
}

export default function WeekView({ days, tasks, onTaskClick }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const buckets = useMemo(() => bucketTasksByDay(days, tasks), [days, tasks])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT_PX
    }
  }, [])

  return (
    <div className="flex h-full min-w-[720px] flex-col">
      {/* 曜日ヘッダー + 終日行 */}
      <div className="flex border-b border-border bg-background/70 backdrop-blur">
        <div className="w-14 shrink-0 border-r border-border" />
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const bucket = buckets.get(dateKey)
          return (
            <div key={dateKey} className="flex-1 border-r border-border last:border-r-0">
              <div className="px-2 py-2 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {format(day, 'EEE')}
                </div>
                <div className={cn(
                  'mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-semibold',
                  isToday(day) && 'bg-primary text-primary-foreground'
                )}>
                  {format(day, 'd')}
                </div>
              </div>
              <div
                data-all-day-cell={dateKey}
                className="min-h-9 space-y-1 border-t border-border px-1 py-1"
              >
                {bucket?.allDay.map(task => (
                  <button
                    key={`allday-${task.id}`}
                    type="button"
                    onClick={() => onTaskClick(task.id)}
                    className={cn(
                      'w-full truncate rounded border border-border bg-card px-1.5 py-0.5 text-left text-[11px] hover:bg-accent',
                      task.status === 'done' && 'opacity-50 line-through'
                    )}
                  >
                    {task.title}
                  </button>
                ))}
                {bucket?.due.map(task => (
                  <DueChip key={`due-${task.id}`} task={task} onClick={() => onTaskClick(task.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* 時間グリッド */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex">
          <div className="w-14 shrink-0 border-r border-border">
            {HOURS.map(hour => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT_PX }}
                className="relative border-b border-border/50"
              >
                <span className="absolute -top-2 right-1 text-[10px] tabular-nums text-muted-foreground">
                  {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                </span>
              </div>
            ))}
          </div>

          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const timed = buckets.get(dateKey)?.timed ?? []
            const positions = layoutBlocks(timed.map(task =>
              toCalendarBlock(task.id, task.scheduled_start_time!, task.scheduled_end_time!)
            ))
            const taskById = new Map(timed.map(task => [task.id, task]))

            return (
              <div
                key={dateKey}
                data-day-column={dateKey}
                className="relative flex-1 border-r border-border last:border-r-0"
              >
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT_PX }}
                    className="border-b border-border/50"
                  />
                ))}
                {positions.map(position => {
                  const task = taskById.get(position.id)
                  if (!task) return null
                  return (
                    <TaskBlock
                      key={task.id}
                      task={task}
                      position={position}
                      onClick={() => onTaskClick(task.id)}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 5: ブラウザで確認**

ユーザーに、既存タスクのどれかに `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` を Supabase の SQL エディタで直接入れてもらい（例: 今週の任意の日に `10:00`–`11:30`）、`/calendar` に表示されることを確認する。あわせて:
- 締切が今週にあるタスクが終日行に赤い旗チップで出る
- 重なる2件が横に割れる
- 完了タスクが取り消し線＋減光で残る
- ブロックをクリックすると詳細パネルが開く

- [ ] **Step 6: コミット**

```bash
git add components/calendar/task-block.tsx components/calendar/due-chip.tsx components/calendar/week-view.tsx
git commit -m "feat(calendar): 週ビューに予定ブロックと締切チップを描画"
```

---

## Task 8: 未スケジュールトレイ

**Files:**
- Create: `components/calendar/unscheduled-tray.tsx`
- Modify: `app/(dashboard)/calendar/page.tsx`

**Interfaces:**
- Consumes: `hooks/use-calendar-tasks.ts` の `useUnscheduledTasks` / `CalendarTask`
- Produces: `UnscheduledTray` props: `{ tasks: CalendarTask[]; isLoading: boolean; onTaskClick: (taskId: string) => void }`

- [ ] **Step 1: `components/calendar/unscheduled-tray.tsx` を作成**

```tsx
'use client'

// まだ予定に入っていないタスクの置き場。ここからカレンダーへドラッグして割り当てる。
import { Inbox } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

const PRIORITY_ACCENT: Record<string, string> = {
  low: 'border-l-blue-400',
  medium: 'border-l-yellow-400',
  high: 'border-l-orange-400',
  urgent: 'border-l-red-400',
}

interface UnscheduledTrayProps {
  tasks: CalendarTask[]
  isLoading: boolean
  onTaskClick: (taskId: string) => void
}

export function UnscheduledTaskCard({
  task, onClick,
}: { task: CalendarTask; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border border-l-2 border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent',
        PRIORITY_ACCENT[task.priority] ?? 'border-l-border'
      )}
    >
      <div className="truncate text-xs font-medium">{task.title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{task.project?.name ?? ''}</span>
        {task.due_date && (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            due {task.due_date.slice(5)}
          </Badge>
        )}
      </div>
    </button>
  )
}

export default function UnscheduledTray({ tasks, isLoading, onTaskClick }: UnscheduledTrayProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Inbox size={15} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Unscheduled</span>
        <Badge variant="outline" className="ml-auto px-1.5 py-0 text-[10px]">
          {tasks.length}
        </Badge>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {isLoading && (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}
        {!isLoading && tasks.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            すべてのタスクが予定に入っています。
          </p>
        )}
        {tasks.map(task => (
          <UnscheduledTaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task.id)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ページにトレイを組み込む**

`app/(dashboard)/calendar/page.tsx` を次のように変更する。

import に追加:

```tsx
import UnscheduledTray from '@/components/calendar/unscheduled-tray'
import { useCalendarTasks, useUnscheduledTasks, type CalendarTask } from '@/hooks/use-calendar-tasks'
```

`const { tasks } = useCalendarTasks(rangeStart, rangeEnd)` の直後に追加:

```tsx
  const { tasks: unscheduledTasks, isLoading: unscheduledLoading } = useUnscheduledTasks()

  const visibleUnscheduled = useMemo(() => {
    if (selectedProjectIds.length === 0) return unscheduledTasks
    return unscheduledTasks.filter(task => selectedProjectIds.includes(task.project_id))
  }, [unscheduledTasks, selectedProjectIds])
```

`selectedTask` の算出を、トレイのタスクも詳細パネルで開けるように変更する:

```tsx
  const selectedTask =
    visibleTasks.find((task: CalendarTask) => task.id === selectedTaskId) ??
    visibleUnscheduled.find((task: CalendarTask) => task.id === selectedTaskId)
```

`<div className="flex-1 overflow-x-auto">` を包む部分を、左トレイ付きのレイアウトに置き換える:

```tsx
        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
            <UnscheduledTray
              tasks={visibleUnscheduled}
              isLoading={unscheduledLoading}
              onTaskClick={setSelectedTaskId}
            />
          </aside>
          <div className="flex-1 overflow-x-auto">
            <WeekView days={days} tasks={visibleTasks} onTaskClick={setSelectedTaskId} />
          </div>
        </div>
```

- [ ] **Step 3: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 4: ブラウザで確認**

- `/calendar` の左に Unscheduled パネルが出て、`scheduled_date` が NULL の未完了タスクが締切→優先度の順で並ぶ
- 件数バッジが一致する
- カードをクリックすると詳細パネルが開く
- Projects フィルタがトレイにも効く
- 画面幅を狭める（`lg` 未満）とトレイが隠れる（モバイル対応は Task 11）

- [ ] **Step 5: コミット**

```bash
git add components/calendar/unscheduled-tray.tsx app/\(dashboard\)/calendar/page.tsx
git commit -m "feat(calendar): 未スケジュールタスクのトレイを追加"
```

---

## Task 9: ドラッグ＆ドロップで予定を割り当てる

**Files:**
- Modify: `components/dnd/task-dnd-provider.tsx`
- Modify: `components/calendar/week-view.tsx`
- Modify: `components/calendar/task-block.tsx`
- Modify: `components/calendar/unscheduled-tray.tsx`
- Modify: `app/(dashboard)/calendar/page.tsx`

**Interfaces:**
- Consumes: `lib/calendar/layout.ts` の `dayColumnDroppableId` / `allDayDroppableId` / `parseCalendarDroppableId`、`lib/calendar/schedule.ts` の `buildAllDaySchedule` / `buildTimedSchedule` / `getDurationMinutes` / `pxToMinutes` / `DEFAULT_BLOCK_MINUTES`、`hooks/use-calendar-tasks.ts` の `useScheduleTask`
- Produces: `WeekView` が新たに `onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void` を props に取る

- [ ] **Step 1: `TaskDndProvider` にカレンダー用の衝突判定とキャッシュ無効化を追加**

`components/dnd/task-dnd-provider.tsx` の `collisionDetection` 内、`sidebarCollision` の直後（`taskCollision` の直前）に挿入する:

```tsx
    // カレンダーのドロップ先はボード/リストの行より優先する
    const calendarCollision = collisions.find(collision => {
      const type = collision.data?.droppableContainer.data.current?.type
      return type === 'calendar-day' || type === 'calendar-all-day'
    })
    if (calendarCollision) return [calendarCollision]
```

`invalidateTaskViews` の中に2行追加する:

```tsx
    queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['unscheduled-tasks'] })
```

`TaskDragData` の `source` にカレンダー由来を足す:

```tsx
export interface TaskDragData {
  type: 'task'
  source: 'board' | 'list' | 'calendar' | 'tray'
  listId?: string
  /** 時間ブロックを移動するとき、元の長さ（分）を保つために持ち回る */
  durationMinutes?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any
}
```

- [ ] **Step 2: トレイのカードをドラッグ可能にする**

`components/calendar/unscheduled-tray.tsx` の `UnscheduledTaskCard` を差し替える:

```tsx
import { useDraggable } from '@dnd-kit/core'
```

```tsx
export function UnscheduledTaskCard({
  task, onClick,
}: { task: CalendarTask; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${task.id}`,
    data: { type: 'task', source: 'tray', task },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={cn(
        'w-full rounded-md border border-l-2 border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent',
        PRIORITY_ACCENT[task.priority] ?? 'border-l-border',
        isDragging && 'opacity-40'
      )}
    >
      <div className="truncate text-xs font-medium">{task.title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{task.project?.name ?? ''}</span>
        {task.due_date && (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            due {task.due_date.slice(5)}
          </Badge>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 3: 予定ブロックをドラッグ可能にする**

`components/calendar/task-block.tsx` に `useDraggable` を追加する。import に足す:

```tsx
import { useDraggable } from '@dnd-kit/core'
import { getDurationMinutes } from '@/lib/calendar/schedule'
```

`TaskBlock` の中身を変更する（`<button>` に `ref` / `listeners` / `attributes` を渡す）:

```tsx
export default function TaskBlock({ task, position, onClick }: TaskBlockProps) {
  const durationMinutes = getDurationMinutes(task) ?? undefined
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `calendar-block-${task.id}`,
    data: { type: 'task', source: 'calendar', durationMinutes, task },
  })

  const done = task.status === 'done'
  const top = minutesToPx(position.startMinutes)
  const height = Math.max(18, minutesToPx(position.endMinutes - position.startMinutes) - 2)
  const widthPercent = 100 / position.columnCount
  const startLabel = task.scheduled_start_time ? task.scheduled_start_time.slice(0, 5) : ''

  return (
    <div
      style={{
        top,
        height,
        left: `${position.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
      className="absolute px-px"
    >
      <button
        ref={setNodeRef}
        type="button"
        onClick={onClick}
        {...listeners}
        {...attributes}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded border border-l-2 border-border bg-card px-1.5 py-0.5 text-left shadow-sm transition-colors hover:bg-accent',
          PRIORITY_ACCENT[task.priority] ?? 'border-l-border',
          done && 'opacity-50',
          isDragging && 'opacity-40'
        )}
      >
        <span className={cn('truncate text-[11px] font-medium leading-tight', done && 'line-through')}>
          {task.title}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {startLabel}
          {task.project?.name ? ` · ${task.project.name}` : ''}
        </span>
      </button>
    </div>
  )
}
```

> `getDurationMinutes(task)` は `task` が `TaskSchedule` の3プロパティを持つため型的に通る（`CalendarTask` は `TaskSchedule` を包含する）。

- [ ] **Step 4: 週ビューをドロップ先にする**

`components/calendar/week-view.tsx` に次を追加する。

import に足す:

```tsx
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { allDayDroppableId, dayColumnDroppableId, layoutBlocks, toCalendarBlock } from '@/lib/calendar/layout'
import {
  buildAllDaySchedule, buildTimedSchedule, DEFAULT_BLOCK_MINUTES, HOUR_HEIGHT_PX, pxToMinutes,
  type TaskSchedule,
} from '@/lib/calendar/schedule'
```

ファイル末尾近く、`WeekView` の前に小さなドロップ先コンポーネントを2つ定義する:

```tsx
function AllDayDropZone({ date, children }: { date: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: allDayDroppableId(date),
    data: { type: 'calendar-all-day', date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-9 space-y-1 border-t border-border px-1 py-1 transition-colors',
        isOver && 'bg-primary/10'
      )}
    >
      {children}
    </div>
  )
}

function DayColumnDropZone({ date, children }: { date: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayColumnDroppableId(date),
    data: { type: 'calendar-day', date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex-1 border-r border-border last:border-r-0 transition-colors',
        isOver && 'bg-primary/5'
      )}
    >
      {children}
    </div>
  )
}
```

`WeekViewProps` に `onSchedule` を足し、`WeekView` の先頭で `useDndMonitor` を呼ぶ:

```tsx
interface WeekViewProps {
  days: Date[]
  tasks: CalendarTask[]
  onTaskClick: (taskId: string) => void
  onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void
}

export default function WeekView({ days, tasks, onTaskClick, onSchedule }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const buckets = useMemo(() => bucketTasksByDay(days, tasks), [days, tasks])

  useDndMonitor({
    onDragEnd: event => {
      const dragged = event.active.data.current as
        | { type?: string; source?: string; durationMinutes?: number; task?: CalendarTask }
        | undefined
      const dropped = event.over?.data.current as { type?: string; date?: string } | undefined
      if (!dragged?.task || dragged.type !== 'task' || !dropped?.date) return

      if (dropped.type === 'calendar-all-day') {
        onSchedule(dragged.task, buildAllDaySchedule(dropped.date))
        return
      }

      if (dropped.type !== 'calendar-day' || !event.over) return

      // ドラッグ中の要素の上端が、日カラムの上端から何px下にあるかで開始時刻を決める
      const draggedTop = event.active.rect.current.translated?.top ?? 0
      const columnTop = event.over.rect.top
      const minutes = pxToMinutes(draggedTop - columnTop)
      const duration = dragged.durationMinutes ?? DEFAULT_BLOCK_MINUTES
      onSchedule(dragged.task, buildTimedSchedule(dropped.date, minutes, duration))
    },
  })

  // ...以下は既存のまま
```

終日行の `<div data-all-day-cell={dateKey} className="min-h-9 ...">` を `<AllDayDropZone date={dateKey}>` に、時間グリッドの `<div data-day-column={dateKey} className="relative flex-1 ...">` を `<DayColumnDropZone date={dateKey}>` に置き換える（中身はそのまま）。

- [ ] **Step 5: ページから `onSchedule` を渡す**

`app/(dashboard)/calendar/page.tsx` の import に追加:

```tsx
import { useCalendarTasks, useScheduleTask, useUnscheduledTasks, type CalendarTask } from '@/hooks/use-calendar-tasks'
```

`useUnscheduledTasks()` の直後に追加:

```tsx
  const { scheduleTask } = useScheduleTask(rangeStart, rangeEnd)
```

`WeekView` の呼び出しに props を足す:

```tsx
            <WeekView
              days={days}
              tasks={visibleTasks}
              onTaskClick={setSelectedTaskId}
              onSchedule={scheduleTask}
            />
```

- [ ] **Step 6: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 7: ブラウザで確認**

- トレイのタスクを時間グリッドの 10:00 付近にドラッグ → 10:00–11:00 のブロックになり、トレイから消える
- トレイのタスクを終日行にドラッグ → 終日チップになる
- ブロックを別の日・別の時刻にドラッグ → 長さを保ったまま移動する
- ドロップ先が青くハイライトされる
- ブロックをサイドバーのプロジェクトにドラッグ → 従来通りプロジェクト移動になる（カレンダー分岐がサイドバーを奪っていない）
- リロードしても位置が保たれる（＝DBに書けている）

- [ ] **Step 8: コミット**

```bash
git add components/dnd/task-dnd-provider.tsx components/calendar/week-view.tsx components/calendar/task-block.tsx components/calendar/unscheduled-tray.tsx app/\(dashboard\)/calendar/page.tsx
git commit -m "feat(calendar): ドラッグ&ドロップでタスクを日時に割り当て"
```

---

## Task 10: ブロックのリサイズと予定解除メニュー

**Files:**
- Modify: `components/calendar/task-block.tsx`

**Interfaces:**
- Consumes: `lib/calendar/schedule.ts` の `buildTimedSchedule` / `snapDurationMinutes` / `pxToMinutes` / `timeToMinutes` / `CLEARED_SCHEDULE`
- Produces: `TaskBlock` props に `onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void` を追加

- [ ] **Step 1: `task-block.tsx` にリサイズハンドルとメニューを追加**

import に足す:

```tsx
import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildTimedSchedule, CLEARED_SCHEDULE, DEFAULT_BLOCK_MINUTES, getDurationMinutes, minutesToPx,
  pxToMinutes, snapDurationMinutes, timeToMinutes, type TaskSchedule,
} from '@/lib/calendar/schedule'
```

> Task 9 Step 3 で追加した `import { getDurationMinutes } from '@/lib/calendar/schedule'` の行と、Task 7 の `import { minutesToPx } from '@/lib/calendar/schedule'` の行は、この1つの import 文にまとめること（重複 import は lint エラーになる）。

props とリサイズ処理:

```tsx
interface TaskBlockProps {
  task: CalendarTask
  position: PositionedBlock
  onClick: () => void
  onSchedule: (task: CalendarTask, schedule: TaskSchedule) => void
}
```

`TaskBlock` の中に次の state とハンドラを追加する:

```tsx
  // リサイズ中はローカルの長さで描画し、pointerup で初めて保存する
  const [draftDuration, setDraftDuration] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const savedDuration = getDurationMinutes(task) ?? DEFAULT_BLOCK_MINUTES
  const shownDuration = draftDuration ?? savedDuration

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const originDuration = savedDuration
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = pxToMinutes(moveEvent.clientY - startY)
      setDraftDuration(snapDurationMinutes(originDuration + delta))
    }

    const handleUp = (upEvent: PointerEvent) => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      const delta = pxToMinutes(upEvent.clientY - startY)
      const nextDuration = snapDurationMinutes(originDuration + delta)
      setDraftDuration(null)
      if (nextDuration !== originDuration && task.scheduled_date && task.scheduled_start_time) {
        onSchedule(task, buildTimedSchedule(
          task.scheduled_date,
          timeToMinutes(task.scheduled_start_time),
          nextDuration,
        ))
      }
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
  }
```

高さの計算をリサイズ中の値に差し替える:

```tsx
  const height = Math.max(18, minutesToPx(shownDuration) - 2)
```

`<button>` の直後（同じ相対配置の `<div>` 内）に「⋯」メニューとリサイズハンドルを置く:

```tsx
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label="予定のメニュー"
          className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onClick}>詳細を開く</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSchedule(task, CLEARED_SCHEDULE)}>
            予定を外す
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize rounded-b bg-transparent hover:bg-primary/40"
      />
```

外側の `<div className="absolute px-px">` に `group` と右クリックでメニューを開く配線を足す:

```tsx
    <div
      style={{ ... }}
      className="group absolute px-px"
      onContextMenu={event => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
```

- [ ] **Step 2: `week-view.tsx` から `onSchedule` を `TaskBlock` に渡す**

```tsx
                    <TaskBlock
                      key={task.id}
                      task={task}
                      position={position}
                      onClick={() => onTaskClick(task.id)}
                      onSchedule={onSchedule}
                    />
```

- [ ] **Step 3: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 4: ブラウザで確認**

- ブロックの下端をドラッグすると高さが30分刻みで変わり、離すと保存される（リロードしても保たれる）
- 30分より短くできない
- ブロックにホバーすると右上に「⋯」が出る。開いて「予定を外す」でトレイに戻る
- ブロックを右クリックしても同じメニューが開く
- リサイズ操作がブロックのドラッグ移動を誤発火させない

- [ ] **Step 5: コミット**

```bash
git add components/calendar/task-block.tsx components/calendar/week-view.tsx
git commit -m "feat(calendar): 予定ブロックのリサイズと予定解除メニューを追加"
```

---

## Task 11: モバイル対応（タップで割り当て + トレイの下部シート）

**Files:**
- Create: `components/calendar/assign-task-dialog.tsx`
- Modify: `components/calendar/week-view.tsx`
- Modify: `app/(dashboard)/calendar/page.tsx`

**Interfaces:**
- Consumes: `components/ui/dialog.tsx`、`components/ui/command.tsx`、`components/ui/sheet.tsx`、`components/tasks/date-picker.tsx`、`lib/calendar/schedule.ts` の `buildAllDaySchedule` / `buildTimedSchedule` / `minutesToTime` / `SLOT_MINUTES`
- Produces: `AssignTaskDialog` props: `{ open, onOpenChange, tasks, defaultDate, defaultStartMinutes, onAssign }`

- [ ] **Step 1: `components/calendar/assign-task-dialog.tsx` を作成**

```tsx
'use client'

// 空きスロットのタップから開く割り当てダイアログ。ドラッグできない環境の代替経路。
import { useEffect, useState } from 'react'
import DatePicker from '@/components/tasks/date-picker'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { minutesToTime, SLOT_MINUTES, buildAllDaySchedule, buildTimedSchedule, type TaskSchedule } from '@/lib/calendar/schedule'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 00:00 から 23:30 までの 30分刻み */
const TIME_OPTIONS = Array.from(
  { length: (24 * 60) / SLOT_MINUTES },
  (_, index) => index * SLOT_MINUTES,
)

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240]

interface AssignTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: CalendarTask[]
  defaultDate: string
  /** null なら終日として開く */
  defaultStartMinutes: number | null
  onAssign: (task: CalendarTask, schedule: TaskSchedule) => void
}

export default function AssignTaskDialog({
  open, onOpenChange, tasks, defaultDate, defaultStartMinutes, onAssign,
}: AssignTaskDialogProps) {
  const [date, setDate] = useState(defaultDate)
  const [startMinutes, setStartMinutes] = useState<number | null>(defaultStartMinutes)
  const [durationMinutes, setDurationMinutes] = useState(60)

  useEffect(() => {
    if (!open) return
    setDate(defaultDate)
    setStartMinutes(defaultStartMinutes)
    setDurationMinutes(60)
  }, [open, defaultDate, defaultStartMinutes])

  const assign = (task: CalendarTask) => {
    const schedule = startMinutes === null
      ? buildAllDaySchedule(date)
      : buildTimedSchedule(date, startMinutes, durationMinutes)
    onAssign(task, schedule)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>タスクを予定に入れる</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>日付</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-start">開始</Label>
              <select
                id="assign-start"
                value={startMinutes === null ? 'all-day' : String(startMinutes)}
                onChange={event => setStartMinutes(
                  event.target.value === 'all-day' ? null : Number(event.target.value)
                )}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="all-day">終日</option>
                {TIME_OPTIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{minutesToTime(minutes)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-duration">長さ</Label>
              <select
                id="assign-duration"
                value={durationMinutes}
                disabled={startMinutes === null}
                onChange={event => setDurationMinutes(Number(event.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
              >
                {DURATION_OPTIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{minutes}分</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>タスク</Label>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="タスクを検索..." />
              <CommandList className="max-h-56">
                <CommandEmpty>該当するタスクがありません。</CommandEmpty>
                <CommandGroup>
                  {tasks.map(task => (
                    <CommandItem
                      key={task.id}
                      value={`${task.title} ${task.project?.name ?? ''}`}
                      onSelect={() => assign(task)}
                    >
                      <span className="truncate">{task.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {task.project?.name ?? ''}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 週ビューで空きスロットのタップを拾う**

`components/calendar/week-view.tsx` の `WeekViewProps` に追加:

```tsx
  onSlotSelect: (date: string, startMinutes: number | null) => void
```

`DayColumnDropZone` に `onSlotSelect` を渡し、カラムの背景クリックで呼ぶ。`DayColumnDropZone` を次のように変更する:

```tsx
function DayColumnDropZone({
  date, onSlotSelect, children,
}: { date: string; onSlotSelect: (date: string, startMinutes: number | null) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayColumnDroppableId(date),
    data: { type: 'calendar-day', date },
  })

  return (
    <div
      ref={setNodeRef}
      onClick={event => {
        // ブロック上のクリックは無視し、空き部分のみ拾う
        if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.slotBackground) return
        const rect = event.currentTarget.getBoundingClientRect()
        onSlotSelect(date, snapStartMinutes(pxToMinutes(event.clientY - rect.top)))
      }}
      className={cn(
        'relative flex-1 border-r border-border last:border-r-0 transition-colors',
        isOver && 'bg-primary/5'
      )}
    >
      {children}
    </div>
  )
}
```

`snapStartMinutes` を import に追加する。時間グリッドの各時間セルに `data-slot-background="1"` を付ける:

```tsx
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    data-slot-background="1"
                    style={{ height: HOUR_HEIGHT_PX }}
                    className="border-b border-border/50"
                  />
                ))}
```

`AllDayDropZone` も同様に、空き部分のクリックで `onSlotSelect(date, null)` を呼ぶようにする:

```tsx
function AllDayDropZone({
  date, onSlotSelect, children,
}: { date: string; onSlotSelect: (date: string, startMinutes: number | null) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: allDayDroppableId(date),
    data: { type: 'calendar-all-day', date },
  })

  return (
    <div
      ref={setNodeRef}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        onSlotSelect(date, null)
      }}
      className={cn(
        'min-h-9 space-y-1 border-t border-border px-1 py-1 transition-colors',
        isOver && 'bg-primary/10'
      )}
    >
      {children}
    </div>
  )
}
```

呼び出し側にも `onSlotSelect={onSlotSelect}` を渡す。

- [ ] **Step 3: ページにダイアログとモバイル用トレイシートを組み込む**

`app/(dashboard)/calendar/page.tsx` の import に追加:

```tsx
import { Inbox } from 'lucide-react'
import AssignTaskDialog from '@/components/calendar/assign-task-dialog'
import { buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
```

state を追加:

```tsx
  const [assignTarget, setAssignTarget] = useState<{ date: string; startMinutes: number | null } | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
```

`WeekView` に `onSlotSelect` を渡す:

```tsx
              onSlotSelect={(date, startMinutes) => setAssignTarget({ date, startMinutes })}
```

トレイ用の `<aside>` の後、モバイル用のフローティングボタン + シートを追加する（`</div>` で閉じる直前）:

```tsx
        <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
          <SheetTrigger
            className={cn(buttonVariants({ size: 'sm' }), 'fixed bottom-4 right-4 z-20 gap-1.5 shadow-lg lg:hidden')}
          >
            <Inbox size={14} />
            Unscheduled
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[70vh] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Unscheduled tasks</SheetTitle>
            </SheetHeader>
            <UnscheduledTray
              tasks={visibleUnscheduled}
              isLoading={unscheduledLoading}
              onTaskClick={taskId => {
                setTrayOpen(false)
                setSelectedTaskId(taskId)
              }}
            />
          </SheetContent>
        </Sheet>

        <AssignTaskDialog
          open={assignTarget !== null}
          onOpenChange={open => { if (!open) setAssignTarget(null) }}
          tasks={visibleUnscheduled}
          defaultDate={assignTarget?.date ?? rangeStart}
          defaultStartMinutes={assignTarget?.startMinutes ?? null}
          onAssign={scheduleTask}
        />
```

- [ ] **Step 4: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 5: ブラウザで確認（デスクトップ幅とモバイル幅の両方）**

- 空きスロットをクリック → ダイアログが開き、日付と開始時刻がその位置で埋まっている
- タスクを検索して選ぶと、その日時に割り当てられる
- 終日行の空き部分をクリック → 開始が「終日」で開き、選ぶと終日予定になる
- 既存ブロックをクリックしてもダイアログではなく詳細パネルが開く（誤発火しない）
- モバイル幅で右下に Unscheduled ボタンが出て、シートが開く
- モバイル幅でも週の7日が横スクロールで見られる

- [ ] **Step 6: コミット**

```bash
git add components/calendar/assign-task-dialog.tsx components/calendar/week-view.tsx app/\(dashboard\)/calendar/page.tsx
git commit -m "feat(calendar): タップ操作での割り当てとモバイル用トレイを追加"
```

---

## Task 12: 月ビュー

**Files:**
- Create: `components/calendar/month-view.tsx`
- Modify: `app/(dashboard)/calendar/page.tsx`

**Interfaces:**
- Consumes: `components/calendar/week-view.tsx` の `bucketTasksByDay`、`components/calendar/due-chip.tsx` の `DueChip`、`lib/calendar/schedule.ts` の `timeToMinutes`
- Produces: `MonthView` props: `{ days: Date[]; month: Date; tasks: CalendarTask[]; onTaskClick: (taskId: string) => void; onDaySelect: (date: Date) => void }`

- [ ] **Step 1: `components/calendar/month-view.tsx` を作成**

```tsx
'use client'

// 月ビュー（俯瞰用）。セル内は 終日予定 → 時間ブロック（開始時刻順）で並べ、
// 入りきらない分は「他 N 件」に畳む。日付をクリックすると週ビューへ移る。
import { format, isSameMonth, isToday } from 'date-fns'
import DueChip from '@/components/calendar/due-chip'
import { bucketTasksByDay } from '@/components/calendar/week-view'
import { timeToMinutes } from '@/lib/calendar/schedule'
import { cn } from '@/lib/utils'
import type { CalendarTask } from '@/hooks/use-calendar-tasks'

/** 1セルに出す予定チップの上限 */
const MAX_CHIPS_PER_DAY = 3

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface MonthViewProps {
  days: Date[]
  month: Date
  tasks: CalendarTask[]
  onTaskClick: (taskId: string) => void
  onDaySelect: (date: Date) => void
}

export default function MonthView({ days, month, tasks, onTaskClick, onDaySelect }: MonthViewProps) {
  const buckets = bucketTasksByDay(days, tasks)

  return (
    <div className="flex h-full min-w-[640px] flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map(weekday => (
          <div key={weekday} className="px-2 py-1.5 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const bucket = buckets.get(dateKey)
          // 終日予定 → 時間ブロック（開始時刻順）
          const scheduled = [
            ...(bucket?.allDay ?? []),
            ...[...(bucket?.timed ?? [])].sort((a, b) =>
              timeToMinutes(a.scheduled_start_time!) - timeToMinutes(b.scheduled_start_time!)
            ),
          ]
          const shown = scheduled.slice(0, MAX_CHIPS_PER_DAY)
          const hiddenCount = scheduled.length - shown.length

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-24 space-y-1 border-b border-r border-border p-1',
                !isSameMonth(day, month) && 'bg-muted/30'
              )}
            >
              <button
                type="button"
                onClick={() => onDaySelect(day)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold hover:bg-accent',
                  isToday(day) && 'bg-primary text-primary-foreground hover:bg-primary',
                  !isSameMonth(day, month) && 'text-muted-foreground'
                )}
              >
                {format(day, 'd')}
              </button>

              {shown.map(task => (
                <button
                  key={`s-${task.id}`}
                  type="button"
                  onClick={() => onTaskClick(task.id)}
                  className={cn(
                    'flex w-full items-center gap-1 truncate rounded border border-border bg-card px-1 py-0.5 text-left text-[10px] hover:bg-accent',
                    task.status === 'done' && 'opacity-50 line-through'
                  )}
                >
                  {task.scheduled_start_time && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {task.scheduled_start_time.slice(0, 5)}
                    </span>
                  )}
                  <span className="truncate">{task.title}</span>
                </button>
              ))}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => onDaySelect(day)}
                  className="w-full px-1 text-left text-[10px] text-muted-foreground hover:text-foreground"
                >
                  他 {hiddenCount} 件
                </button>
              )}

              {bucket?.due.map(task => (
                <DueChip key={`d-${task.id}`} task={task} onClick={() => onTaskClick(task.id)} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ページで週/月を切り替える**

`app/(dashboard)/calendar/page.tsx` の import に追加:

```tsx
import MonthView from '@/components/calendar/month-view'
```

`<WeekView ... />` の呼び出しを分岐に置き換える:

```tsx
            {mode === 'week' ? (
              <WeekView
                days={days}
                tasks={visibleTasks}
                onTaskClick={setSelectedTaskId}
                onSchedule={scheduleTask}
                onSlotSelect={(date, startMinutes) => setAssignTarget({ date, startMinutes })}
              />
            ) : (
              <MonthView
                days={days}
                month={anchorDate}
                tasks={visibleTasks}
                onTaskClick={setSelectedTaskId}
                onDaySelect={day => { setAnchorDate(day); setMode('week') }}
              />
            )}
```

- [ ] **Step 3: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 4: ブラウザで確認**

- Month トグルで月グリッドに切り替わり、前後移動が月単位になる
- 予定が「終日 → 時刻順」で並び、4件目以降が「他 N 件」に畳まれる
- 締切チップが月セルにも出る
- 日付の数字、または「他 N 件」をクリックすると、その日を含む週ビューへ移る
- 当月外の日がグレーで表示される

- [ ] **Step 5: コミット**

```bash
git add components/calendar/month-view.tsx app/\(dashboard\)/calendar/page.tsx
git commit -m "feat(calendar): 月ビューを追加"
```

---

## Task 13: Agent API でスケジュールを読み書きできるようにする

**Files:**
- Create: `lib/calendar/validate-schedule-input.ts`
- Test: `lib/calendar/validate-schedule-input.test.ts`
- Modify: `app/api/agent/tasks/route.ts`（POST）
- Modify: `app/api/agent/tasks/[id]/route.ts`（PATCH）

**Interfaces:**
- Consumes: Task 1 の3列
- Produces:
  - `validateScheduleInput(input: { scheduled_date?: unknown; scheduled_start_time?: unknown; scheduled_end_time?: unknown }): string | null` — 問題があればエラーメッセージ、なければ `null`
  - エージェント向け HTTP API が `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` を受け付ける。GET は既に `select('*')` のため読み取りは自動で含まれる。`/api/v1/agent/tasks*` は同じハンドラの re-export なので追随する。

> **なぜ route.ts に直接書かないか:** Next.js の App Router は route ファイルの export を型検査し、`GET` / `POST` / `PATCH` 等以外の named export があるとビルドが失敗する。バリデーションは `lib/` の純関数として切り出し、両ルートから import する。純関数なので vitest でも検証できる。

- [ ] **Step 1: 失敗するテストを書く**

`lib/calendar/validate-schedule-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateScheduleInput } from './validate-schedule-input'

describe('validateScheduleInput', () => {
  it('何も指定されていなければ OK', () => {
    expect(validateScheduleInput({})).toBeNull()
  })

  it('日付のみ（終日予定）は OK', () => {
    expect(validateScheduleInput({ scheduled_date: '2026-08-05' })).toBeNull()
  })

  it('日付 + 時刻2つは OK', () => {
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05',
      scheduled_start_time: '10:00',
      scheduled_end_time: '12:00',
    })).toBeNull()
  })

  it('null による解除は OK', () => {
    expect(validateScheduleInput({
      scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null,
    })).toBeNull()
  })

  it('日付の形式が違えばエラー', () => {
    expect(validateScheduleInput({ scheduled_date: '2026/08/05' }))
      .toBe('scheduled_date must be YYYY-MM-DD or null')
    expect(validateScheduleInput({ scheduled_date: 20260805 }))
      .toBe('scheduled_date must be YYYY-MM-DD or null')
  })

  it('時刻の形式が違えばエラー', () => {
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '9:00', scheduled_end_time: '10:00',
    })).toBe('scheduled_start_time must be HH:MM or null')
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '09:00', scheduled_end_time: '10:00:00',
    })).toBe('scheduled_end_time must be HH:MM or null')
  })

  it('時刻の片側だけはエラー', () => {
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '10:00',
    })).toBe('scheduled_start_time and scheduled_end_time must be set together')
  })

  it('日付なしで時刻だけはエラー', () => {
    expect(validateScheduleInput({
      scheduled_start_time: '10:00', scheduled_end_time: '12:00',
    })).toBe('scheduled_date is required when times are set')
  })

  it('終了が開始以前はエラー', () => {
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '12:00', scheduled_end_time: '10:00',
    })).toBe('scheduled_end_time must be later than scheduled_start_time')
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '10:00', scheduled_end_time: '10:00',
    })).toBe('scheduled_end_time must be later than scheduled_start_time')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- lib/calendar/validate-schedule-input.test.ts`
Expected: FAIL（`Failed to resolve import "./validate-schedule-input"`）

- [ ] **Step 3: 実装を書く**

`lib/calendar/validate-schedule-input.ts`:

```ts
// エージェント API から届く scheduled_* の検証。DB の task_schedule_valid と同じ組み合わせのみ許可する。
// route ファイルは named export を増やせない（Next.js が型検査で弾く）ためここに置く。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export interface ScheduleInput {
  scheduled_date?: unknown
  scheduled_start_time?: unknown
  scheduled_end_time?: unknown
}

/** 問題があればエラーメッセージ、なければ null */
export function validateScheduleInput(input: ScheduleInput): string | null {
  const { scheduled_date: date, scheduled_start_time: start, scheduled_end_time: end } = input

  if (date !== undefined && date !== null && (typeof date !== 'string' || !DATE_RE.test(date))) {
    return 'scheduled_date must be YYYY-MM-DD or null'
  }

  const times = [
    ['scheduled_start_time', start],
    ['scheduled_end_time', end],
  ] as const
  for (const [name, value] of times) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || !TIME_RE.test(value))) {
      return `${name} must be HH:MM or null`
    }
  }

  const hasStart = typeof start === 'string'
  const hasEnd = typeof end === 'string'
  if (hasStart !== hasEnd) {
    return 'scheduled_start_time and scheduled_end_time must be set together'
  }
  if (!hasStart) return null

  if (typeof date !== 'string') {
    return 'scheduled_date is required when times are set'
  }
  // HH:MM は辞書順と時刻順が一致するため文字列比較でよい
  if ((end as string) <= (start as string)) {
    return 'scheduled_end_time must be later than scheduled_start_time'
  }

  return null
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- lib/calendar/validate-schedule-input.test.ts`
Expected: PASS

- [ ] **Step 5: POST に組み込む**

`app/api/agent/tasks/route.ts` の import に追加:

```ts
import { validateScheduleInput } from '@/lib/calendar/validate-schedule-input'
```

POST 内、`if (!body?.title || !body?.project_id)` のブロックの直後に追加:

```ts
  const scheduleError = validateScheduleInput(body)
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 })
```

`.insert({ ... })` の `due_date` の行の下に追加:

```ts
      scheduled_date: body.scheduled_date ?? null,
      scheduled_start_time: body.scheduled_date ? (body.scheduled_start_time ?? null) : null,
      scheduled_end_time: body.scheduled_date ? (body.scheduled_end_time ?? null) : null,
```

- [ ] **Step 6: PATCH に組み込む**

`app/api/agent/tasks/[id]/route.ts` の import 行に追加:

```ts
import { validateScheduleInput } from '@/lib/calendar/validate-schedule-input'
```

分割代入に3フィールドを追加する:

```ts
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
    scheduled_date,
    scheduled_start_time,
    scheduled_end_time,
    status,
    title,
  } = body
```

`due_date` の更新ブロックの直後に追加する:

```ts
  const scheduleTouched =
    scheduled_date !== undefined ||
    scheduled_start_time !== undefined ||
    scheduled_end_time !== undefined

  if (scheduleTouched) {
    const scheduleError = validateScheduleInput({ scheduled_date, scheduled_start_time, scheduled_end_time })
    if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 })

    if (scheduled_date !== undefined) updates.scheduled_date = scheduled_date || null
    if (scheduled_start_time !== undefined) updates.scheduled_start_time = scheduled_start_time || null
    if (scheduled_end_time !== undefined) updates.scheduled_end_time = scheduled_end_time || null

    // 日付を外したら時刻も必ず外す（DB の CHECK 制約に合わせる）
    if (scheduled_date !== undefined && !scheduled_date) {
      updates.scheduled_start_time = null
      updates.scheduled_end_time = null
    }
  }
```

- [ ] **Step 7: ビルドと lint**

Run: `npm run lint && npm run build`
Expected: エラーなし

- [ ] **Step 8: API を手で叩いて確認**

ユーザーにエージェント API キーを用意してもらい（`.env.local` の値、または Settings 画面に表示されるもの）、開発サーバ（`npm run dev`）に対して次を実行する。`$KEY` と `$TASK_ID` は実際の値に置き換える。

```bash
# 正常系: 予定を設定できる
curl -s -X PATCH http://localhost:3000/api/v1/agent/tasks/$TASK_ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"scheduled_date":"2026-08-05","scheduled_start_time":"10:00","scheduled_end_time":"12:00"}'
```
Expected: `{"success":true}`

```bash
# 異常系: 時刻の片側だけ
curl -s -X PATCH http://localhost:3000/api/v1/agent/tasks/$TASK_ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"scheduled_date":"2026-08-05","scheduled_start_time":"10:00"}'
```
Expected: HTTP 400 / `{"error":"scheduled_start_time and scheduled_end_time must be set together"}`

```bash
# 異常系: 終了が開始以前
curl -s -X PATCH http://localhost:3000/api/v1/agent/tasks/$TASK_ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"scheduled_date":"2026-08-05","scheduled_start_time":"12:00","scheduled_end_time":"10:00"}'
```
Expected: HTTP 400 / `{"error":"scheduled_end_time must be later than scheduled_start_time"}`

```bash
# 予定の解除: 日付を null にすると時刻も消える
curl -s -X PATCH http://localhost:3000/api/v1/agent/tasks/$TASK_ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"scheduled_date":null}'
```
Expected: `{"success":true}`。`/calendar` を開くとそのタスクがトレイに戻っている。

```bash
# GET に scheduled_* が含まれる
curl -s http://localhost:3000/api/v1/agent/tasks -H "Authorization: Bearer $KEY" | head -c 800
```
Expected: レスポンスの task に `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` が含まれる。

- [ ] **Step 9: コミット**

```bash
git add lib/calendar/validate-schedule-input.ts lib/calendar/validate-schedule-input.test.ts app/api/agent/tasks/route.ts app/api/agent/tasks/\[id\]/route.ts
git commit -m "feat(api): エージェントAPIで作業予定の読み書きに対応"
```

---

## Task 14: 全体の回帰確認と MCP 側の要否判断

**Files:**
- 変更なし（確認のみ。必要なら別作業として切り出す）

- [ ] **Step 1: 全テストとビルドを通す**

Run: `npm test && npm run lint && npm run build`
Expected: すべて PASS / エラーなし

- [ ] **Step 2: 既存ビューの回帰確認**

ブラウザで次を確認し、カレンダー追加による副作用がないことを見る:

- `/inbox` — 一覧が出る、Quick Add が動く
- `/today` — 締切ベースの一覧が従来通り（`scheduled_date` の影響を受けていない）
- `/my-tasks` — 一覧が出る
- `/projects/[id]` — ボードのドラッグ＆ドロップで列間移動できる
- `/projects/[id]/list` — リストの並べ替え・ドロップができる
- サイドバーのプロジェクトへのドロップでプロジェクト移動ができる
- サイドバーの My Tasks へのドロップで自分にアサインできる

- [ ] **Step 3: relay-mcp 側の要否を確認しユーザーに報告**

MCP サーバ（別リポジトリ）の `task_create` / `task_update` ツールのスキーマに `scheduled_*` を追加する必要があるかを調べる。リポジトリの場所はユーザーに確認する（`~/hub/projects/doing/relay-taskboard` 配下、または別リポジトリ）。

判断基準:
- MCP ツールが引数をそのまま HTTP API に転送しているだけなら、スキーマに3フィールドを足すだけで足りる
- 引数を明示的に allow-list している場合は、その一覧に3フィールドを追加する必要がある

このリポジトリの変更ではないため、**ここでは実装しない。** 調査結果と必要な変更内容をユーザーに報告し、別作業として進めるか判断を仰ぐ。

- [ ] **Step 4: 完了報告**

ユーザーに次を報告する:
- 動作確認できたこと（週ビューでの割り当て・移動・リサイズ・解除、月ビュー、モバイルのタップ割り当て、Agent API）
- 実機で未確認の項目があればその旨
- relay-mcp 側で必要な追加作業（あれば）

---

## Self-Review

**Spec coverage:**

| 設計書の項目 | 対応タスク |
|---|---|
| `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` + CHECK + index | Task 1 |
| 日をまたがない（23:59 で丸め） | Task 2（`buildTimedSchedule` のテスト含む） |
| 親タスクのみ | Task 5（クエリの `.is('parent_task_id', null)`） |
| `due_date` 不変 | Task 14 Step 2 の回帰確認 |
| `/calendar` をサイドバーに追加、横断ビュー | Task 6 |
| 週ビュー（30分刻み・6:00–22:00 既定・24hスクロール・重なり横並び・モバイル横スクロール） | Task 6, 7 |
| 月ビュー（終日→時刻順・「他 N 件」・日付クリックで週へ・当月外グレー） | Task 12 |
| 締切チップ（旗アイコン・別スタイル） | Task 7 |
| 完了タスクは取り消し線＋減光で残す | Task 7 |
| 未スケジュールトレイ（締切→優先度順・上限100） | Task 4, 5, 8 |
| ドラッグ割り当て（トレイ→時間枠 +60分 / 終日枠 / カレンダー内移動） | Task 9 |
| `collisionDetection` にカレンダー分岐、サイドバー優先は維持 | Task 9 |
| リサイズ（30分刻み・最小30分・pointer イベント） | Task 10 |
| タップ割り当て（cmdk ダイアログ）とモバイル下部シート | Task 11 |
| 予定解除（⋯ メニュー + 右クリック） | Task 10 |
| 楽観的更新（トレイ⇄カレンダーの移動含む） | Task 5 |
| プロジェクトフィルタはクライアント側 | Task 6, 8 |
| リアルタイム（invalidate 方式） | Task 5 |
| Agent API の読み書きとバリデーション | Task 13 |
| relay-mcp の要否確認 | Task 14 |
| `lib/calendar/` の単体テスト | Task 2, 3, 4, 13 |

**Type consistency:** `TaskSchedule` の3プロパティ名は DB 列名と一致（`scheduled_date` / `scheduled_start_time` / `scheduled_end_time`）。`CalendarTask` はこの3つを含むため `getDurationMinutes(task)` / `supabase.update(schedule)` がそのまま通る。droppable の `data.type` は `'calendar-day'` / `'calendar-all-day'` で、`TaskDndProvider`（Task 9 Step 1）と `week-view.tsx`（Task 9 Step 4, Task 11 Step 2）で一致している。`bucketTasksByDay` は `week-view.tsx` から export し `month-view.tsx` が import する（Task 7 で定義、Task 12 で使用）。
