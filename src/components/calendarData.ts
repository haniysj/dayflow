import { addDays, fmtTime, range } from '../lib/dates'
import { db, save, uid } from '../lib/db'
import { getLang, L, LEAVE_TYPE_LABEL } from '../lib/i18n'
import { expandEvents, isOpen, type EventInstance } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { CalEvent, Category, Holiday, Leave, Settings, Task } from '../lib/types'
import { typeColor } from './EventEditor'
import { toGridMinutes, type AllDayItem, type GridItem, type SpanItem } from './TimeGrid'
import { toast } from './ui'

export { layoutSpans, type SpanItem, type SpanBar } from './TimeGrid'

export interface CalFilter { types: Record<string, boolean>; q: string; categoryId?: string }
export const ALL_TYPES = ['work', 'meeting', 'personal', 'deadline', 'reminder', 'occasion', 'travel', 'focus', 'break', 'task', 'leave', 'holiday']

const match = (f: CalFilter | undefined, type: string, title: string, catId?: string | null) =>
  !f || ((f.types[type] ?? true) && (!f.q || title.toLowerCase().includes(f.q.toLowerCase())) && (!f.categoryId || catId === f.categoryId))

export function buildCalendar(opts: {
  from: string; to: string; events: CalEvent[]; tasks: Task[]; leaves: Leave[]; holidays: Holiday[]; settings: Settings; cats: Category[]
  filter?: CalFilter; onEvent: (e: EventInstance) => void; onTask: (t: Task) => void; onLeave?: (l: Leave) => void; onHoliday?: (h: Holiday) => void
}) {
  const { from, to, settings, filter } = opts
  const tc = (t: string) => typeColor(t, settings.typeColors)
  const catColor = (id?: string | null) => opts.cats.find(c => c.id === id)?.color
  const timed: GridItem[] = []
  const spans: SpanItem[] = []
  const allDay: Record<string, AllDayItem[]> = {}
  const day = (d: string) => (allDay[d] ||= [])
  const instances = expandEvents(opts.events, from, to, settings.workdays)
  const lang = getLang()

  for (const h of opts.holidays) {
    if (h.end < from || h.start > to || !match(filter, 'holiday', h.name)) continue
    const base = { title: (lang === 'en' && h.nameEn ? h.nameEn : h.name) + (h.status === 'estimated' ? L(' (تقديري)', ' (est.)') : ''), color: h.official ? tc('holiday') : tc('occasion'), est: h.status === 'estimated', onClick: () => opts.onHoliday?.(h) }
    spans.push({ ...base, key: `h-${h.id}`, start: h.start, end: h.end, rank: 0 })
    for (const d of range(h.start > from ? h.start : from, h.end < to ? h.end : to)) day(d).push({ ...base, key: `h-${h.id}-${d}` })
  }
  for (const l of opts.leaves) {
    if (l.end < from || l.start > to || !match(filter, 'leave', 'leave')) continue
    const base = { title: (LEAVE_TYPE_LABEL() as any)[l.type], color: tc('leave'), onClick: () => opts.onLeave?.(l) }
    spans.push({ ...base, key: `l-${l.id}`, start: l.start, end: l.end, rank: 0 })
    for (const d of range(l.start > from ? l.start : from, l.end < to ? l.end : to)) day(d).push({ ...base, key: `l-${l.id}-${d}` })
  }
  for (const e of instances) {
    if (!match(filter, e.type, e.title, e.categoryId)) continue
    const multi = e.spanEnd > e.spanStart
    if (e.allDay || multi) {
      spans.push({ key: `e-${e.id}-${e.instanceDate}`, title: !e.allDay && e.startTime ? `${fmtTime(e.startTime).replace(':00', '')} ${e.title}` : e.title, color: tc(e.type), onClick: () => opts.onEvent(e), start: e.spanStart, end: e.spanEnd, rank: 1 })
      for (const d of range(e.spanStart > from ? e.spanStart : from, e.spanEnd < to ? e.spanEnd : to)) {
        const label = !e.allDay && d === e.spanStart && e.startTime ? `${e.title}` : e.title
        day(d).push({ key: `e-${e.id}-${e.instanceDate}-${d}`, title: label, color: tc(e.type), onClick: () => opts.onEvent(e) })
      }
      continue
    }
    const m = toGridMinutes(e.startTime, e.endTime, 60)
    timed.push({ key: `e-${e.id}-${e.instanceDate}`, kind: 'event', title: e.title, date: e.instanceDate, ...m, color: tc(e.type), sub: e.location, movable: true, ref: e })
  }
  for (const t of opts.tasks) {
    if (!t.dueDate || t.dueDate < from || (t.startTime ? t.dueDate : (t.startDate && t.startDate < t.dueDate ? t.startDate : t.dueDate)) > to || t.status === 'cancelled' || t.status === 'archived') continue
    if (t.dueDate > to) {
      // started inside this window, due after it: only the bar is drawn here
      if (!match(filter, 'task', t.title, t.categoryId)) continue
      spans.push({ key: `t-${t.id}`, title: '☐ ' + t.title, color: catColor(t.categoryId) || tc('task'), done: !isOpen(t), onClick: () => opts.onTask(t), start: t.startDate!, end: t.dueDate, rank: 1 })
      continue
    }
    if (!match(filter, 'task', t.title, t.categoryId)) continue
    if (t.startTime) {
      const m = toGridMinutes(t.startTime, t.endTime, t.estMin || 30)
      timed.push({ key: `t-${t.id}`, kind: 'task', title: t.title, date: t.dueDate, ...m, color: catColor(t.categoryId) || tc('task'), done: t.status === 'completed', movable: true, ref: t })
    } else {
      const base = { title: '☐ ' + t.title, color: catColor(t.categoryId) || tc('task'), done: !isOpen(t), onClick: () => opts.onTask(t) }
      day(t.dueDate).push({ ...base, key: `t-${t.id}` })
      // a task with a start date runs as one bar from its start to its due date
      const start = t.startDate && t.startDate < t.dueDate ? t.startDate : t.dueDate
      spans.push({ ...base, key: `t-${t.id}`, start, end: t.dueDate, rank: start < t.dueDate ? 1 : 2 })
    }
  }
  return { timed, allDay, spans }
}

