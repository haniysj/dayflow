// Date helpers. Calendar days are plain 'YYYY-MM-DD' strings and times are 'HH:mm' wall-clock
// values in the configured time zone (default Asia/Muscat). Arithmetic on day strings is done in UTC
// so it never shifts with the device's own zone.

let TZ = 'Asia/Muscat'
export const setTimeZone = (tz: string) => { TZ = tz || 'Asia/Muscat' }
export const getTimeZone = () => TZ

const pad = (n: number) => String(n).padStart(2, '0')

/** Parts of an instant as seen in the configured zone */
export function zonedParts(ms: number = Date.now(), tz = TZ) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

export const todayStr = () => { const p = zonedParts(); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
export const nowHM = () => { const p = zonedParts(); return `${pad(p.h)}:${pad(p.min)}` }
export const nowMinutes = () => { const p = zonedParts(); return p.h * 60 + p.min }

/** Convert a wall time in the zone to an epoch ms (handles any offset) */
export function zonedToMs(date: string, time = '00:00', tz = TZ): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const p = zonedParts(guess, tz)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
  const offset = asUtc - guess
  let ms = guess - offset
  const p2 = zonedParts(ms, tz)
  const asUtc2 = Date.UTC(p2.y, p2.m - 1, p2.d, p2.h, p2.min)
  if (asUtc2 - ms !== offset) ms = guess - (asUtc2 - ms)
  return ms
}

export const msToDate = (ms: number) => { const p = zonedParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
export const msToHM = (ms: number) => { const p = zonedParts(ms); return `${pad(p.h)}:${pad(p.min)}` }

const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const fromUTC = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }

export const addDays = (s: string, n: number) => fromUTC(toUTC(s) + n * 86400000)
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000)
export const dow = (s: string) => new Date(toUTC(s)).getUTCDay()
export const isValidDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUTC(s)) && fromUTC(toUTC(s)) === s
export const isValidTime = (s?: string | null) => !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

export function addMonths(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`
}
export const startOfMonth = (s: string) => s.slice(0, 8) + '01'
export const endOfMonth = (s: string) => addDays(addMonths(startOfMonth(s), 1), -1)
export function startOfWeek(s: string, weekStart = 0) {
  const delta = (dow(s) - weekStart + 7) % 7
  return addDays(s, -delta)
}
export function range(a: string, b: string) {
  const out: string[] = []
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d)
  return out
}

export const hmToMin = (t?: string | null) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const minToHM = (n: number) => { n = Math.max(0, Math.min(24 * 60 - 1, Math.round(n))); return `${pad(Math.floor(n / 60))}:${pad(n % 60)}` }

// ---- formatting (language-aware) ----
let LANG: 'ar' | 'en' = 'ar'
let HOUR12 = true
let DFMT: 'dmy' | 'ymd' | 'long' = 'long'
export const setFormat = (lang: 'ar' | 'en', timeFormat: '12' | '24', dateFormat: 'dmy' | 'ymd' | 'long' = 'long') => { LANG = lang; HOUR12 = timeFormat === '12'; DFMT = dateFormat }
const numeric = (s: string) => (DFMT === 'ymd' ? s : `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`)
const loc = () => (LANG === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')
const asDate = (s: string) => new Date(toUTC(s) + 12 * 3600000)

export const fmtDay = (s: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', ...opts }).format(asDate(s))
export const fmtLong = (s: string) => fmtDay(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtMed = (s: string) => (DFMT === 'long' ? fmtDay(s, { weekday: 'short', day: 'numeric', month: 'short' }) : `${fmtDay(s, { weekday: 'short' })} ${numeric(s)}`)
export const fmtShort = (s: string) => (DFMT === 'long' ? fmtDay(s, { day: 'numeric', month: 'short' }) : DFMT === 'ymd' ? s : `${s.slice(8)}/${s.slice(5, 7)}`)
export const fmtMonth = (s: string) => fmtDay(s, { month: 'long', year: 'numeric' })
export const weekdayName = (s: string, style: 'long' | 'short' | 'narrow' = 'short') => fmtDay(s, { weekday: style })
export const monthShort = (s: string) => fmtDay(s, { month: 'short' })

export function fmtTime(t?: string | null) {
  if (!t) return ''
  if (!HOUR12) return t
  const [h, m] = t.split(':').map(Number)
  const am = h < 12
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${pad(m)} ${LANG === 'ar' ? (am ? 'ص' : 'م') : am ? 'AM' : 'PM'}`
}

/** Umm al-Qura Hijri date (approximate for Oman, which follows local moon sighting) */
export function hijri(s: string) {
  try {
    return new Intl.DateTimeFormat(LANG === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    }).format(asDate(s))
  } catch { return '' }
}

export function relDay(s: string, today = todayStr()) {
  const n = diffDays(s, today)
  if (LANG === 'ar') {
    if (n === 0) return 'اليوم'
    if (n === 1) return 'غداً'
    if (n === -1) return 'أمس'
  } else {
    if (n === 0) return 'Today'
    if (n === 1) return 'Tomorrow'
    if (n === -1) return 'Yesterday'
  }
  return fmtMed(s)
}

export const fmtDuration = (min?: number | null) => {
  if (!min) return ''
  const h = Math.floor(min / 60), m = min % 60
  if (LANG === 'ar') return h ? (m ? `${h}س ${m}د` : `${h}س`) : `${m}د`
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
