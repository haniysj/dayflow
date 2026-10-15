import { db, saveMany } from './db'
import { DEMO_TITLES } from './seed'

/**
 * Data-schema version. IndexedDB index changes go in DayFlowDB (db.version(n)); record-shape changes go here.
 * Each step must be idempotent. Backups record the schema they were written with.
 */
export const CURRENT_SCHEMA = 2

const steps: Record<number, () => Promise<void>> = {
  1: async () => {
    // normalise priority slots to exactly three entries
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
}

export async function runMigrations() {
  const from = Number(localStorage.getItem('df-schema') || 0)
  for (let v = from + 1; v <= CURRENT_SCHEMA; v++) {
    await steps[v]?.()
    localStorage.setItem('df-schema', String(v))
  }
}
