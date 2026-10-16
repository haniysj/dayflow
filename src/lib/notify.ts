import { addDays, dow, hmToMin, minToHM, range, todayStr, zonedToMs, msToDate, msToHM } from './dates'
import { alive, db, getSettings, save } from './db'
import { L } from './i18n'
import { expandEvents, isOpen } from './logic'
import { backendConfigured, getToken, pushSubCount, removePushSub, savePushSub, setRemoteSchedule, syncEnabled } from './sync'
import type { Settings } from './types'

export interface ReminderItem { id: string; at: number; title: string; body: string; url: string; cat: 'tasks' | 'events' | 'planning' | 'leave' }

export type PermState = 'granted' | 'denied' | 'default' | 'unsupported'
export const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator
export const pushSupported = () => notifSupported() && 'PushManager' in window
export const permission = (): PermState => (notifSupported() ? (Notification.permission as PermState) : 'unsupported')
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function requestPermission(): Promise<PermState> {
  if (!notifSupported()) return 'unsupported'
  const r = await Notification.requestPermission()
  return r as PermState
}

// ---------- quiet hours ----------
function applyQuiet(ms: number, s: Settings): number {
  if (!s.quietEnabled) return ms
  const t = hmToMin(msToHM(ms)), a = hmToMin(s.quietStart), b = hmToMin(s.quietEnd)
  const inQuiet = a < b ? t >= a && t < b : t >= a || t < b
  if (!inQuiet) return ms
  // deliver at the end of quiet hours
  let d = msToDate(ms)
  if (a > b && t >= a) d = addDays(d, 1)
  return zonedToMs(d, s.quietEnd)
}

