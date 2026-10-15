import {
  BarChart3, CalendarDays, ChevronsLeft, ChevronsRight, CloudOff, FolderKanban, LayoutGrid, ListTodo, Menu as MenuIcon, Palmtree,
  Plus, RefreshCw, Search, Settings as Cog, Sun, Check, AlertTriangle, X, Bell,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ctx, type AppCtx, type QuickAddDefaults, type View } from './app-context'
import { EventEditor } from './components/EventEditor'
import { QuickAdd } from './components/QuickAdd'
import { TaskEditor } from './components/TaskEditor'
import { BrandMark, ConfirmHost, Modal, Toasts, toast } from './components/ui'
import { setFormat, setTimeZone, todayStr, fmtMed } from './lib/dates'
import { db, getLastSaved, onLocalChange, updateSettings, useSettings } from './lib/db'
import { L, setLang } from './lib/i18n'
import { centerItems, onCenter, setOnFire } from './lib/notify'
import { onSync, getToken, syncNow } from './lib/sync'
import type { CalEvent, Task } from './lib/types'
import { CalendarPage } from './pages/CalendarPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { LeavePage } from './pages/LeavePage'
import { PlanTomorrow } from './pages/PlanTomorrow'
import { ReminderCenter } from './pages/ReminderCenter'
import { ReportsPage } from './pages/ReportsPage'
import { DayReview } from './pages/DayReview'
import { SearchDialog } from './pages/SearchDialog'
import { SettingsPage } from './pages/SettingsPage'
import { TasksPage } from './pages/TasksPage'
import { Today } from './pages/Today'

const NAV: { v: View; icon: any; ar: string; en: string }[] = [
  { v: 'today', icon: Sun, ar: 'اليوم', en: 'Today' },
  { v: 'calendar', icon: CalendarDays, ar: 'التقويم', en: 'Calendar' },
  { v: 'tasks', icon: ListTodo, ar: 'المهام', en: 'Tasks' },
  { v: 'categories', icon: FolderKanban, ar: 'التصنيفات والمشاريع', en: 'Categories & Projects' },
  { v: 'leave', icon: Palmtree, ar: 'الإجازات والعطل', en: 'Leave & Holidays' },
  { v: 'reports', icon: BarChart3, ar: 'التقارير', en: 'Reports' },
  { v: 'settings', icon: Cog, ar: 'الإعدادات', en: 'Settings' },
]

function readURL() {
  const p = Object.fromEntries(new URLSearchParams(location.search))
  return p
}

