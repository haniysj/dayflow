import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db, onLocalChange, TABLES } from './db'
import type { TableName } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const backendConfigured = !!(URL && KEY)
let sb: SupabaseClient | null = null
export const client = () => {
  if (!backendConfigured) throw new Error('backend-not-configured')
  return (sb ||= createClient(URL!, KEY!, { auth: { persistSession: false } }))
}

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error' | 'auth' | 'paused'

/** Cloud sync is ON by default on every device; the user can switch it off (per device) in Settings. */
export const syncEnabled = () => localStorage.getItem('df-sync-off') !== '1'
export function setSyncEnabled(on: boolean) {
  if (on) localStorage.removeItem('df-sync-off'); else localStorage.setItem('df-sync-off', '1')
  if (on) syncNow(); else set({ state: 'paused' })
  enabledSubs.forEach(f => f(on))
}
const enabledSubs = new Set<(on: boolean) => void>()
export const onSyncEnabled = (f: (on: boolean) => void) => { enabledSubs.add(f); return () => { enabledSubs.delete(f) } }
/** Should the app ask this device to connect? (sync on, server available, not connected yet) */
export const needsConnect = () => backendConfigured && syncEnabled() && !getToken()
interface SyncInfo { state: SyncState; lastSync: number | null; error?: string; pending: number }
let info: SyncInfo = { state: localStorage.getItem('df-sync-off') === '1' ? 'paused' : 'local', lastSync: Number(localStorage.getItem('df-last-sync')) || null, pending: 0 }
const subs = new Set<(i: SyncInfo) => void>()
export const onSync = (fn: (i: SyncInfo) => void) => { subs.add(fn); fn(info); return () => { subs.delete(fn) } }
const set = (p: Partial<SyncInfo>) => { info = { ...info, ...p }; subs.forEach(f => f(info)) }
export const getSyncInfo = () => info

export const getToken = () => localStorage.getItem('df-token')
const setToken = (t: string | null) => (t ? localStorage.setItem('df-token', t) : localStorage.removeItem('df-token'))
const cursor = () => Number(localStorage.getItem('df-cursor') || 0)

const deviceName = () => {
  const ua = navigator.userAgent
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device'
  const br = /SamsungBrowser/.test(ua) ? 'Samsung' : /HuaweiBrowser/.test(ua) ? 'Huawei' : /Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : ''
  return `${os} ${br}`.trim()
}

export const errCode = (e: any): string => {
  const m = String(e?.message || e || '')
  for (const c of ['DF_AUTH', 'DF_BADPASS', 'DF_EXISTS', 'DF_SHORT', 'DF_SECRET']) if (m.includes(c)) return c
  if (!navigator.onLine || /fetch|network/i.test(m)) return 'NETWORK'
  return m || 'UNKNOWN'
}

