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
