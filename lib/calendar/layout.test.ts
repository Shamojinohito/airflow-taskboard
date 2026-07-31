import { describe, expect, it } from 'vitest'
import {
  allDayDroppableId,
  dayColumnDroppableId,
  layoutBlocks,
  toCalendarBlock,
} from './layout'

describe('droppable id', () => {
  it('日カラムと終日行の ID を作る', () => {
    expect(dayColumnDroppableId('2026-08-03')).toBe('calendar-day-2026-08-03')
    expect(allDayDroppableId('2026-08-03')).toBe('calendar-allday-2026-08-03')
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
