// App version + manual update check (installed PWAs keep running the cached version until the new one is activated)
import { toast } from '../components/ui'
import { L } from './i18n'

declare const __BUILD__: string
const RAW = typeof __BUILD__ === 'string' ? __BUILD__ : ''
/** Build time, shown in Oman time (e.g. 12/11/2026 11:45) */
export const BUILD = RAW ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(RAW)).replace(',', '') : 'dev'

let reg: ServiceWorkerRegistration | undefined
let apply: ((reload?: boolean) => Promise<void>) | undefined
export function setUpdater(r: ServiceWorkerRegistration | undefined, fn: (reload?: boolean) => Promise<void>) { reg = r; apply = fn }

/** Ask the server for a new version; if one is found, install it and reload */
export async function checkForUpdate(): Promise<'updating' | 'latest' | 'offline'> {
  if (!navigator.onLine) { toast(L('لا يوجد اتصال بالإنترنت', 'You are offline'), { err: true }); return 'offline' }
  if (!reg) { location.reload(); return 'updating' }
  await reg.update().catch(() => {})
  // wait for a found update to finish installing
  for (let i = 0; i < 40 && reg.installing; i++) await new Promise(r => setTimeout(r, 250))
  if (reg.waiting) {
    toast(L('جارٍ تحديث التطبيق…', 'Updating…'))
    await apply?.(true)
    return 'updating'
  }
  toast(L('لديك آخر إصدار', 'You have the latest version'))
  return 'latest'
}
