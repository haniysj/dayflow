import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
  CalEvent, Category, DayRecord, Holiday, Leave, MetaRecord, Note, Project, Settings, TableName, Task,
} from './types'

export class DayFlowDB extends Dexie {
  tasks!: Table<Task, string>
  events!: Table<CalEvent, string>
  categories!: Table<Category, string>
  projects!: Table<Project, string>
  notes!: Table<Note, string>
  days!: Table<DayRecord, string>
  leaves!: Table<Leave, string>
  holidays!: Table<Holiday, string>
  meta!: Table<MetaRecord, string>

  constructor() {
    super('dayflow')
    // v1 schema. Add new versions below (never edit an old one) and migrate in .upgrade().
    this.version(1).stores({
      tasks: 'id, dueDate, status, categoryId, projectId, followUpDate, completedAt, dirty, deleted',
      events: 'id, date, endDate, type, dirty, deleted',
      categories: 'id, order, dirty, deleted',
      projects: 'id, categoryId, status, dirty, deleted',
      notes: 'id, createdAt, dirty, deleted',
      days: 'id, dirty, deleted',
      leaves: 'id, start, end, dirty, deleted',
      holidays: 'id, start, end, dirty, deleted',
      meta: 'id, dirty, deleted',
    })
  }
}

export const db = new DayFlowDB()
export const TABLES: TableName[] = ['tasks', 'events', 'categories', 'projects', 'notes', 'days', 'leaves', 'holidays', 'meta']

export const uid = () =>
  (crypto.randomUUID?.() ?? 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2))

// ---------- change notification (save status + sync trigger) ----------
type Listener = () => void
const listeners = new Set<Listener>()
export const onLocalChange = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn) } }
let lastSavedAt = 0
export const getLastSaved = () => lastSavedAt
const emit = () => { lastSavedAt = Date.now(); listeners.forEach(f => f()) }

/** Create or update a record (stamps updatedAt + dirty) */
export async function save<T extends { id: string }>(table: TableName, rec: T): Promise<T> {
  const r = { ...rec, updatedAt: Date.now(), dirty: 1, deleted: 0 } as any
  await (db as any)[table].put(r)
  emit()
  return r
}
export async function saveMany(table: TableName, recs: any[]) {
  const now = Date.now()
  await (db as any)[table].bulkPut(recs.map(r => ({ ...r, updatedAt: now, dirty: 1, deleted: 0 })))
  emit()
}
/** Patch fields of an existing record */
export async function patch(table: TableName, id: string, changes: Record<string, any>) {
  const cur = await (db as any)[table].get(id)
  if (!cur) return
  await save(table, { ...cur, ...changes })
}
/** Soft delete (tombstone kept for sync) */
export async function remove(table: TableName, id: string) {
  const cur = await (db as any)[table].get(id)
  if (!cur) return
  await (db as any)[table].put({ ...cur, deleted: 1, dirty: 1, updatedAt: Date.now() })
  emit()
}
export async function removeMany(table: TableName, ids: string[]) {
  const rows = (await (db as any)[table].bulkGet(ids)).filter(Boolean)
  const now = Date.now()
  await (db as any)[table].bulkPut(rows.map((r: any) => ({ ...r, deleted: 1, dirty: 1, updatedAt: now })))
  emit()
}

export const alive = <T extends { deleted?: 0 | 1 }>(rows: T[]) => rows.filter(r => !r.deleted)

// ---------- settings ----------
export const DEFAULT_SETTINGS: Settings = {
  appName: 'DayFlow',
  lang: 'ar',
  dateFormat: 'long',
  showHijri: true,
  timeFormat: '12',
  timeZone: 'Asia/Muscat',
  weekStart: 0,
  workdays: [0, 1, 2, 3, 4],
  workStart: '07:30',
  workEnd: '14:30',
  dayStart: 6,
  dayEnd: 22,
  slotMin: 30,
  theme: 'system',
  accent: '#1F7A6D',
  density: 'comfortable',
  reducedMotion: 'system',
  motivation: 'خطوة واضحة اليوم أفضل من خطة كاملة لا تبدأ.',
  typeColors: {},
  notifyEnabled: true,
  defaultReminders: [10],
  defaultReminderTime: '08:00',
  quietEnabled: true,
  quietStart: '22:30',
  quietEnd: '06:00',
  morningEnabled: true,
  morningTime: '07:00',
  eveningEnabled: true,
  eveningTime: '20:30',
  weeklyEnabled: true,
  weeklyDay: 4,
  weeklyTime: '13:00',
  notifyCats: { tasks: true, events: true, planning: true, leave: true },
  leaveAllowance: 30,
  leaveYearStart: '01-01',
  leaveCountWeekends: false,
  leaveCountHolidays: false,
  leaveCarryOver: 0,
  reviewQuestions: ['ما الذي سار بشكل جيد اليوم؟', 'ما الذي أعاقني؟', 'ما الذي سأفعله بشكل مختلف غداً؟'],
  onboarded: false,
}

export function useSettings(): Settings {
  const rec = useLiveQuery(() => db.meta.get('settings'), [])
  return { ...DEFAULT_SETTINGS, ...(rec && !rec.deleted ? rec.value : {}) }
}
export async function getSettings(): Promise<Settings> {
  const rec = await db.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...(rec && !rec.deleted ? rec.value : {}) }
}
export async function updateSettings(changes: Partial<Settings>) {
  const cur = await getSettings()
  await save('meta', { id: 'settings', value: { ...cur, ...changes } })
}

// ---------- live hooks ----------
export const useTasks = () => useLiveQuery(async () => alive(await db.tasks.toArray()), [], undefined)
export const useEvents = () => useLiveQuery(async () => alive(await db.events.toArray()), [], undefined)
export const useCategories = () =>
  useLiveQuery(async () => alive(await db.categories.orderBy('order').toArray()), [], undefined)
export const useProjects = () => useLiveQuery(async () => alive(await db.projects.toArray()), [], undefined)
export const useNotes = () =>
  useLiveQuery(async () => alive(await db.notes.orderBy('createdAt').reverse().toArray()), [], undefined)
export const useLeaves = () => useLiveQuery(async () => alive(await db.leaves.orderBy('start').toArray()), [], undefined)
export const useHolidays = () => useLiveQuery(async () => alive(await db.holidays.orderBy('start').toArray()), [], undefined)
export const useDay = (date: string) =>
  useLiveQuery(async () => { const d = await db.days.get(date); return d && !d.deleted ? d : null }, [date], undefined)
export const useDays = () => useLiveQuery(async () => alive(await db.days.toArray()), [], undefined)
