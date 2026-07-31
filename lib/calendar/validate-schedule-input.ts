// エージェント API から届く scheduled_* の検証。DB の task_schedule_valid と同じ組み合わせのみ許可する。
// route ファイルは named export を増やせない（Next.js が型検査で弾く）ためここに置く。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// 形だけでなく範囲も見る。25:99 を通すと DB の TIME 型が弾いて 500 になってしまう
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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

  // 片方のキーだけを送られると、もう片方は DB に残ったまま NULL 化され CHECK 制約に反する
  // （バリデータはリクエストボディしか見えず、保存済みの値を知らないため）。
  // 省略も null 化も、必ず2つセットで送らせる
  if ((start === undefined) !== (end === undefined)) {
    return 'scheduled_start_time and scheduled_end_time must be set together'
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