export default function App() {
  const settings = useSettings()
  // apply language/format/theme before children render
  setLang(settings.lang)
  setTimeZone(settings.timeZone)
  setFormat(settings.lang, settings.timeFormat, settings.dateFormat)

  const initial = readURL()
  const [view, setView] = useState<View>((initial.view as View) || 'today')
  const [params, setParams] = useState<Record<string, string>>(initial)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('df-side') === '1')
  const [modal, setModal] = useState<null | { kind: 'task'; t: Task | Partial<Task> } | { kind: 'event'; e: CalEvent | Partial<CalEvent>; d?: string } | { kind: 'quick'; d: QuickAddDefaults } | { kind: 'search' } | { kind: 'reminders' } | { kind: 'plan' } | { kind: 'review'; date: string } | { kind: 'more' }>(null)
  const [, force] = useState(0)
  const closedAt = useRef(0)
  const [unread, setUnread] = useState(() => centerItems().filter(i => !i.dismissed).length)
  useEffect(() => onCenter(() => setUnread(centerItems().filter(i => !i.dismissed).length)), [])

  useEffect(() => {
    const r = document.documentElement
    if (settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', settings.theme)
    r.setAttribute('data-density', settings.density)
    if (settings.reducedMotion === 'system') r.removeAttribute('data-motion'); else r.setAttribute('data-motion', settings.reducedMotion === 'on' ? 'reduce' : 'full')
    r.style.setProperty('--accent', settings.accent)
    document.title = settings.appName
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(r).getPropertyValue('--paper').trim() === '#0D1824' ? '#0D1824' : '#102A43')
  }, [settings.theme, settings.density, settings.reducedMotion, settings.accent, settings.appName])

  const go = useCallback((v: View, p: Record<string, string> = {}) => {
    setView(v); setParams(p)
    const q = new URLSearchParams({ view: v, ...p }).toString()
    history.replaceState(null, '', v === 'today' && !Object.keys(p).length ? '/' : `/?${q}`)
    window.scrollTo({ top: 0 })
  }, [])

  const ctx: AppCtx = useMemo(() => ({
    settings, view, params, go,
    editTask: t => setModal({ kind: 'task', t }),
    editEvent: (e, d) => {
      const { instanceDate, spanStart, spanEnd, ...base } = e as any
      setModal({ kind: 'event', e: base, d: d || instanceDate })
    },
    quickAdd: (d = {}) => { if (Date.now() - closedAt.current > 600) setModal({ kind: 'quick', d }) },
    openSearch: () => setModal({ kind: 'search' }),
    openReminders: () => setModal({ kind: 'reminders' }),
    openPlanTomorrow: () => setModal({ kind: 'plan' }),
    openReview: date => setModal({ kind: 'review', date: date || todayStr() }),
  }), [settings, view, params, go])

  // deep links (notifications, shortcuts)
  const openFromParams = useCallback(async (p: Record<string, string>) => {
    if (p.task) { const t = await db.tasks.get(p.task); if (t && !t.deleted) setModal({ kind: 'task', t }) }
    else if (p.event) { const e = await db.events.get(p.event); if (e && !e.deleted) setModal({ kind: 'event', e, d: p.d }) }
    else if (p.review) setModal({ kind: 'review', date: todayStr() })
    else if (p.add) setModal({ kind: 'quick', d: {} })
    if (p.view) setView(p.view as View)
  }, [])
  useEffect(() => { openFromParams(initial) }, [])
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'OPEN_URL') {
        const u = new URL(e.data.url)
        const p = Object.fromEntries(u.searchParams)
        openFromParams(p)
      }
    }
    navigator.serviceWorker?.addEventListener('message', h)
    return () => navigator.serviceWorker?.removeEventListener('message', h)
  }, [])

  // in-app toast when a reminder fires
  useEffect(() => { setOnFire(i => toast(`🔔 ${i.title}`, { ms: 7000, action: { label: L('فتح', 'Open'), fn: () => openFromParams(Object.fromEntries(new URL(i.url, location.origin).searchParams)) } })) }, [])

  // keyboard shortcuts (desktop)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable || document.querySelector('.overlay')) return
      if (e.metaKey || e.ctrlKey) { if (e.key.toLowerCase() === 'k') { e.preventDefault(); setModal({ kind: 'search' }) } return }
      if (e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'n' || key === 'ى') { e.preventDefault(); if (Date.now() - closedAt.current > 600) setModal({ kind: 'quick', d: {} }) }
      else if (key === '/') { e.preventDefault(); setModal({ kind: 'search' }) }
      else if (/^[1-7]$/.test(key)) go(NAV[+key - 1].v)
      else if (key === 't') go('today')
      else if (key === '?') setModal({ kind: 'more' })
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go])

  // save + sync status
  const [sync, setSync] = useState(() => ({ state: 'local' as string, lastSync: null as number | null }))
  useEffect(() => onSync(i => setSync({ state: i.state, lastSync: i.lastSync })), [])
  const [savedFlash, setSavedFlash] = useState(false)
  useEffect(() => onLocalChange(() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600) }), [])
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 60000); return () => clearInterval(t) }, [])

  const close = () => { closedAt.current = Date.now(); setModal(null) }
  const title = NAV.find(n => n.v === view)!

  const Page = { today: Today, calendar: CalendarPage, tasks: TasksPage, categories: CategoriesPage, leave: LeavePage, reports: ReportsPage, settings: SettingsPage }[view]

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className={`side${collapsed ? ' collapsed' : ''}`} aria-label={L('التنقل الرئيسي', 'Main navigation')}>
          <div className="brand"><BrandMark /><div className="brand-text"><b>{settings.appName}</b><span>{L('مخططي الشخصي', 'My personal planner')}</span></div></div>
          <button className="btn primary side-add" onClick={() => ctx.quickAdd()} title={L('إضافة (N)', 'Add (N)')}><Plus size={18} /><span className="side-label">{L('إضافة', 'Add')}</span></button>
          {NAV.map((n, i) => (
            <button key={n.v} className={`nav-btn${view === n.v ? ' active' : ''}`} onClick={() => go(n.v)} aria-current={view === n.v ? 'page' : undefined} title={`${L(n.ar, n.en)} (${i + 1})`}>
              <n.icon size={19} /><span className="side-label">{L(n.ar, n.en)}</span>
            </button>
          ))}
          <button className="nav-btn" onClick={() => setModal({ kind: 'search' })} title={L('بحث (/)', 'Search (/)')}><Search size={19} /><span className="side-label">{L('بحث', 'Search')}</span></button>
          <div className="side-foot">Prepared by: Hani Al Ghatrifi</div>
          <button className="nav-btn" onClick={() => { setCollapsed(c => { localStorage.setItem('df-side', c ? '0' : '1'); return !c }) }} aria-label={collapsed ? L('توسيع القائمة', 'Expand sidebar') : L('طي القائمة', 'Collapse sidebar')}>
            {(document.documentElement.dir === 'rtl') !== collapsed ? <ChevronsRight size={19} /> : <ChevronsLeft size={19} />}<span className="side-label">{L('طي القائمة', 'Collapse')}</span>
          </button>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="show-m"><BrandMark size={30} /></span>
            <h1 className="grow ellipsis"><span className="hide-m">{L(title.ar, title.en)}</span><span className="show-m">{view === 'today' ? settings.appName : L(title.ar, title.en)}</span></h1>
            <SyncBadge state={sync.state} saved={savedFlash} lastSync={sync.lastSync} onClick={() => (getToken() ? syncNow() : go('settings', { tab: 'sync' }))} />
            <span className="pill hide-m nowrap">{fmtMed(todayStr())}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon sm" onClick={() => setModal({ kind: 'search' })} aria-label={L('بحث', 'Search')} title={L('بحث (/)', 'Search (/)')}><Search size={17} /></button>
              <button className="btn icon sm" onClick={() => setModal({ kind: 'reminders' })} aria-label={unread ? L(`مركز التذكيرات، ${unread} جديدة`, `Reminder center, ${unread} new`) : L('مركز التذكيرات', 'Reminder center')} title={L('التذكيرات', 'Reminders')} style={{ position: 'relative' }}>
                <Bell size={17} />{unread > 0 && <span className="pill rose" style={{ position: 'absolute', top: -7, insetInlineEnd: -7, padding: '0 6px', fontSize: 11, lineHeight: 1.6 }}>{unread}</span>}
              </button>
              <button className={`btn icon sm${view === 'settings' ? ' accent' : ''}`} onClick={() => go('settings')} aria-label={L('الإعدادات', 'Settings')} title={L('الإعدادات', 'Settings')}><Cog size={17} /></button>
            </div>
            <button className="btn primary sm hide-m" onClick={() => ctx.quickAdd()}><Plus size={16} />{L('إضافة', 'Add')}</button>
          </header>
          <main className="content" key={view}>
            <Page />
          </main>
          <div className="footer">Prepared by: Hani Al Ghatrifi</div>
        </div>

        <nav className="bottom-nav" aria-label={L('التنقل', 'Navigation')}>
          {NAV.slice(0, 2).map(n => <button key={n.v} className={`bn${view === n.v ? ' active' : ''}`} onClick={() => go(n.v)} aria-current={view === n.v ? 'page' : undefined}><n.icon size={21} />{L(n.ar, n.en)}</button>)}
          <div style={{ display: 'grid' }}><button className="bn-add" onClick={() => ctx.quickAdd()} aria-label={L('إضافة سريعة', 'Quick add')}><Plus size={26} /></button></div>
          {NAV.slice(2, 3).map(n => <button key={n.v} className={`bn${view === n.v ? ' active' : ''}`} onClick={() => go(n.v)} aria-current={view === n.v ? 'page' : undefined}><n.icon size={21} />{L(n.ar, n.en)}</button>)}
          <button className={`bn${['categories', 'leave', 'reports', 'settings'].includes(view) ? ' active' : ''}`} onClick={() => setModal({ kind: 'more' })}><MenuIcon size={21} />{L('المزيد', 'More')}</button>
        </nav>
      </div>

      {modal?.kind === 'task' && <TaskEditor key={(modal.t as any).id || 'new'} task={modal.t} onClose={close} />}
      {modal?.kind === 'event' && <EventEditor ev={modal.e} instanceDate={modal.d} onClose={close} />}
      {modal?.kind === 'quick' && <QuickAdd defaults={modal.d} onClose={close} />}
      {modal?.kind === 'search' && <SearchDialog onClose={close} />}
      {modal?.kind === 'reminders' && <ReminderCenter onClose={close} />}
      {modal?.kind === 'plan' && <PlanTomorrow onClose={close} />}
      {modal?.kind === 'review' && <DayReview date={modal.date} onClose={close} />}
      {modal?.kind === 'more' && (
        <Modal title={L('المزيد', 'More')} icon={<LayoutGrid size={18} />} onClose={close}>
          <div className="col" style={{ gap: 4 }}>
            {NAV.map((n, i) => <button key={n.v} className={`nav-btn${view === n.v ? ' active' : ''}`} onClick={() => { close(); go(n.v) }}><n.icon size={19} />{L(n.ar, n.en)}<span className="grow" /><span className="kbd hide-m">{i + 1}</span></button>)}
          </div>
          <div className="hide-m small muted">
            <b>{L('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')}</b>
            <div className="row wrap" style={{ marginTop: 6 }}><span className="kbd">N</span> {L('إضافة', 'Add')} · <span className="kbd">/</span> {L('بحث', 'Search')} · <span className="kbd">T</span> {L('اليوم', 'Today')} · <span className="kbd">1–7</span> {L('الأقسام', 'Sections')} · <span className="kbd">Esc</span> {L('إغلاق', 'Close')}</div>
          </div>
        </Modal>
      )}
      <ConfirmHost />
      <Toasts />
      <OnboardingHint show={!settings.onboarded} />
    </Ctx.Provider>
  )
}

