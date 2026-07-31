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
