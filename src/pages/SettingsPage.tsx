import {
  Bell, BellRing, Cloud, Database, Download, Globe, KeyRound, LogOut, Palette, Palmtree, RefreshCw, Smartphone, Trash2, Upload, FolderKanban,
  ShieldCheck, Info, Send,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app-context'
import { EVENT_TYPES, typeColor } from '../components/EventEditor'
import { confirmDialog, FileIcon, Seg, Switch, toast } from '../components/ui'
import { TABLES, db, updateSettings } from '../lib/db'
import { addDays, fmtLong, todayStr } from '../lib/dates'
import { EVENT_TYPE_LABEL, L, REMINDER_OPTIONS } from '../lib/i18n'
import { exportICS, exportJSON, exportTasksCSV, importJSON } from '../lib/io'
import {
  disablePush, enablePush, isIOS, isStandalone, permission, pushState, pushSubCount, refreshSchedule, requestPermission, testLocalNotification, type PushState,
} from '../lib/notify'
import { clearDemo, hasDemo, seedDemo } from '../lib/seed'
import {
  backendConfigured, changePassword, errCode, getSyncInfo, getToken, login, logout, onSync, queueTestPush, resetLocal, serverHasData, serverStatus, setupPassword, syncNow, wipeRemote,
} from '../lib/sync'
import type { Settings } from '../lib/types'

type Tab = 'general' | 'appearance' | 'notify' | 'sync' | 'calendar' | 'data'

export function SettingsPage() {
  const { settings: s, params, go } = useApp()
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'general')
  const set = (c: Partial<Settings>) => updateSettings(c)
  const TABS: [Tab, ReactNode, string][] = [
    ['general', <Globe size={15} />, L('عام', 'General')], ['appearance', <Palette size={15} />, L('المظهر', 'Appearance')],
    ['notify', <Bell size={15} />, L('التنبيهات', 'Notifications')], ['sync', <Cloud size={15} />, L('المزامنة', 'Sync')],
    ['calendar', <Palmtree size={15} />, L('التقويم والإجازات', 'Calendar & leave')], ['data', <Database size={15} />, L('البيانات والخصوصية', 'Data & privacy')],
  ]
  return (
    <div className="stack view-enter">
      <div className="set-nav" role="tablist">
        {TABS.map(([k, ic, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`fchip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{ic}{l}</button>)}
        <button className="fchip" onClick={() => go('categories')}><FolderKanban size={15} />{L('التصنيفات والمشاريع', 'Categories & projects')}</button>
      </div>
      {tab === 'general' && <General s={s} set={set} />}
      {tab === 'appearance' && <Appearance s={s} set={set} />}
      {tab === 'notify' && <Notify s={s} set={set} />}
      {tab === 'sync' && <Sync />}
      {tab === 'calendar' && <CalLeave s={s} set={set} />}
      {tab === 'data' && <Data />}
    </div>
  )
}

const Row = ({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) => (
  <div className="set-row"><div className="grow" style={{ minWidth: 180 }}><b>{title}</b>{hint && <span>{hint}</span>}</div><div className="row wrap">{children}</div></div>
)
const Card = ({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) => (
  <section className="card"><div className="card-h"><h2>{icon}{title}</h2></div>{children}</section>
)
const DAYS = () => [L('الأحد', 'Sun'), L('الإثنين', 'Mon'), L('الثلاثاء', 'Tue'), L('الأربعاء', 'Wed'), L('الخميس', 'Thu'), L('الجمعة', 'Fri'), L('السبت', 'Sat')]

function General({ s, set }: { s: Settings; set: (c: Partial<Settings>) => void }) {
  const [name, setName] = useState(s.appName)
  const [motto, setMotto] = useState(s.motivation)
  return (
    <>
      <Card title={L('عام', 'General')} icon={<Globe size={18} />}>
        <Row title={L('اسم التطبيق', 'App name')}><input className="input" style={{ width: 220 }} value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && set({ appName: name.trim() })} /></Row>
        <Row title={L('لغة الواجهة', 'Interface language')}><Seg label="lang" value={s.lang} onChange={v => set({ lang: v })} options={[{ v: 'ar', l: 'العربية' }, { v: 'en', l: 'English' }]} /></Row>
        <Row title={L('رسالة تحفيزية', 'Motivational message')} hint={L('تظهر في أعلى صفحة اليوم', 'Shown at the top of Today')}><input className="input" style={{ width: 'min(420px, 100%)' }} value={motto} onChange={e => setMotto(e.target.value)} onBlur={() => set({ motivation: motto.trim() })} /></Row>
        <Row title={L('التاريخ الهجري', 'Hijri date')} hint={L('تقويم أم القرى — تقريبي، وقد يختلف يوماً عن الإعلان الرسمي في عُمان', 'Umm al-Qura — approximate; may differ by a day from Oman’s official calendar')}><Switch label="hijri" checked={s.showHijri} onChange={v => set({ showHijri: v })} /></Row>
        <Row title={L('صيغة الوقت', 'Time format')}><Seg label="time" value={s.timeFormat} onChange={v => set({ timeFormat: v })} options={[{ v: '12', l: L('12 ساعة', '12-hour') }, { v: '24', l: L('24 ساعة', '24-hour') }]} /></Row>
        <Row title={L('صيغة التاريخ', 'Date format')} hint={fmtLong(todayStr())}><Seg label="date" value={s.dateFormat} onChange={v => set({ dateFormat: v })} options={[{ v: 'long', l: L('طويلة', 'Long') }, { v: 'dmy', l: 'DD/MM' }, { v: 'ymd', l: 'YYYY-MM-DD' }]} /></Row>
        <Row title={L('المنطقة الزمنية', 'Time zone')}>
          <select className="input" style={{ width: 230 }} value={s.timeZone} onChange={e => set({ timeZone: e.target.value })}>
            {['Asia/Muscat', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Kuwait', 'Europe/London', 'UTC'].map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </Row>
      </Card>
      <Card title={L('أيام وساعات العمل', 'Work days & hours')}>
        <Row title={L('أول يوم في الأسبوع', 'First day of week')}><select className="input" style={{ width: 150 }} value={s.weekStart} onChange={e => set({ weekStart: +e.target.value })}>{DAYS().map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Row>
        <Row title={L('أيام العمل', 'Workdays')} hint={L('الافتراضي في عُمان: الأحد – الخميس', 'Oman default: Sunday – Thursday')}>
          {DAYS().map((d, i) => { const on = s.workdays.includes(i); return <button key={i} className={`fchip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ workdays: on ? s.workdays.filter(x => x !== i) : [...s.workdays, i].sort() })}>{d}</button> })}
        </Row>
        <Row title={L('ساعات الدوام', 'Working hours')}><input className="input" type="time" style={{ width: 130 }} value={s.workStart} onChange={e => set({ workStart: e.target.value })} /><span>–</span><input className="input" type="time" style={{ width: 130 }} value={s.workEnd} onChange={e => set({ workEnd: e.target.value })} /></Row>
        <Row title={L('نطاق الجدول اليومي', 'Daily timeline range')}>
          <select className="input" style={{ width: 100 }} value={s.dayStart} onChange={e => set({ dayStart: Math.min(+e.target.value, s.dayEnd - 1) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          <span>–</span>
          <select className="input" style={{ width: 100 }} value={s.dayEnd} onChange={e => set({ dayEnd: Math.max(+e.target.value, s.dayStart + 1) })}>{Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
        </Row>
        <Row title={L('فاصل الفترات الزمنية', 'Time-slot interval')}><Seg label="slot" value={s.slotMin} onChange={v => set({ slotMin: v })} options={[15, 30, 60].map(v => ({ v, l: L(`${v} د`, `${v} min`) }))} /></Row>
      </Card>
      <InstallCard />
    </>
  )
}

function InstallCard() {
  const [prompt, setPrompt] = useState<any>(null)
  useEffect(() => {
    const h = (e: any) => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  return (
    <Card title={L('تثبيت التطبيق', 'Install the app')} icon={<Smartphone size={18} />}>
      {isStandalone() ? <div className="banner info small"><ShieldCheck size={16} />{L('التطبيق مثبّت ويعمل كتطبيق مستقل على هذا الجهاز.', 'Installed and running as a standalone app on this device.')}</div> : <>
        {prompt && <button className="btn primary" onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null) }}><Download size={16} />{L('تثبيت الآن', 'Install now')}</button>}
        <ul className="small" style={{ paddingInlineStart: 18, margin: '10px 0 0' }}>
          <li><b>Android — Chrome:</b> {L('القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'Menu ⋮ → “Install app” / “Add to Home screen”.')}</li>
          <li><b>Samsung Internet:</b> {L('القائمة ☰ ← «إضافة صفحة إلى» ← «الشاشة الرئيسية».', 'Menu ☰ → “Add page to” → “Home screen”.')}</li>
          <li><b>Huawei (Petal / Huawei Browser):</b> {L('القائمة ← «إضافة إلى الشاشة الرئيسية». إن لم يظهر الخيار استخدم Chrome أو Edge إن كانا متاحين.', 'Menu → “Add to home screen”. If missing, use Chrome or Edge where available.')}</li>
          <li><b>iPad / iPhone — Safari:</b> {L('زر المشاركة ⬆ ← «إضافة إلى الشاشة الرئيسية». يلزم التثبيت لتعمل الإشعارات (iPadOS 16.4 أو أحدث).', 'Share ⬆ → “Add to Home Screen”. Installing is required for notifications (iPadOS 16.4+).')}</li>
          <li><b>Windows / macOS — Chrome / Edge:</b> {L('أيقونة التثبيت في شريط العنوان.', 'Install icon in the address bar.')}</li>
        </ul>
      </>}
    </Card>
  )
}

function Appearance({ s, set }: { s: Settings; set: (c: Partial<Settings>) => void }) {
  const accents = ['#1F7A6D', '#2F5F98', '#6D3BB0', '#B4561B', '#AD3B7A', '#102A43']
  return (
    <Card title={L('المظهر', 'Appearance')} icon={<Palette size={18} />}>
      <Row title={L('السمة', 'Theme')}><Seg label="theme" value={s.theme} onChange={v => set({ theme: v })} options={[{ v: 'light', l: L('فاتح', 'Light') }, { v: 'dark', l: L('داكن', 'Dark') }, { v: 'system', l: L('حسب النظام', 'System') }]} /></Row>
      <Row title={L('لون التمييز', 'Accent color')}><div className="swatches">{accents.map(c => <button key={c} className={`swatch${s.accent === c ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={c} aria-pressed={s.accent === c} />)}<input type="color" value={s.accent} onChange={e => set({ accent: e.target.value })} aria-label={L('لون مخصص', 'Custom')} style={{ width: 34, height: 34, border: 0, background: 'none' }} /></div></Row>
      <Row title={L('الكثافة', 'Density')}><Seg label="density" value={s.density} onChange={v => set({ density: v })} options={[{ v: 'comfortable', l: L('مريحة', 'Comfortable') }, { v: 'compact', l: L('مضغوطة', 'Compact') }]} /></Row>
      <Row title={L('تقليل الحركة', 'Reduced motion')}><Seg label="motion" value={s.reducedMotion} onChange={v => set({ reducedMotion: v })} options={[{ v: 'system', l: L('حسب النظام', 'System') }, { v: 'on', l: L('تقليل', 'Reduce') }, { v: 'off', l: L('كامل', 'Full') }]} /></Row>
      <div className="set-row" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><b>{L('ألوان أنواع التقويم', 'Calendar type colors')}</b><span>{L('ألوان التصنيفات تُعدّل من صفحة التصنيفات', 'Category colors are edited on the Categories page')}</span></div>
        <div className="grid g2" style={{ gap: 6 }}>
          {[...EVENT_TYPES, 'leave', 'holiday', 'task'].map(t => (
            <label key={t} className="row small"><input type="color" value={typeColor(t, s.typeColors)} onChange={e => set({ typeColors: { ...s.typeColors, [t]: e.target.value } })} style={{ width: 28, height: 28, border: 0, background: 'none' }} />{(EVENT_TYPE_LABEL() as any)[t]}</label>
          ))}
          <button className="btn ghost sm" onClick={() => set({ typeColors: {} })}>{L('الألوان الافتراضية', 'Reset colors')}</button>
        </div>
      </div>
    </Card>
  )
}

function Notify({ s, set }: { s: Settings; set: (c: Partial<Settings>) => void }) {
  const [perm, setPerm] = useState(permission())
  const [push, setPush] = useState<PushState | '...'>('...')
  const [subs, setSubs] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => { setPerm(permission()); const p = await pushState(); setPush(p); if (p === 'on' || p === 'off') pushSubCount().then(setSubs).catch(() => {}) }
  useEffect(() => { refresh() }, [])
  const permLabel = { granted: [L('مسموح', 'Allowed'), 'teal'], denied: [L('مرفوض', 'Blocked'), 'rose'], default: [L('لم يُطلب بعد', 'Not asked yet'), 'saffron'], unsupported: [L('غير مدعوم في هذا المتصفح', 'Not supported in this browser'), 'rose'] }[perm]
  const pushLabel: Record<string, [string, string]> = {
    on: [L('مفعّلة على هذا الجهاز', 'On for this device'), 'teal'], off: [L('غير مفعّلة', 'Off'), 'saffron'],
    'no-backend': [L('الخادم غير مُعدّ', 'Server not configured'), 'rose'], 'no-login': [L('سجّل الدخول للمزامنة أولاً', 'Sign in to sync first'), 'saffron'],
    unsupported: [L('غير مدعومة في هذا المتصفح', 'Not supported in this browser'), 'rose'], 'needs-install': [L('ثبّت التطبيق على الشاشة الرئيسية أولاً', 'Install to Home Screen first'), 'saffron'],
    denied: [L('الإذن مرفوض', 'Permission blocked'), 'rose'], '...': ['…', ''],
  }
  const askPermission = async () => {
    const p = await requestPermission()
    setPerm(p)
    toast(p === 'granted' ? L('تم السماح بالإشعارات', 'Notifications allowed') : L('لم يُمنح الإذن', 'Permission not granted'), { err: p !== 'granted' })
  }
  const turnOnPush = async () => {
    setBusy(true)
    try { await enablePush(); toast(L('تم تفعيل الإشعارات الفورية لهذا الجهاز', 'Push enabled for this device')) }
    catch (e: any) { toast(e?.message === 'denied' ? L('الإذن مرفوض من إعدادات المتصفح', 'Permission blocked in browser settings') : L('تعذّر التفعيل: ', 'Could not enable: ') + String(e?.message || e), { err: true }) }
    setBusy(false); refresh()
  }
  const testPush = async () => {
    setBusy(true)
    try {
      await queueTestPush(L('اختبار الإشعار الفوري', 'Push test'), L('وصل هذا الإشعار من الخادم ✓', 'This came from the server ✓'))
      const r = await fetch('/api/dispatch', { method: 'POST' })
      toast(r.ok ? L('أُرسل — قد يستغرق وصوله ثواني', 'Sent — it may take a few seconds') : L('سيُرسل خلال دقيقة', 'Will be sent within a minute'))
    } catch (e) { toast(L('تعذّر الإرسال: ', 'Failed: ') + errCode(e), { err: true }) }
    setBusy(false)
  }
  return (
    <>
      <Card title={L('حالة الإشعارات', 'Notification status')} icon={<BellRing size={18} />}>
        <div className="banner info small" style={{ marginBottom: 10 }}><Info size={16} style={{ flexShrink: 0 }} />
          <span>{L('نحتاج إذن الإشعارات لتنبيهك بالمواعيد والمهام في وقتها. يوجد نوعان: تنبيهات محلية تعمل والتطبيق مفتوح، وإشعارات فورية من الخادم تصل والتطبيق مغلق (تتطلب تسجيل الدخول للمزامنة).', 'We need notification permission to alert you on time. There are two kinds: local reminders while the app is open, and server push that arrives while it is closed (requires signing in to sync).')}</span></div>
        <Row title={L('إذن المتصفح', 'Browser permission')} hint={perm === 'denied' ? L('فعّله من إعدادات الموقع في المتصفح (رمز القفل بجوار العنوان) ثم أعد تحميل الصفحة.', 'Enable it in the site settings (lock icon by the address), then reload.') : undefined}>
          <span className={`pill ${permLabel[1]}`}>{permLabel[0]}</span>
          {perm === 'default' && <button className="btn primary sm" onClick={askPermission}>{L('السماح بالإشعارات', 'Allow notifications')}</button>}
        </Row>
        <Row title={L('الإشعارات الفورية (والتطبيق مغلق)', 'Push (while app is closed)')} hint={subs != null ? L(`أجهزة مشتركة: ${subs}`, `Subscribed devices: ${subs}`) : undefined}>
          <span className={`pill ${pushLabel[push][1]}`}>{pushLabel[push][0]}</span>
          {push === 'off' && <button className="btn primary sm" disabled={busy} onClick={turnOnPush}>{L('تفعيل لهذا الجهاز', 'Enable on this device')}</button>}
          {push === 'on' && <><button className="btn sm" disabled={busy} onClick={testPush}><Send size={14} />{L('اختبار', 'Test')}</button><button className="btn ghost sm" onClick={async () => { await disablePush(); refresh() }}>{L('إيقاف', 'Turn off')}</button></>}
        </Row>
        <Row title={L('اختبار التنبيه المحلي', 'Test local notification')}><button className="btn sm" onClick={async () => { await testLocalNotification(); toast(perm === 'granted' ? L('أُرسل إشعار اختبار', 'Test notification sent') : L('ظهر داخل التطبيق فقط (الإذن غير ممنوح)', 'Shown in-app only (no permission)')) }}><Bell size={14} />{L('اختبار', 'Test')}</button></Row>
        {(isIOS() && !isStandalone()) && <div className="banner warn small"><Smartphone size={16} />{L('على iPad/iPhone: أضف التطبيق إلى الشاشة الرئيسية من Safari ثم افتحه من الأيقونة لتتمكن من تفعيل الإشعارات.', 'On iPad/iPhone: add to Home Screen from Safari, then open from the icon to enable notifications.')}</div>}
        <p className="tiny muted" style={{ marginBottom: 0 }}>{L('ملاحظة صريحة: وصول الإشعار في الخلفية يعتمد على المتصفح والنظام. Chrome على أندرويد وSafari على iPad (مثبّت) يدعمان ذلك. قد تؤخر أنظمة توفير الطاقة في سامسونج وهواوي الإشعارات أو تمنعها — استثنِ المتصفح من «تحسين البطارية». بعض متصفحات هواوي لا تدعم Web Push إطلاقاً.', 'Honest note: background delivery depends on browser and OS. Chrome on Android and Safari on an installed iPad app support it. Samsung and Huawei battery savers may delay or block notifications — exclude the browser from battery optimisation. Some Huawei browsers do not support Web Push at all.')}</p>
      </Card>
      <Card title={L('تفضيلات التذكير', 'Reminder preferences')} icon={<Bell size={18} />}>
        <Row title={L('تفعيل التذكيرات', 'Enable reminders')}><Switch label="notify" checked={s.notifyEnabled} onChange={v => { set({ notifyEnabled: v }); setTimeout(refreshSchedule, 300) }} /></Row>
        <Row title={L('التذكير الافتراضي للعناصر الجديدة', 'Default reminder for new items')}>
          {REMINDER_OPTIONS().map(o => { const on = s.defaultReminders.includes(o.v); return <button key={o.v} className={`fchip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ defaultReminders: on ? s.defaultReminders.filter(x => x !== o.v) : [...s.defaultReminders, o.v] })}>{o.l}</button> })}
        </Row>
        <Row title={L('وقت تذكير المهام بلا وقت', 'Reminder time for untimed tasks')}><input className="input" type="time" style={{ width: 130 }} value={s.defaultReminderTime} onChange={e => set({ defaultReminderTime: e.target.value })} /></Row>
        <Row title={L('ساعات الهدوء', 'Quiet hours')} hint={L('تُؤجَّل التنبيهات خلالها إلى نهايتها', 'Reminders during this window are delivered when it ends')}>
          <Switch label="quiet" checked={s.quietEnabled} onChange={v => set({ quietEnabled: v })} />
          <input className="input" type="time" style={{ width: 120 }} value={s.quietStart} disabled={!s.quietEnabled} onChange={e => set({ quietStart: e.target.value })} /><span>–</span>
          <input className="input" type="time" style={{ width: 120 }} value={s.quietEnd} disabled={!s.quietEnabled} onChange={e => set({ quietEnd: e.target.value })} />
        </Row>
        <Row title={L('تذكير التخطيط الصباحي', 'Morning planning reminder')}><Switch label="m" checked={s.morningEnabled} onChange={v => set({ morningEnabled: v })} /><input className="input" type="time" style={{ width: 120 }} value={s.morningTime} disabled={!s.morningEnabled} onChange={e => set({ morningTime: e.target.value })} /></Row>
        <Row title={L('تذكير مراجعة نهاية اليوم', 'Evening review reminder')}><Switch label="e" checked={s.eveningEnabled} onChange={v => set({ eveningEnabled: v })} /><input className="input" type="time" style={{ width: 120 }} value={s.eveningTime} disabled={!s.eveningEnabled} onChange={e => set({ eveningTime: e.target.value })} /></Row>
        <Row title={L('تذكير المراجعة الأسبوعية', 'Weekly review reminder')}>
          <Switch label="w" checked={s.weeklyEnabled} onChange={v => set({ weeklyEnabled: v })} />
          <select className="input" style={{ width: 120 }} value={s.weeklyDay} disabled={!s.weeklyEnabled} onChange={e => set({ weeklyDay: +e.target.value })}>{DAYS().map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <input className="input" type="time" style={{ width: 120 }} value={s.weeklyTime} disabled={!s.weeklyEnabled} onChange={e => set({ weeklyTime: e.target.value })} />
        </Row>
        <Row title={L('فئات التنبيهات', 'Notification categories')}>
          {([['tasks', L('المهام', 'Tasks')], ['events', L('المواعيد', 'Events')], ['planning', L('التخطيط والمراجعة', 'Planning & review')], ['leave', L('الإجازات والعطل', 'Leave & holidays')]] as const).map(([k, l]) => (
            <label key={k} className="check small"><input type="checkbox" checked={s.notifyCats[k]} onChange={e => set({ notifyCats: { ...s.notifyCats, [k]: e.target.checked } })} />{l}</label>
          ))}
        </Row>
      </Card>
    </>
  )
}

function Sync() {
  const [info, setInfo] = useState(getSyncInfo())
  useEffect(() => onSync(setInfo), [])
  const [has, setHas] = useState<boolean | null>(null)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const logged = !!getToken()
  useEffect(() => { if (!logged && backendConfigured) serverStatus().then(r => setHas(r.has_password)).catch(e => setErr(errCode(e))) }, [logged])
  const msg = (c: string) => ({ DF_BADPASS: L('كلمة المرور غير صحيحة', 'Wrong password'), DF_SHORT: L('كلمة المرور قصيرة (6 أحرف على الأقل)', 'Password too short (min 6)'), DF_EXISTS: L('كلمة المرور معيّنة مسبقاً — سجّل الدخول', 'Password already set — sign in'), NETWORK: L('لا يوجد اتصال بالإنترنت', 'No internet connection') } as any)[c] || c

  const afterLogin = async () => {
    const pristine = !!localStorage.getItem('df-pristine')
    const remote = await serverHasData()
    if (remote && pristine) await resetLocal()
    else if (remote && !pristine) {
      const c = await confirmDialog({ title: L('يوجد بيانات في السحابة', 'Cloud already has data'), body: L('هل تريد دمج بيانات هذا الجهاز مع السحابة، أم استبدالها ببيانات السحابة فقط؟', 'Merge this device’s data with the cloud, or replace it with the cloud data only?'), ok: '', choices: [{ v: 'merge', l: L('دمج', 'Merge') }, { v: 'replace', l: L('استبدال ببيانات السحابة', 'Use cloud data only'), danger: true }] })
      if (c === 'replace') await resetLocal()
    }
    localStorage.removeItem('df-pristine')
    await syncNow()
    toast(L('تم الربط والمزامنة', 'Connected and synced'))
  }
  const doSetup = async () => {
    setErr('')
    if (pass.length < 6) return setErr(msg('DF_SHORT'))
    if (pass !== pass2) return setErr(L('كلمتا المرور غير متطابقتين', 'Passwords do not match'))
    setBusy(true)
    try { await setupPassword(pass); await afterLogin() } catch (e) { setErr(msg(errCode(e))) }
    setBusy(false); setPass(''); setPass2('')
  }
  const doLogin = async () => {
    setErr(''); setBusy(true)
    try { await login(pass); await afterLogin() } catch (e) { setErr(msg(errCode(e))) }
    setBusy(false); setPass('')
  }
  const stateText: Record<string, string> = { local: L('غير متصل', 'Not connected'), syncing: L('جارٍ المزامنة', 'Syncing'), synced: L('متزامن', 'Synced'), offline: L('دون اتصال', 'Offline'), error: L('خطأ', 'Error'), auth: L('انتهت الجلسة', 'Signed out') }

  if (!backendConfigured) return <Card title={L('المزامنة', 'Sync')} icon={<Cloud size={18} />}><div className="banner warn">{L('الخادم غير مُعدّ في هذا الإصدار — البيانات محفوظة على هذا الجهاز فقط. صدّر نسخة احتياطية بانتظام.', 'No server configured in this build — data lives on this device only. Export backups regularly.')}</div></Card>
  return (
    <Card title={L('المزامنة بين الأجهزة', 'Sync across devices')} icon={<Cloud size={18} />}>
      <p className="small muted" style={{ marginTop: 0 }}>{L('تُحفظ بياناتك أولاً على هذا الجهاز وتعمل دون إنترنت، ثم تُزامَن مع قاعدة بيانات خاصة محمية بكلمة مرور عند الاتصال. يسجّل كل جهاز الدخول مرة واحدة.', 'Data is saved on this device first and works offline, then syncs to a private password-protected database when online. Each device signs in once.')}</p>
      {err && <div className="banner err small" role="alert">{err}</div>}
      {logged ? <>
        <Row title={L('الحالة', 'Status')} hint={info.lastSync ? L('آخر مزامنة: ', 'Last sync: ') + new Date(info.lastSync).toLocaleString() : undefined}>
          <span className={`pill ${info.state === 'synced' ? 'teal' : info.state === 'error' || info.state === 'auth' ? 'rose' : 'saffron'}`}>{stateText[info.state]}</span>
          <button className="btn sm" onClick={() => syncNow()}><RefreshCw size={14} />{L('مزامنة الآن', 'Sync now')}</button>
        </Row>
        <ChangePass />
        <Row title={L('تسجيل الخروج من هذا الجهاز', 'Sign out of this device')} hint={L('تبقى البيانات على الجهاز، وتتوقف المزامنة والإشعارات الفورية له.', 'Data stays on the device; sync and push stop for it.')}>
          <button className="btn danger sm" onClick={async () => { if (await confirmDialog({ title: L('تسجيل الخروج؟', 'Sign out?'), ok: L('تسجيل الخروج', 'Sign out'), danger: true })) { await disablePush().catch(() => {}); await logout() } }}><LogOut size={14} />{L('تسجيل الخروج', 'Sign out')}</button>
        </Row>
      </> : has === null ? <p className="muted small">{L('جارٍ التحقق…', 'Checking…')}</p> : has ? (
        <div className="col">
          <label className="field"><span>{L('كلمة المرور', 'Password')}</span><input className="input" type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} style={{ maxWidth: 320 }} /></label>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !pass} onClick={doLogin}><KeyRound size={16} />{L('تسجيل الدخول والمزامنة', 'Sign in & sync')}</button>
        </div>
      ) : (
        <div className="col">
          <div className="banner info small">{L('أول مرة: اختر كلمة مرور خاصة بك لحماية بياناتك في السحابة. ستستخدمها لربط أجهزتك الأخرى.', 'First time: choose a password to protect your cloud data. You’ll use it to link your other devices.')}</div>
          <label className="field"><span>{L('كلمة مرور جديدة', 'New password')}</span><input className="input" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} style={{ maxWidth: 320 }} /></label>
          <label className="field"><span>{L('تأكيد كلمة المرور', 'Confirm password')}</span><input className="input" type="password" autoComplete="new-password" value={pass2} onChange={e => setPass2(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSetup()} style={{ maxWidth: 320 }} /></label>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={doSetup}><ShieldCheck size={16} />{L('إنشاء والمزامنة', 'Create & sync')}</button>
        </div>
      )}
    </Card>
  )
}

