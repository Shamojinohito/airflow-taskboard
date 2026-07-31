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
