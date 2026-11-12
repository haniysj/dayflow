import { db, getSettings, saveMany, updateSettings } from './db'
import { DEMO_TITLES } from './seed'
import { countLeaveDays, normSlots } from './logic'
import { remSort, sameRem } from './reminders'
import { PRIORITY_SLOTS, type Leave } from './types'

/**
 * Data-schema version. IndexedDB index changes go in DayFlowDB (db.version(n)); record-shape changes go here.
 * Each step must be idempotent. Backups record the schema they were written with.
 */
export const CURRENT_SCHEMA = 6

const steps: Record<number, () => Promise<void>> = {
  1: async () => {
    // normalise priority slots (historic step; step 4 moves to five)
    const days = await db.days.toArray()
    for (const d of days) {
      const p = [...(d.priorities || [])]
      while (p.length < 3) p.push(null)
      if (p.length !== (d.priorities || []).length || p.length > 3) await db.days.put({ ...d, priorities: p.slice(0, 3) })
    }
  },
  2: async () => {
    for (const t of ['tasks', 'events', 'projects'] as const) {
      const rows = await (db as any)[t].filter((r: any) => r.demo && !r.deleted && !DEMO_TITLES.has(r.title ?? r.name)).toArray()
      if (rows.length) await saveMany(t, rows.map((r: any) => ({ ...r, demo: false })))
    }
  },
  3: async () => { await addDefaultEventReminders() },
  4: async () => {
    // five daily priority slots (was three) — pad stored days locally without re-syncing every day record
    const days = await db.days.toArray()
    for (const d of days) if ((d.priorities || []).length !== PRIORITY_SLOTS) await db.days.put({ ...d, priorities: normSlots(d.priorities) })
  },
  5: async () => { await recountAnnualLeave() },
  6: async () => { await countAllLeaveDays() },
}

/**
 * Leave counts every day from the first to the last (weekends and public holidays included).
 * Switch the counting settings on and recount saved leave whose day count was automatic.
 */
export async function countAllLeaveDays() {
  const before = await getSettings()
  const after = { ...before, leaveCountWeekends: true, leaveCountHolidays: true, leaveTypes: before.leaveTypes?.map(t => ({ ...t, countWeekends: true })) }
  await updateSettings({ leaveCountWeekends: true, leaveCountHolidays: true, ...(before.leaveTypes ? { leaveTypes: after.leaveTypes } : {}) })
  const holidays = (await db.holidays.toArray()).filter(h => !h.deleted)
  const rows = (await db.leaves.toArray()).filter(l => !l.deleted)
  // a saved count equal to what any earlier counting rule gave was automatic; anything else was typed by hand and is kept
  const oldRules = [false, true].flatMap(w => [false, true].map(h => ({ ...before, leaveCountWeekends: w, leaveCountHolidays: h, leaveTypes: undefined })))
  const wasAuto = (l: Leave) => oldRules.some(r => l.workingDays === countLeaveDays(l.start, l.end, r, holidays))
  const changed = rows.filter(wasAuto)
    .map(l => ({ ...l, workingDays: countLeaveDays(l.start, l.end, after, holidays, l.type) }))
    .filter(l => l.workingDays !== rows.find(r => r.id === l.id)!.workingDays)
  if (changed.length) await saveMany('leaves', changed)
}

/** Annual leave now counts the weekend days inside it: recount saved annual leave whose day count was automatic */
export async function recountAnnualLeave() {
  const settings = await getSettings()
  const holidays = (await db.holidays.toArray()).filter(h => !h.deleted)
  const rows = (await db.leaves.toArray()).filter(l => !l.deleted && l.type === 'annual')
  const changed = rows.filter(l => {
    const before = countLeaveDays(l.start, l.end, settings, holidays) // the old rule (no leave type)
    const now = countLeaveDays(l.start, l.end, settings, holidays, 'annual')
    return l.workingDays === before && now !== before
  }).map(l => ({ ...l, workingDays: countLeaveDays(l.start, l.end, settings, holidays, 'annual') }))
  if (changed.length) await saveMany('leaves', changed)
}

/** Events get the evening-before and morning-of alerts (existing reminders are kept; breaks are skipped) */
export async function addDefaultEventReminders() {
  const rows = (await db.events.toArray()).filter(e => !e.deleted && e.type !== 'break')
  const add = [{ d: 1, t: '20:00' }, { d: 0, t: '07:00' }]
  const changed = rows.filter(e => add.some(a => !(e.reminders || []).some(r => sameRem(r, a))))
    .map(e => ({ ...e, reminders: [...(e.reminders || []), ...add.filter(a => !(e.reminders || []).some(r => sameRem(r, a)))].sort(remSort) }))
  if (changed.length) await saveMany('events', changed)
}

export async function runMigrations() {
  const from = Number(localStorage.getItem('df-schema') || 0)
  for (let v = from + 1; v <= CURRENT_SCHEMA; v++) {
    await steps[v]?.()
    localStorage.setItem('df-schema', String(v))
  }
}