// ---------- build schedule (next 8 days) ----------
export async function buildSchedule(days = 8): Promise<ReminderItem[]> {
  const s = await getSettings()
  if (!s.notifyEnabled) return []
  const now = Date.now()
  const today = todayStr()
  const end = addDays(today, days)
  const out: ReminderItem[] = []
  const add = (it: ReminderItem) => {
    if (!s.notifyCats[it.cat]) return
    const at = applyQuiet(it.at, s)
    if (at > now - 10 * 60000 && at < zonedToMs(end, '23:59')) out.push({ ...it, at })
  }
  const offLabel = (m: number) => m === 0 ? L('الآن', 'now') : m < 60 ? L(`بعد ${m} دقيقة`, `in ${m} min`) : m < 1440 ? L(`بعد ${m / 60} ساعة`, `in ${m / 60} h`) : L('غداً', 'tomorrow')

  const tasks = alive(await db.tasks.toArray()).filter(isOpen)
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate > end || !t.reminders?.length) continue
    const base = zonedToMs(t.dueDate, t.startTime || s.defaultReminderTime)
    for (const m of t.reminders)
      add({ id: `t:${t.id}:${t.dueDate}:${t.startTime || ''}:${m}`, at: base - m * 60000, title: t.title,
        body: t.startTime ? `${L('مهمة', 'Task')} · ${offLabel(m)}` : L('مهمة مستحقة اليوم', 'Task due today'), url: `/?task=${t.id}`, cat: 'tasks' })
    if (t.followUpDate && t.followUpDate >= today && t.followUpDate <= end)
      add({ id: `f:${t.id}:${t.followUpDate}`, at: zonedToMs(t.followUpDate, s.defaultReminderTime), title: L('متابعة: ', 'Follow up: ') + t.title,
        body: t.contact ? L(`مع ${t.contact}`, `with ${t.contact}`) : L('موعد المتابعة اليوم', 'Follow-up due today'), url: `/?task=${t.id}`, cat: 'tasks' })
  }
  const events = alive(await db.events.toArray())
  for (const e of expandEvents(events, today, end, s.workdays)) {
    if (!e.reminders?.length) continue
    const base = zonedToMs(e.instanceDate, e.allDay ? s.defaultReminderTime : e.startTime || '09:00')
    for (const m of e.reminders)
      add({ id: `e:${e.id}:${e.instanceDate}:${e.startTime || ''}:${m}`, at: base - m * 60000, title: e.title,
        body: [e.allDay ? L('طوال اليوم', 'All day') : offLabel(m), e.location].filter(Boolean).join(' · '), url: `/?event=${e.id}&d=${e.instanceDate}`, cat: 'events' })
  }
  const notes = alive(await db.notes.toArray())
  for (const n of notes) if (n.remindAt && !n.archived) {
    const [d, tm] = n.remindAt.split('T')
    add({ id: `n:${n.id}:${n.remindAt}`, at: zonedToMs(d, tm), title: L('تذكير', 'Reminder'), body: n.text.slice(0, 140), url: '/?view=today', cat: 'tasks' })
  }
  for (const d of range(today, end)) {
    const work = s.workdays.includes(dow(d))
    if (s.morningEnabled && work) add({ id: `m:${d}`, at: zonedToMs(d, s.morningTime), title: L('خطّط ليومك', 'Plan your day'), body: L('اختر أولوياتك الثلاث وراجع جدول اليوم', 'Pick your top three and review today’s schedule'), url: '/?view=today', cat: 'planning' })
    if (s.eveningEnabled && work) add({ id: `r:${d}`, at: zonedToMs(d, s.eveningTime), title: L('مراجعة نهاية اليوم', 'End-of-day review'), body: L('دقيقتان لمراجعة يومك وتحديد أهم مهمة للغد', 'Two minutes to review today and pick tomorrow’s key task'), url: '/?review=1', cat: 'planning' })
    if (s.weeklyEnabled && dow(d) === s.weeklyDay) add({ id: `w:${d}`, at: zonedToMs(d, s.weeklyTime), title: L('المراجعة الأسبوعية', 'Weekly review'), body: L('راجع المعلّق وخطط للأسبوع القادم', 'Review open items and plan next week'), url: '/?view=reports&weekly=1', cat: 'planning' })
  }
  const leaves = alive(await db.leaves.toArray())
  for (const lv of leaves) {
    if (lv.remindDaysBefore != null) {
      const d = addDays(lv.start, -lv.remindDaysBefore)
      add({ id: `lv:${lv.id}:${lv.start}:${lv.remindDaysBefore}`, at: zonedToMs(d, '09:00'), title: L('إجازة قادمة', 'Upcoming leave'), body: L(`تبدأ إجازتك ${lv.start}`, `Your leave starts ${lv.start}`), url: '/?view=leave', cat: 'leave' })
    }
    if (lv.returnReminder) {
      const d = lv.end
      add({ id: `lr:${lv.id}:${lv.end}`, at: zonedToMs(d, '20:00'), title: L('العودة إلى العمل', 'Back to work'), body: L('تنتهي إجازتك اليوم — راجع مهام الغد', 'Your leave ends today — review tomorrow’s tasks'), url: '/?view=today', cat: 'leave' })
    }
  }
  const hol = alive(await db.holidays.toArray())
  for (const h of hol) if (h.remind) {
    const d = addDays(h.start, -1)
    add({ id: `h:${h.id}:${h.start}`, at: zonedToMs(d, '18:00'), title: h.name, body: L(`تبدأ غداً ${h.status === 'estimated' ? '(تاريخ تقديري)' : ''}`, `Starts tomorrow ${h.status === 'estimated' ? '(estimated)' : ''}`), url: '/?view=leave', cat: 'leave' })
  }
  // snoozes
  const snz = (await db.meta.get('snoozes'))?.value || {}
  const items = out.filter(i => !snz[i.id])
  for (const [id, v] of Object.entries<any>(snz)) if (v.at > now - 60000) items.push({ ...v.item, id: `${id}~${v.at}`, at: v.at })
  return items.sort((a, b) => a.at - b.at)
}

// ---------- fired log (local, per device) ----------
const FIRED = 'df-fired'
const firedLog = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(FIRED) || '{}') } catch { return {} } }
const saveFired = (o: Record<string, number>) => {
  const cut = Date.now() - 3 * 86400000
  for (const k of Object.keys(o)) if (o[k] < cut) delete o[k]
  localStorage.setItem(FIRED, JSON.stringify(o))
}
export interface CenterItem extends ReminderItem { firedAt: number; dismissed?: boolean }
const CENTER = 'df-center'
export const centerItems = (): CenterItem[] => { try { return JSON.parse(localStorage.getItem(CENTER) || '[]') } catch { return [] } }
const saveCenter = (x: CenterItem[]) => { localStorage.setItem(CENTER, JSON.stringify(x.slice(-60))); centerSubs.forEach(f => f()) }
const centerSubs = new Set<() => void>()
export const onCenter = (f: () => void) => { centerSubs.add(f); return () => { centerSubs.delete(f) } }