/** Move/resize from the time grid */
export async function moveGridItem(it: GridItem, date: string, start: string, end: string) {
  if (it.kind === 'task') {
    const t = (await db.tasks.get(it.ref.id))!
    await save('tasks', {
      ...t, dueDate: date, startTime: start, endTime: end,
      originalDueDate: t.dueDate && t.dueDate !== date ? t.originalDueDate ?? t.dueDate : t.originalDueDate,
      rescheduleCount: (t.rescheduleCount || 0) + (t.dueDate && t.dueDate !== date ? 1 : 0),
      status: t.status === 'inbox' ? 'planned' : t.status,
    })
  } else {
    const inst = it.ref as EventInstance
    const series = (await db.events.get(inst.id))!
    if (series.recurrence) {
      // move just this occurrence: exception on the series + standalone copy
      await save('events', { ...series, exDates: [...(series.exDates || []), inst.instanceDate] })
      const { instanceDate, spanStart, spanEnd, ...base } = inst as any
      await save('events', { ...base, id: uid(), date, startTime: start, endTime: end, recurrence: null, exDates: [] })
      toast(L('نُقل هذا الموعد فقط (من سلسلة متكررة)', 'Moved this occurrence only (repeating series)'))
    } else {
      const len = series.endDate ? Math.round((Date.parse(series.endDate) - Date.parse(series.date)) / 86400000) : 0
      await save('events', { ...series, date, endDate: len ? addDays(date, len) : null, startTime: start, endTime: end })
    }
  }
  scheduleSoon()
}

export async function scheduleTaskAt(taskId: string, date: string, time: string, slotMin = 30) {
  const t = await db.tasks.get(taskId)
  if (!t) return
  const len = t.estMin || Math.max(30, slotMin)
  const [h, m] = time.split(':').map(Number)
  const endM = Math.min(24 * 60 - 1, h * 60 + m + len)
  await save('tasks', {
    ...t, dueDate: date, startTime: time, endTime: `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`,
    originalDueDate: t.dueDate && t.dueDate !== date ? t.originalDueDate ?? t.dueDate : t.originalDueDate,
    rescheduleCount: (t.rescheduleCount || 0) + (t.dueDate && t.dueDate !== date ? 1 : 0),
    status: t.status === 'inbox' ? 'planned' : t.status,
  })
  scheduleSoon()
}
