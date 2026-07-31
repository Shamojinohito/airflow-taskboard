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

  it('片方だけを null にするのもエラー（もう片方がDBに残り CHECK 制約に反するため）', () => {
    expect(validateScheduleInput({ scheduled_start_time: null }))
      .toBe('scheduled_start_time and scheduled_end_time must be set together')
    expect(validateScheduleInput({ scheduled_end_time: null }))
      .toBe('scheduled_start_time and scheduled_end_time must be set together')
  })

  it('時刻の範囲外はエラー（DBのTIME型に届く前に弾く）', () => {
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '25:99', scheduled_end_time: '26:00',
    })).toBe('scheduled_start_time must be HH:MM or null')
    expect(validateScheduleInput({
      scheduled_date: '2026-08-05', scheduled_start_time: '23:59', scheduled_end_time: '24:00',
    })).toBe('scheduled_end_time must be HH:MM or null')
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