async function rpc<T = any>(fn: string, args: Record<string, any>): Promise<T> {
  const { data, error } = await client().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function serverStatus(): Promise<{ has_password: boolean }> { return rpc('df_status', {}) }
export async function setupPassword(pass: string) { setToken(await rpc<string>('df_setup', { p_pass: pass, p_device: deviceName() })); localStorage.setItem('df-cursor', '0') }
export async function login(pass: string) { setToken(await rpc<string>('df_login', { p_pass: pass, p_device: deviceName() })); localStorage.setItem('df-cursor', '0') }
export async function logout() {
  const t = getToken()
  try { if (t) await rpc('df_logout', { p_token: t }) } catch { /* offline: token stays revoked on server only when reachable */ }
  setToken(null)
  localStorage.removeItem('df-cursor')
  set({ state: 'local' })
}
export async function changePassword(oldP: string, newP: string) { await rpc('df_change_pass', { p_token: getToken(), p_old: oldP, p_new: newP }) }

/** Is the server store empty? (used to decide merge vs replace on first login) */
export async function serverHasData() {
  const r = await rpc<any>('df_pull', { p_token: getToken(), p_cursor: 0 })
  return (r.records?.length || 0) > 0
}

/** Clear local data so a fresh device mirrors the cloud exactly */
export async function resetLocal() {
  await Promise.all(TABLES.map(t => (db as any)[t].clear()))
  localStorage.setItem('df-cursor', '0')
}

let running: Promise<void> | null = null
let again = false
export function syncNow(): Promise<void> {
  if (!syncEnabled()) { set({ state: 'paused' }); return Promise.resolve() }
  if (!getToken() || !backendConfigured) { set({ state: 'local' }); return Promise.resolve() }
  if (running) { again = true; return running }
  running = doSync().finally(() => { running = null; if (again) { again = false; syncNow() } })
  return running
}

async function doSync() {
  if (!navigator.onLine) { set({ state: 'offline' }); return }
  set({ state: 'syncing' })
  try {
    const token = getToken()
    // 1) push dirty rows
    for (const t of TABLES) {
      const dirty = await (db as any)[t].where('dirty').equals(1).toArray()
      for (let i = 0; i < dirty.length; i += 200) {
        const chunk = dirty.slice(i, i + 200)
        await rpc('df_push', {
          p_token: token,
          p_records: chunk.map((r: any) => {
            const { dirty: _d, ...data } = r
            return { id: `${t}:${r.id}`, kind: t, data, u: r.updatedAt, d: !!r.deleted }
          }),
        })
        // clear dirty only where not edited meanwhile
        await db.transaction('rw', (db as any)[t], async () => {
          for (const r of chunk) {
            const cur = await (db as any)[t].get(r.id)
            if (cur && cur.updatedAt === r.updatedAt) await (db as any)[t].update(r.id, { dirty: 0 })
          }
        })
      }
    }
    // 2) pull
    let cur = cursor()
    for (let guard = 0; guard < 50; guard++) {
      const res = await rpc<any>('df_pull', { p_token: token, p_cursor: cur })
      const byTable: Record<string, any[]> = {}
      for (const r of res.records as any[]) (byTable[r.kind] ||= []).push(r)
      for (const [t, rows] of Object.entries(byTable)) {
        if (!TABLES.includes(t as TableName)) continue
        const table = (db as any)[t]
        await db.transaction('rw', table, async () => {
          for (const r of rows) {
            const local = await table.get(r.data.id)
            if (local && local.dirty && local.updatedAt > r.u) continue // newer local edit wins; pushed next round
            await table.put({ ...r.data, updatedAt: r.u, deleted: r.d ? 1 : 0, dirty: 0 })
          }
        })
      }
      cur = res.cursor
      localStorage.setItem('df-cursor', String(cur))
      if (!res.more) break
    }
    const now = Date.now()
    localStorage.setItem('df-last-sync', String(now))
    set({ state: 'synced', lastSync: now, error: undefined, pending: 0 })
    afterSyncHooks.forEach(f => f())
  } catch (e) {
    const c = errCode(e)
    if (c === 'DF_AUTH') { setToken(null); set({ state: 'auth', error: c }) }
    else set({ state: c === 'NETWORK' ? 'offline' : 'error', error: c })
  }
}

const afterSyncHooks = new Set<() => void>()
export const afterSync = (f: () => void) => { afterSyncHooks.add(f); return () => { afterSyncHooks.delete(f) } }

let timer: number | undefined
export function startSyncLoop() {
  onLocalChange(() => {
    localStorage.removeItem('df-pristine')
    if (!getToken() || !syncEnabled()) return
    set({ pending: info.pending + 1 })
    clearTimeout(timer)
    timer = window.setTimeout(syncNow, 1500)
  })
  window.addEventListener('online', () => syncNow())
  window.addEventListener('offline', () => getToken() && syncEnabled() && set({ state: 'offline' }))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow() })
  setInterval(() => { if (document.visibilityState === 'visible') syncNow() }, 60000)
  syncNow()
}

// ---------- push RPCs ----------
export const savePushSub = (sub: PushSubscriptionJSON) => rpc('df_save_sub', { p_token: getToken(), p_sub: sub })
export const removePushSub = (endpoint: string) => rpc('df_remove_sub', { p_token: getToken(), p_endpoint: endpoint })
export const pushSubCount = () => rpc<number>('df_sub_count', { p_token: getToken() })
export const setRemoteSchedule = (items: any[]) => rpc<number>('df_set_schedule', { p_token: getToken(), p_items: items })
export const queueTestPush = (title: string, body: string) => rpc('df_queue_test', { p_token: getToken(), p_title: title, p_body: body })
export const wipeRemote = (pass: string) => rpc('df_wipe', { p_token: getToken(), p_pass: pass })
