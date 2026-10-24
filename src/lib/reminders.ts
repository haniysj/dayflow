import { addDays, fmtTime, hmToMin, zonedToMs } from './dates'
import { L } from './i18n'
import type { ReminderRepeat, ReminderSpec } from './types'

export const isDayRem = (r: ReminderSpec): r is { d: number; t: string } => typeof r === 'object' && r !== null
/** Stable key: numbers keep their old form so already-fired reminders are not repeated after the update */
export const remKey = (r: ReminderSpec) => (isDayRem(r) ? `d${r.d}@${r.t}` : String(r))
export const sameRem = (a: ReminderSpec, b: ReminderSpec) => remKey(a) === remKey(b)

/** When does this reminder fire? (epoch ms) — null when it would fire after a timed item has started */
export function remFireAt(r: ReminderSpec, date: string, startTime: string | null | undefined, allDay: boolean, defaultTime: string): number | null {
  const startMs = zonedToMs(date, allDay || !startTime ? defaultTime : startTime)
  if (!isDayRem(r)) return startMs - r * 60000
  const at = zonedToMs(addDays(date, -r.d), r.t)
  if (!allDay && startTime && at > startMs) return null // e.g. "morning of" 07:00 for a 06:30 meeting
  return at
}

const days = (n: number) => (n === 1 ? L('قبل يوم', '1 day before') : n === 2 ? L('قبل يومين', '2 days before') : n <= 10 ? L(`قبل ${n} أيام`, `${n} days before`) : L(`قبل ${n} يوماً`, `${n} days before`))
export function remLabel(r: ReminderSpec) {
  if (isDayRem(r)) {
    const when = r.d === 0 ? L('في نفس اليوم', 'Same day') : r.d === 1 ? L('اليوم السابق', 'Day before') : days(r.d)
    return `${when} · ${fmtTime(r.t)}`
  }
  if (r === 0) return L('عند الموعد', 'At start time')
  if (r % 1440 === 0) return days(r / 1440)
  if (r % 60 === 0) return r === 60 ? L('قبل ساعة', '1 hour before') : r === 120 ? L('قبل ساعتين', '2 hours before') : L(`قبل ${r / 60} ساعات`, `${r / 60} hours before`)
  return L(`قبل ${r} دقيقة`, `${r} min before`)
}
export const remSort = (a: ReminderSpec, b: ReminderSpec) => {
  // earliest alert first: more days/minutes before comes first
  const v = (r: ReminderSpec) => (isDayRem(r) ? r.d * 1440 + (1440 - hmToMin(r.t)) : r)
  return v(b) - v(a)
}
export function repeatLabel(rep?: ReminderRepeat | null) {
  if (!rep || !rep.count) return ''
  const every = rep.every % 60 === 0 ? (rep.every === 60 ? L('كل ساعة', 'every hour') : L(`كل ${rep.every / 60} ساعات`, `every ${rep.every / 60} h`)) : L(`كل ${rep.every} دقيقة`, `every ${rep.every} min`)
  const times = rep.count === 1 ? L('مرة إضافية', '1 more time') : rep.count === 2 ? L('مرتين إضافيتين', '2 more times') : L(`${rep.count} مرات إضافية`, `${rep.count} more times`)
  return `${L('يتكرر', 'Repeats')} ${every} · ${times}`
}