function ChangePass() {
  const [open, setOpen] = useState(false)
  const [o, setO] = useState(''), [n, setN] = useState('')
  if (!open) return <Row title={L('كلمة المرور', 'Password')}><button className="btn sm" onClick={() => setOpen(true)}><KeyRound size={14} />{L('تغيير', 'Change')}</button></Row>
  return (
    <div className="set-row">
      <input className="input" type="password" placeholder={L('الحالية', 'Current')} value={o} onChange={e => setO(e.target.value)} style={{ maxWidth: 200 }} autoComplete="current-password" />
      <input className="input" type="password" placeholder={L('الجديدة', 'New')} value={n} onChange={e => setN(e.target.value)} style={{ maxWidth: 200 }} autoComplete="new-password" />
      <button className="btn primary sm" onClick={async () => { try { await changePassword(o, n); toast(L('تم تغيير كلمة المرور', 'Password changed')); setOpen(false) } catch (e) { toast(errCode(e) === 'DF_BADPASS' ? L('كلمة المرور الحالية خاطئة', 'Current password is wrong') : errCode(e) === 'DF_SHORT' ? L('6 أحرف على الأقل', 'Min 6 characters') : errCode(e), { err: true }) } }}>{L('حفظ', 'Save')}</button>
      <button className="btn sm" onClick={() => setOpen(false)}>{L('إلغاء', 'Cancel')}</button>
    </div>
  )
}

