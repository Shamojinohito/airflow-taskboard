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
