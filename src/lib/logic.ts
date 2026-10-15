import { addDays, addMonths, diffDays, dow, range, todayStr } from './dates'
import { db, patch, save, uid } from './db'
import type { CalEvent, Holiday, Recurrence, Settings, Task } from './types'

// ---------- recurrence ----------
export function occursOn(start: string, rule: Recurrence, day: string, workdays?: number[]): boolean {
  if (day < start) return false
  if (rule.until && day > rule.until) return false
  if (rule.workdaysOnly && workdays && !workdays.includes(dow(day))) return false
  const n = Math.max(1, rule.interval || 1)
  switch (rule.freq) {
    case 'daily': return diffDays(day, start) % n === 0
    case 'weekly': {
      const days = rule.byDay?.length ? rule.byDay : [dow(start)]
      if (!days.includes(dow(day))) return false
      const weeks = Math.floor(diffDays(addDays(day, -dow(day)), addDays(start, -dow(start))) / 7)
      return weeks % n === 0
    }
    case 'monthly': {
      if (day.slice(8) !== start.slice(8)) return false
      const months = (+day.slice(0, 4) - +start.slice(0, 4)) * 12 + (+day.slice(5, 7) - +start.slice(5, 7))
      return months % n === 0
    }
    case 'yearly':
      return day.slice(5) === start.slice(5) && (+day.slice(0, 4) - +start.slice(0, 4)) % n === 0
  }
}

export function nextOccurrence(from: string, rule: Recurrence, workdays?: number[]): string | null {
  const start = from
  for (let i = 1; i < 800; i++) {
    const d = rule.freq === 'monthly' && !rule.workdaysOnly ? addMonths(start, i * (rule.interval || 1))
      : rule.freq === 'yearly' && !rule.workdaysOnly ? addMonths(start, 12 * i * (rule.interval || 1))
      : addDays(start, i)
    if (rule.until && d > rule.until) return null
    if (rule.freq === 'monthly' || rule.freq === 'yearly') return d
    if (occursOn(start, rule, d, workdays)) return d
  }
  return null
}

/** Event instance for a given day (recurring events are expanded virtually) */
export interface EventInstance extends CalEvent { instanceDate: string; spanStart: string; spanEnd: string }

export function expandEvents(events: CalEvent[], from: string, to: string, workdays?: number[]): EventInstance[] {
  const out: EventInstance[] = []
  for (const e of events) {
    const len = e.endDate && e.endDate > e.date ? diffDays(e.endDate, e.date) : 0
    if (!e.recurrence) {
      const end = addDays(e.date, len)
      if (end >= from && e.date <= to) out.push({ ...e, instanceDate: e.date, spanStart: e.date, spanEnd: end })
      continue
    }
    for (const d of range(addDays(from, -len), to)) {
      if (e.exDates?.includes(d)) continue
      if (occursOn(e.date, e.recurrence, d, workdays))
        out.push({ ...e, instanceDate: d, spanStart: d, spanEnd: addDays(d, len) })
    }
  }
  return out
}

// ---------- tasks ----------
export const isOpen = (t: Task) => !['completed', 'cancelled', 'archived'].includes(t.status)
export const isOverdue = (t: Task, today = todayStr()) => isOpen(t) && !!t.dueDate && t.dueDate < today

export async function completeTask(t: Task, settings: Settings): Promise<{ undo: () => Promise<void>; next?: Task }> {
  const before = { ...t }
  await save('tasks', { ...t, status: 'completed', completedAt: Date.now() })
  // sync any priority slot linked to this task
  await syncPrioritySlots(t.id, true)
  let next: Task | undefined
  if (t.recurrence && t.dueDate) {
    const nd = nextOccurrence(t.dueDate, t.recurrence, settings.workdays)
    if (nd) {
      next = {
        ...t, id: uid(), createdAt: Date.now(), dueDate: nd, status: 'planned', completedAt: null,
        originalDueDate: null, rescheduleCount: 0, actualMin: null,
        subtasks: t.subtasks?.map(s => ({ ...s, id: uid(), done: false })),
      }
      await save('tasks', next)
    }
  }
  return {
    next,
    undo: async () => {
      await save('tasks', before)
      await syncPrioritySlots(t.id, false)
      if (next) await db.tasks.update(next.id, { deleted: 1, dirty: 1, updatedAt: Date.now() })
    },
  }
}

