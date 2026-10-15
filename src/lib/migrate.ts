import { db } from './db'

/**
 * Data-schema version. IndexedDB index changes go in DayFlowDB (db.version(n)); record-shape changes go here.
 * Each step must be idempotent. Backups record the schema they were written with.
 */
export const CURRENT_SCHEMA = 1

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
}

export async function runMigrations() {
  const from = Number(localStorage.getItem('df-schema') || 0)
  for (let v = from + 1; v <= CURRENT_SCHEMA; v++) {
    await steps[v]?.()
    localStorage.setItem('df-schema', String(v))
  }
}