function CalLeave({ s, set }: { s: Settings; set: (c: Partial<Settings>) => void }) {
  const { go } = useApp()
  return (
    <>
      <Card title={L('الإجازات', 'Leave')} icon={<Palmtree size={18} />}>
        <Row title={L('رصيد الإجازة الاعتيادية السنوي (أيام)', 'Annual leave allowance (days)')} hint={L('اتركه فارغاً لإخفاء الرصيد', 'Leave empty to hide the balance')}><input className="input" type="number" min={0} style={{ width: 110 }} value={s.leaveAllowance ?? ''} onChange={e => set({ leaveAllowance: e.target.value === '' ? null : Math.max(0, +e.target.value) })} /></Row>
        <Row title={L('أيام مرحّلة من العام السابق', 'Carried-over days')}><input className="input" type="number" min={0} style={{ width: 110 }} value={s.leaveCarryOver} onChange={e => set({ leaveCarryOver: Math.max(0, +e.target.value || 0) })} /></Row>
        <Row title={L('بداية سنة الإجازات', 'Leave year starts')} hint="MM-DD"><input className="input ltr" style={{ width: 110, display: 'block' }} value={s.leaveYearStart} onChange={e => /^\d{2}-\d{2}$/.test(e.target.value) && set({ leaveYearStart: e.target.value })} /></Row>
        <Row title={L('احتساب عطلة نهاية الأسبوع ضمن أيام الإجازة', 'Count weekends as leave days')}><Switch label="w" checked={s.leaveCountWeekends} onChange={v => set({ leaveCountWeekends: v })} /></Row>
        <Row title={L('احتساب العطل الرسمية ضمن أيام الإجازة', 'Count public holidays as leave days')}><Switch label="h" checked={s.leaveCountHolidays} onChange={v => set({ leaveCountHolidays: v })} /></Row>
        <p className="tiny muted" style={{ marginBottom: 0 }}>{L('تختلف قواعد الاحتساب حسب جهة العمل ونوع الإجازة — اضبطها وفق اللائحة المطبقة عليك.', 'Counting rules differ by employer and leave type — set them to match your applicable policy.')}</p>
      </Card>
      <Card title={L('العطل الرسمية', 'Official holidays')}>
        <Row title={L('بيانات العطل ومصادرها وحالة التحقق', 'Holiday data, sources and verification')}><button className="btn sm" onClick={() => go('leave')}>{L('فتح', 'Open')}</button></Row>
      </Card>
      <Card title={L('أسئلة المراجعة اليومية', 'Daily review questions')}>
        {s.reviewQuestions.map((q, i) => <input key={i} className="input" style={{ marginBottom: 8 }} defaultValue={q} onBlur={e => { const a = [...s.reviewQuestions]; a[i] = e.target.value.trim() || q; set({ reviewQuestions: a }) }} aria-label={L(`السؤال ${i + 1}`, `Question ${i + 1}`)} />)}
      </Card>
    </>
  )
}

