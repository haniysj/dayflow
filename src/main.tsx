import '@fontsource-variable/cairo'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { toast } from './components/ui'
import { getSettings, onLocalChange } from './lib/db'
import { L, setLang } from './lib/i18n'
import { runMigrations } from './lib/migrate'
import { scheduleSoon, startReminders } from './lib/notify'
import { firstRunSeed, mergeOfficialHolidays } from './lib/seed'
import { afterSync, startSyncLoop } from './lib/sync'
import { setTimeZone } from './lib/dates'

async function boot() {
  try {
    const firstRun = !localStorage.getItem('df-seeded')
    await runMigrations()
    await firstRunSeed()
    if (firstRun) localStorage.setItem('df-pristine', '1')
    await mergeOfficialHolidays()
    const s = await getSettings()
    setLang(s.lang)
    setTimeZone(s.timeZone)
    // ask the browser not to evict local data
    navigator.storage?.persist?.().catch(() => {})
  } catch (e) {
    console.error(e)
    document.getElementById('root')!.innerHTML = `<div style="padding:24px;font-family:Cairo,sans-serif">تعذّر فتح قاعدة البيانات المحلية. قد يكون المتصفح في وضع التصفح الخاص أو أن مساحة التخزين ممتلئة.<br><small>${String(e)}</small></div>`
    return
  }

  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

  startSyncLoop()
  startReminders()
  onLocalChange(scheduleSoon)
  afterSync(scheduleSoon)

  const updateSW = registerSW({
    onNeedRefresh() {
      toast(L('يتوفر إصدار جديد من التطبيق', 'A new version is available'), { ms: 30000, action: { label: L('تحديث', 'Update'), fn: () => updateSW(true) } })
    },
    onOfflineReady() { toast(L('التطبيق جاهز للعمل دون اتصال', 'Ready to work offline')) },
  })
}
boot()
