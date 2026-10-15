import { addDays, todayStr } from './dates'
import { alive, db, getSettings, save, TABLES } from './db'
import { EVENT_TYPE_LABEL, PRIORITY_LABEL, STATUS_LABEL } from './i18n'
import { CURRENT_SCHEMA } from './migrate'
import type { Holiday, TableName } from './types'

export function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

export async function exportJSON() {
  const data: Record<string, any[]> = {}
  for (const t of TABLES) data[t] = alive(await (db as any)[t].toArray()).map(({ dirty, ...r }: any) => r)
  const payload = { app: 'DayFlow', schema: CURRENT_SCHEMA, exportedAt: new Date().toISOString(), data }
  download(`dayflow-backup-${todayStr()}.json`, JSON.stringify(payload, null, 1), 'application/json')
  localStorage.setItem('df-last-backup', String(Date.now()))
}

export interface ImportReport { added: number; updated: number; skipped: number; byTable: Record<string, number> }

/** Merge by id: newer updatedAt wins, identical ids never duplicate */
export async function importJSON(text: string, mode: 'merge' | 'replace'): Promise<ImportReport> {
  let parsed: any
  try { parsed = JSON.parse(text) } catch { throw new Error('INVALID_JSON') }
  if (parsed?.app !== 'DayFlow' || typeof parsed.data !== 'object') throw new Error('NOT_DAYFLOW')
  if ((parsed.schema || 1) > CURRENT_SCHEMA) throw new Error('NEWER_SCHEMA')
  const rep: ImportReport = { added: 0, updated: 0, skipped: 0, byTable: {} }
  if (mode === 'replace') {
    const now = Date.now()
    for (const t of TABLES) {
      const rows = await (db as any)[t].toArray()
      await (db as any)[t].bulkPut(rows.map((r: any) => ({ ...r, deleted: 1, dirty: 1, updatedAt: now })))
    }
  }
  for (const t of TABLES) {
    const rows: any[] = Array.isArray(parsed.data[t]) ? parsed.data[t] : []
    let n = 0
    for (const r of rows) {
      if (!r || typeof r.id !== 'string') { rep.skipped++; continue }
      const cur = await (db as any)[t].get(r.id)
      if (cur && !cur.deleted && mode === 'merge' && (cur.updatedAt || 0) >= (r.updatedAt || 0)) { rep.skipped++; continue }
      if (cur && !cur.deleted) rep.updated++; else rep.added++
      await (db as any)[t].put({ ...r, deleted: 0, dirty: 1, updatedAt: Math.max(Date.now(), (cur?.updatedAt || 0) + 1) })
      n++
    }
    rep.byTable[t] = n
  }
  await save('meta', { ...(await db.meta.get('settings'))!, id: 'settings' }) // emit change → sync
  return rep
}

// ---------- ICS ----------
const icsEsc = (s = '') => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const icsDate = (d: string) => d.replace(/-/g, '')
const icsDT = (d: string, t: string) => `${icsDate(d)}T${t.replace(':', '')}00`
const fold = (line: string) => line.match(/.{1,73}/gu)?.join('\r\n ') ?? line