export async function reopenTask(t: Task) {
  await save('tasks', { ...t, status: t.dueDate ? 'planned' : 'inbox', completedAt: null })
  await syncPrioritySlots(t.id, false)
}

async function syncPrioritySlots(taskId: string, done: boolean) {
  const days = await db.days.filter(d => !d.deleted && d.priorities.some(p => p?.taskId === taskId)).toArray()
  for (const d of days)
    await save('days', { ...d, priorities: d.priorities.map(p => (p?.taskId === taskId ? { ...p, done } : p)) })
}

/** Move a task to a new date, preserving the original due date and history */
export async function rescheduleTask(t: Task, date: string | null) {
  if ((t.dueDate ?? null) === date) return
  const moved = !!t.dueDate
  await save('tasks', {
    ...t,
    dueDate: date,
    originalDueDate: t.originalDueDate ?? (moved ? t.dueDate : null),
    rescheduleCount: (t.rescheduleCount || 0) + (moved ? 1 : 0),
    status: date ? (t.status === 'inbox' ? 'planned' : t.status) : t.status === 'planned' ? 'inbox' : t.status,
    // a time slot belongs to the old day
    startTime: date === t.dueDate ? t.startTime : null,
    endTime: date === t.dueDate ? t.endTime : null,
  })
}

export function newTask(partial: Partial<Task> = {}): Task {
  return {
    id: uid(), updatedAt: 0, title: '', createdAt: Date.now(), priority: 'normal',
    status: partial.dueDate ? 'planned' : 'inbox', dueDate: null, subtasks: [], links: [], reminders: [],
    ...partial,
  }
}

export function newEvent(partial: Partial<CalEvent> = {}): CalEvent {
  return {
    id: uid(), updatedAt: 0, title: '', type: 'work', date: todayStr(), allDay: false,
    startTime: '09:00', endTime: '10:00', reminders: [], ...partial,
  }
}

// ---------- leave ----------
export function holidayDates(holidays: Holiday[]) {
  const s = new Set<string>()
  for (const h of holidays) if (h.official) for (const d of range(h.start, h.end)) s.add(d)
  return s
}

export function countLeaveDays(start: string, end: string, settings: Settings, holidays: Holiday[]) {
  if (!start || !end || end < start) return 0
  const hd = holidayDates(holidays)
  return range(start, end).filter(d => {
    if (!settings.leaveCountWeekends && !settings.workdays.includes(dow(d))) return false
    if (!settings.leaveCountHolidays && hd.has(d)) return false
    return true
  }).length
}

export function leaveYearRange(settings: Settings, today = todayStr()) {
  const [mm, dd] = (settings.leaveYearStart || '01-01').split('-')
  let start = `${today.slice(0, 4)}-${mm}-${dd}`
  if (start > today) start = `${+today.slice(0, 4) - 1}-${mm}-${dd}`
  return { start, end: addDays(addMonths(start, 12), -1) }
}

// ---------- overlap layout for time grids ----------
export interface Positioned<T> { item: T; start: number; end: number; col: number; cols: number }
export function layoutOverlaps<T>(items: { item: T; start: number; end: number }[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Positioned<T>[] = []
  let cluster: Positioned<T>[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map(c => c.col + 1))
    cluster.forEach(c => (c.cols = cols))
    out.push(...cluster)
    cluster = []
  }
  for (const it of sorted) {
    const e = Math.max(it.end, it.start + 15)
    if (it.start >= clusterEnd && cluster.length) flush()
    const used = new Set(cluster.filter(c => c.end > it.start).map(c => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...it, end: e, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, e)
  }
  if (cluster.length) flush()
  return out
}

export async function setPriority(date: string, slot: number, value: any) {
  const d = (await db.days.get(date)) || { id: date, updatedAt: 0, priorities: [null, null, null] }
  const pr = [...(d.priorities || [null, null, null])]
  while (pr.length < 3) pr.push(null)
  pr[slot] = value
  await save('days', { ...d, deleted: 0, priorities: pr.slice(0, 3) })
}

export async function ensureDay(date: string) {
  const d = await db.days.get(date)
  if (d && !d.deleted) return d
  return { id: date, updatedAt: 0, priorities: [null, null, null] } as any
}

export { patch }