export function dismissCenter(id: string) { saveCenter(centerItems().map(i => (i.id === id ? { ...i, dismissed: true } : i))) }
export function clearCenter() { saveCenter(centerItems().map(i => ({ ...i, dismissed: true }))) }

export async function snooze(item: ReminderItem, minutes: number | 'tomorrow') {
  const s = await getSettings()
  const at = minutes === 'tomorrow' ? zonedToMs(addDays(todayStr(), 1), s.morningTime) : Date.now() + minutes * 60000
  const baseId = item.id.split('~')[0]
  const cur = (await db.meta.get('snoozes'))?.value || {}
  cur[baseId] = { at, item: { ...item, id: baseId } }
  for (const k of Object.keys(cur)) if (cur[k].at < Date.now() - 86400000) delete cur[k]
  await save('meta', { id: 'snoozes', value: cur })
  dismissCenter(item.id)
  scheduleSoon()
}

/** In-app checker: fires due reminders while the app is open (OS notification + reminder center). */
let lastItems: ReminderItem[] = []
export const upcoming = () => lastItems
let onFire: ((i: ReminderItem) => void) | null = null
export const setOnFire = (f: (i: ReminderItem) => void) => { onFire = f }

async function tick() {
  const now = Date.now()
  const fired = firedLog()
  const due = lastItems.filter(i => i.at <= now && i.at > now - 15 * 60000 && !fired[i.id])
  if (!due.length) return
  const center = centerItems()
  for (const it of due) {
    fired[it.id] = now
    center.push({ ...it, firedAt: now })
    onFire?.(it)
    if (permission() === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready
        // same tag as the server push → the OS shows only one
        await reg.showNotification(it.title, { body: it.body, tag: it.id, data: { url: it.url }, icon: '/icon-192.png', badge: '/badge-72.png' })
      } catch { /* ignore */ }
    }
  }
  saveFired(fired)
  saveCenter(center)
}

// ---------- remote push ----------
export type PushState = 'off' | 'on' | 'no-backend' | 'no-login' | 'unsupported' | 'needs-install' | 'denied'
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (!backendConfigured || !import.meta.env.VITE_VAPID_PUBLIC_KEY) return 'no-backend'
  if (!getToken()) return 'no-login'
  if (permission() === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

const b64ToU8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function enablePush() {
  const p = await requestPermission()
  if (p !== 'granted') throw new Error(p === 'denied' ? 'denied' : 'dismissed')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(import.meta.env.VITE_VAPID_PUBLIC_KEY) })
  await savePushSub(sub.toJSON())
  await pushRemoteSchedule()
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) { try { await removePushSub(sub.endpoint) } catch { /* offline */ } await sub.unsubscribe() }
}
export { pushSubCount }

let pushTimer: number | undefined
let lastSent = ''
export async function pushRemoteSchedule() {
  if (!getToken() || !backendConfigured || !syncEnabled()) return
  const items = lastItems.map(i => ({ id: i.id, at: new Date(i.at).toISOString(), title: i.title, body: i.body, url: i.url }))
  const sig = JSON.stringify(items)
  if (sig === lastSent) return
  try { await setRemoteSchedule(items); lastSent = sig } catch { /* retried on next change */ }
}

export async function refreshSchedule() {
  lastItems = await buildSchedule()
  clearTimeout(pushTimer)
  pushTimer = window.setTimeout(pushRemoteSchedule, 3000)
  centerSubs.forEach(f => f())
}
let soonTimer: number | undefined
export const scheduleSoon = () => { clearTimeout(soonTimer); soonTimer = window.setTimeout(refreshSchedule, 800) }

export function startReminders() {
  refreshSchedule()
  setInterval(tick, 20000)
  setInterval(refreshSchedule, 10 * 60000)
  setTimeout(tick, 3000)
}

export function testLocalNotification() {
  const it: ReminderItem = { id: 'local-test-' + Date.now(), at: Date.now(), title: L('اختبار التنبيه', 'Test notification'), body: L('التنبيهات تعمل على هذا الجهاز ✓', 'Notifications work on this device ✓'), url: '/', cat: 'planning' }
  lastItems = [...lastItems, it]
  return tick()
}
export { minToHM }