export async function exportICS() {
  const s = await getSettings()
  const tz = s.timeZone
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DayFlow//Personal Planner//AR', 'CALSCALE:GREGORIAN']
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const ev = alive(await db.events.toArray())
  for (const e of ev) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@dayflow`, `DTSTAMP:${stamp}`, fold(`SUMMARY:${icsEsc(e.title)}`))
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.endDate || e.date, 1))}`)
    } else {
      lines.push(`DTSTART;TZID=${tz}:${icsDT(e.date, e.startTime || '09:00')}`, `DTEND;TZID=${tz}:${icsDT(e.endDate || e.date, e.endTime || e.startTime || '10:00')}`)
    }
    if (e.location) lines.push(fold(`LOCATION:${icsEsc(e.location)}`))
    if (e.notes) lines.push(fold(`DESCRIPTION:${icsEsc(e.notes)}`))
    lines.push(`CATEGORIES:${icsEsc((EVENT_TYPE_LABEL() as any)[e.type] || e.type)}`)
    if (e.recurrence) {
      const r = e.recurrence
      const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
      let rr = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`
      if (r.freq === 'weekly' && r.byDay?.length) rr += `;BYDAY=${r.byDay.map(d => days[d]).join(',')}`
      if (r.until) rr += `;UNTIL=${icsDate(r.until)}`
      lines.push(rr)
      for (const x of e.exDates || []) lines.push(e.allDay ? `EXDATE;VALUE=DATE:${icsDate(x)}` : `EXDATE;TZID=${tz}:${icsDT(x, e.startTime || '09:00')}`)
    }
    for (const m of e.reminders || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(e.title)}`), `TRIGGER:-PT${m}M`, 'END:VALARM')
    lines.push('END:VEVENT')
  }
  const tasks = alive(await db.tasks.toArray()).filter(t => t.dueDate && !['cancelled', 'archived'].includes(t.status))
  for (const t of tasks) {
    lines.push('BEGIN:VTODO', `UID:${t.id}@dayflow`, `DTSTAMP:${stamp}`, fold(`SUMMARY:${icsEsc(t.title)}`), `DUE;VALUE=DATE:${icsDate(t.dueDate!)}`,
      `STATUS:${t.status === 'completed' ? 'COMPLETED' : 'NEEDS-ACTION'}`, `PRIORITY:${{ urgent: 1, high: 3, normal: 5, low: 9 }[t.priority]}`)
    if (t.desc) lines.push(fold(`DESCRIPTION:${icsEsc(t.desc)}`))
    lines.push('END:VTODO')
  }
  const hol = alive(await db.holidays.toArray())
  for (const h of hol)
    lines.push('BEGIN:VEVENT', `UID:${h.id}@dayflow`, `DTSTAMP:${stamp}`, fold(`SUMMARY:${icsEsc(h.name + (h.status === 'estimated' ? ' (تقديري)' : ''))}`),
      `DTSTART;VALUE=DATE:${icsDate(h.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(h.end, 1))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')
  const lv = alive(await db.leaves.toArray())
  for (const l of lv)
    lines.push('BEGIN:VEVENT', `UID:${l.id}@dayflow`, `DTSTAMP:${stamp}`, 'SUMMARY:إجازة', `DTSTART;VALUE=DATE:${icsDate(l.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(l.end, 1))}`, 'END:VEVENT')
  lines.push('END:VCALENDAR')
  download(`dayflow-calendar-${todayStr()}.ics`, lines.join('\r\n'), 'text/calendar')
}

// ---------- CSV ----------
const csvCell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export async function exportTasksCSV() {
  const tasks = alive(await db.tasks.toArray())
  const cats = Object.fromEntries(alive(await db.categories.toArray()).map(c => [c.id, c.name]))
  const projs = Object.fromEntries(alive(await db.projects.toArray()).map(p => [p.id, p.name]))
  const head = ['العنوان', 'الحالة', 'الأولوية', 'التصنيف', 'المشروع', 'تاريخ الاستحقاق', 'الوقت', 'الاستحقاق الأصلي', 'المدة المقدّرة (د)', 'المدة الفعلية (د)', 'المتابعة', 'جهة المتابعة', 'تاريخ الإنجاز', 'الوصف']
  const rows = tasks.map(t => [
    t.title, (STATUS_LABEL() as any)[t.status], (PRIORITY_LABEL() as any)[t.priority], cats[t.categoryId || ''] || '', projs[t.projectId || ''] || '',
    t.dueDate || '', [t.startTime, t.endTime].filter(Boolean).join('–'), t.originalDueDate || '', t.estMin ?? '', t.actualMin ?? '',
    t.followUpDate || '', t.contact || '', t.completedAt ? new Date(t.completedAt).toISOString().slice(0, 10) : '', t.desc || '',
  ])
  download(`dayflow-tasks-${todayStr()}.csv`, '\ufeff' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
}

// ---------- holidays ----------
export async function exportHolidays() {
  const h = alive(await db.holidays.toArray()).map(({ dirty, deleted, ...r }: any) => r)
  download(`oman-holidays-${todayStr()}.json`, JSON.stringify({ app: 'DayFlow', kind: 'holidays', holidays: h }, null, 1), 'application/json')
}
export async function importHolidays(text: string): Promise<{ added: number; updated: number; skipped: number }> {
  const p = JSON.parse(text)
  const list: Holiday[] = p?.holidays || (Array.isArray(p) ? p : [])
  const rep = { added: 0, updated: 0, skipped: 0 }
  const existing = alive(await db.holidays.toArray())
  for (const h of list) {
    if (!h?.name || !/^\d{4}-\d{2}-\d{2}$/.test(h.start || '')) { rep.skipped++; continue }
    const end = h.end && h.end >= h.start ? h.end : h.start
    // dedupe: same id, or same name + same start date
    const match = existing.find(e => e.id === h.id || (e.name === h.name && e.start === h.start))
    const rec: Holiday = { ...h, official: h.official ?? true, status: h.status === 'estimated' ? 'estimated' : 'confirmed', end, id: match?.id || h.id || crypto.randomUUID(), updatedAt: 0 }
    if (match) rep.updated++; else rep.added++
    await save('holidays', rec)
  }
  return rep
}

export const tableNames: TableName[] = TABLES