function SyncBadge({ state, saved, lastSync, onClick }: { state: string; saved: boolean; lastSync: number | null; onClick: () => void }) {
  const map: Record<string, [string, string, string]> = {
    local: ['', L('محفوظ على الجهاز', 'Saved on device'), L('غير متصل بالسحابة — اضغط للربط', 'Not connected to cloud — tap to connect')],
    syncing: ['warn', L('جارٍ المزامنة…', 'Syncing…'), ''],
    synced: ['', L('متزامن', 'Synced'), lastSync ? new Date(lastSync).toLocaleTimeString() : ''],
    offline: ['warn', L('دون اتصال — محفوظ محلياً', 'Offline — saved locally'), L('ستتم المزامنة عند عودة الاتصال', 'Will sync when back online')],
    error: ['err', L('تعذّرت المزامنة', 'Sync failed'), L('اضغط لإعادة المحاولة', 'Tap to retry')],
    auth: ['err', L('سجّل الدخول للمزامنة', 'Sign in to sync'), ''],
  }
  const [cls, label, hint] = map[state] || map.local
  const Icon = state === 'syncing' ? RefreshCw : state === 'offline' ? CloudOff : state === 'error' || state === 'auth' ? AlertTriangle : Check
  return (
    <button className={`status-dot ${cls}`} style={{ border: 0, background: 'none', cursor: 'pointer', padding: '4px 6px' }} onClick={onClick} title={hint} aria-live="polite">
      {saved && state !== 'syncing' ? <><Check size={14} color="var(--teal)" /><span className="hide-m">{L('تم الحفظ', 'Saved')}</span></> : <><Icon size={14} className={state === 'syncing' ? 'spin' : ''} /><span className="vh-m">{label}</span></>}
    </button>
  )
}

