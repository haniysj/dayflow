import { addDays, msToDate, range, startOfWeek } from './dates'
import type { Category, DayRecord, Task } from './types'

export interface DayStat { date: string; due: number; done: number; planned: number; plannedDone: number; carried: number; prioSet: number; prioDone: number; reviewed: boolean }

/**
 * Task completion metrics only — they describe what was finished, not the quality or value of the work.
 * "due" = tasks whose due date is that day (excluding cancelled); "done" = of those, completed (on any date).
 */
export function dayStats(dates: string[], tasks: Task[], days: DayRecord[]): DayStat[] {
  const dayMap = new Map(days.map(d => [d.id, d]))
  return dates.map(date => {
    const due = tasks.filter(t => (t.dueDate === date || t.originalDueDate === date) && t.status !== 'cancelled')
    const onDay = due.filter(t => t.dueDate === date)
    const done = onDay.filter(t => t.status === 'completed').length
    const carried = tasks.filter(t => t.originalDueDate === date && t.dueDate && t.dueDate > date).length
    const d = dayMap.get(date)
    const pr = (d?.priorities || []).filter(Boolean)
    const plannedIds = d?.planned || []
    const plannedDone = plannedIds.filter(id => tasks.find(t => t.id === id)?.status === 'completed').length
    return {
      date, due: onDay.length, done, planned: plannedIds.length, plannedDone, carried,
      prioSet: pr.length, prioDone: pr.filter(p => p!.done).length, reviewed: !!d?.review?.doneAt,
    }
  })
}

export const rate = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)

export function weekBuckets(today: string, weeks: number, weekStart: number) {
  const out: { start: string; end: string }[] = []
  const s0 = startOfWeek(today, weekStart)
  for (let i = weeks - 1; i >= 0; i--) { const s = addDays(s0, -7 * i); out.push({ start: s, end: addDays(s, 6) }) }
  return out
}

export function completedInRange(tasks: Task[], from: string, to: string) {
  return tasks.filter(t => t.status === 'completed' && t.completedAt && msToDate(t.completedAt) >= from && msToDate(t.completedAt) <= to)
}

export function categoryLoad(tasks: Task[], cats: Category[], from: string, to: string) {
  return cats.map(c => {
    const ts = tasks.filter(t => t.categoryId === c.id)
    const open = ts.filter(t => !['completed', 'cancelled', 'archived'].includes(t.status)).length
    const done = completedInRange(ts, from, to).length
    const est = ts.filter(t => t.dueDate && t.dueDate >= from && t.dueDate <= to).reduce((a, t) => a + (t.estMin || 0), 0)
    return { cat: c, open, done, est }
  }).filter(x => x.open || x.done)
}

export { range }