function Data() {
  const file = useRef<HTMLInputElement>(null)
  const [demo, setDemo] = useState<boolean | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const last = Number(localStorage.getItem('df-last-backup')) || null
  useEffect(() => {
    hasDemo().then(setDemo)
    Promise.all(TABLES.map(async t => [t, await (db as any)[t].filter((r: any) => !r.deleted).count()])).then(x => setCounts(Object.fromEntries(x)))
  }, [])
  const doImport = async (f: File) => {
    const mode = await confirmDialog({ title: L('استيراد نسخة احتياطية', 'Import backup'), body: L('الدمج يضيف السجلات ويحدّث الأقدم دون تكرار. الاستبدال يحذف البيانات الحالية أولاً.', 'Merge adds records and updates older ones without duplicates. Replace removes current data first.'), ok: '', choices: [{ v: 'merge', l: L('دمج', 'Merge') }, { v: 'replace', l: L('استبدال', 'Replace'), danger: true }] })
    if (!mode) return
    try {
      const r = await importJSON(await f.text(), mode as any)
      toast(L(`تم: جديد ${r.added} · محدّث ${r.updated} · متجاهل ${r.skipped}`, `Done: added ${r.added} · updated ${r.updated} · skipped ${r.skipped}`), { ms: 5000 })
    } catch (e: any) {
      toast({ INVALID_JSON: L('الملف ليس JSON صالحاً', 'Not valid JSON'), NOT_DAYFLOW: L('هذا ليس ملف نسخة DayFlow', 'Not a DayFlow backup'), NEWER_SCHEMA: L('النسخة من إصدار أحدث — حدّث التطبيق', 'Backup is from a newer version — update the app') }[e.message as string] || String(e), { err: true })
    }
  }
  const deleteAll = async () => {
    const word = L('حذف', 'DELETE')
    const v = await confirmDialog({ title: L('حذف كل البيانات الشخصية', 'Delete all personal data'), body: L('سيُحذف كل شيء من هذا الجهاز' + (getToken() ? ' ومن السحابة' : '') + '. لا يمكن التراجع. صدّر نسخة احتياطية أولاً إن احتجت.', 'Everything will be removed from this device' + (getToken() ? ' and the cloud' : '') + '. This cannot be undone. Export a backup first if needed.'), ok: L('حذف نهائي', 'Delete permanently'), danger: true, input: { label: L(`اكتب «${word}» للتأكيد`, `Type “${word}” to confirm`), match: word } })
    if (!v) return
    if (getToken()) {
      const p = await confirmDialog({ title: L('تأكيد بكلمة المرور', 'Confirm with password'), ok: L('حذف من السحابة', 'Delete from cloud'), danger: true, input: { label: L('كلمة مرور المزامنة', 'Sync password'), type: 'password' } })
      if (!p) return
      try { await wipeRemote(p) } catch (e) { return toast(errCode(e) === 'DF_BADPASS' ? L('كلمة المرور خاطئة', 'Wrong password') : errCode(e), { err: true }) }
      await logout()
    }
    await Promise.all(TABLES.map(t => (db as any)[t].clear()))
    for (const k of Object.keys(localStorage)) if (k.startsWith('df-') && k !== 'df-seeded') localStorage.removeItem(k)
    toast(L('حُذفت كل البيانات', 'All data deleted'))
    setTimeout(() => location.reload(), 900)
  }
  return (
    <>
      <Card title={L('النسخ الاحتياطي والتصدير', 'Backup & export')} icon={<Download size={18} />}>
        {!getToken() && <div className="banner warn small" style={{ marginBottom: 8 }}>{L('بياناتك محفوظة على هذا الجهاز فقط حالياً. صدّر نسخة احتياطية قبل تغيير الجهاز أو مسح بيانات المتصفح، أو فعّل المزامنة.', 'Your data is on this device only right now. Export a backup before changing devices or clearing browser data — or turn on sync.')}</div>}
        <Row title={L('نسخة احتياطية كاملة', 'Full backup')} hint={last ? L('آخر نسخة: ', 'Last backup: ') + new Date(last).toLocaleString() : L('لم تُصدَّر نسخة بعد', 'No backup exported yet')}>
          <button className="btn sm" onClick={exportJSON}><FileIcon kind="json" size={17} />{L('تصدير JSON', 'Export JSON')}</button>
          <button className="btn sm" onClick={() => file.current?.click()}><Upload size={15} />{L('استعادة', 'Restore')}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </Row>
        <Row title={L('تصدير التقويم', 'Export calendar')} hint={L('لاستيراده في Google أو Outlook أو Apple Calendar', 'For Google, Outlook or Apple Calendar')}><button className="btn sm" onClick={exportICS}><FileIcon kind="ics" size={17} />ICS</button></Row>
        <Row title={L('تصدير قائمة المهام', 'Export task list')} hint={L('يفتح في Excel', 'Opens in Excel')}><button className="btn sm" onClick={exportTasksCSV}><FileIcon kind="csv" size={17} />CSV</button></Row>
        <div className="tiny muted" style={{ marginTop: 8 }}>{Object.entries(counts).filter(([k]) => k !== 'meta').map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      </Card>
      <Card title={L('البيانات التجريبية', 'Demo data')}>
        <Row title={demo ? L('توجد بيانات تجريبية معلّمة «تجريبي»', 'Demo records (labelled “Demo”) are present') : L('لا توجد بيانات تجريبية', 'No demo records')} hint={L('العطل الرسمية ليست بيانات تجريبية ولا تُحذف هنا', 'Official holidays are not demo data and are kept')}>
          {demo ? <button className="btn sm danger" onClick={async () => { await clearDemo(); setDemo(false); refreshSchedule(); toast(L('حُذفت البيانات التجريبية', 'Demo data removed')) }}><Trash2 size={14} />{L('حذف التجريبي', 'Clear demo')}</button>
            : <button className="btn sm" onClick={async () => { await seedDemo(); setDemo(true); toast(L('أُضيفت بيانات تجريبية', 'Demo data added')) }}>{L('إضافة بيانات تجريبية', 'Add demo data')}</button>}
        </Row>
      </Card>
      <Card title={L('الخصوصية', 'Privacy')} icon={<ShieldCheck size={18} />}>
        <ul className="small" style={{ paddingInlineStart: 18, marginTop: 0 }}>
          <li>{L('لا تحليلات ولا تتبع ولا خدمات خارجية تستقبل بياناتك.', 'No analytics, tracking, or third-party services receive your data.')}</li>
          <li>{L('عند تفعيل المزامنة تُخزَّن البيانات في قاعدة بيانات خاصة لا يصل إليها إلا من يملك كلمة المرور.', 'With sync on, data is stored in a private database reachable only with your password.')}</li>
          <li>{L('الإشعارات الفورية ترسل عنوان التذكير ونصه فقط عبر خدمة الإشعارات في متصفحك.', 'Push sends only the reminder title and text through your browser’s push service.')}</li>
        </ul>
        <Row title={L('حذف كل البيانات الشخصية', 'Delete all personal data')}><button className="btn sm danger solid" onClick={deleteAll}><Trash2 size={14} />{L('حذف الكل', 'Delete everything')}</button></Row>
      </Card>
    </>
  )
}

export { addDays }