function OnboardingHint({ show }: { show: boolean }) {
  const [open, setOpen] = useState(show)
  useEffect(() => setOpen(show), [show])
  if (!open) return null
  const done = () => { setOpen(false); updateSettings({ onboarded: true }) }
  return (
    <div className="card no-print" role="dialog" aria-label={L('مرحباً', 'Welcome')} style={{ position: 'fixed', zIndex: 60, insetInlineEnd: 16, bottom: 'calc(var(--nav-h) + 26px + env(safe-area-inset-bottom))', maxWidth: 360, animation: 'rise .3s ease' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <BrandMark size={32} />
        <div className="grow">
          <b>{L('مرحباً بك في DayFlow', 'Welcome to DayFlow')}</b>
          <ul className="small" style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            <li>{L('ابدأ بتحديد أهم ثلاث أولويات لليوم.', 'Start by setting today’s top three.')}</li>
            <li>{L('زر + يضيف مهمة أو موعداً أو ملاحظة بسرعة.', 'The + button adds a task, event or note fast.')}</li>
            <li>{L('البيانات التجريبية معلّمة «تجريبي» ويمكن حذفها من الإعدادات.', 'Demo records are labelled “Demo” and can be cleared in Settings.')}</li>
            <li>{L('اربط المزامنة والتنبيهات من الإعدادات.', 'Connect sync and notifications in Settings.')}</li>
          </ul>
        </div>
        <button className="btn ghost icon sm" onClick={done} aria-label={L('إغلاق', 'Close')}><X size={16} /></button>
      </div>
      <button className="btn primary sm" style={{ marginTop: 10, width: '100%' }} onClick={done}>{L('فهمت', 'Got it')}</button>
    </div>
  )
}

export { getLastSaved }
