import { ChevronLeft, ChevronRight, Filter, MapPin, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app-context'
import { ALL_TYPES, buildCalendar, moveGridItem, scheduleTaskAt, type CalFilter } from '../components/calendarData'
import { typeColor } from '../components/EventEditor'
import { TimeGrid } from '../components/TimeGrid'
import { catName, DateBadge, Empty, FileIcon, Seg } from '../components/ui'
import { addDays, addMonths, dow, endOfMonth, fmtLong, fmtMonth, fmtShort, fmtTime, hijri, range, relDay, startOfMonth, startOfWeek, todayStr, weekdayName, minToHM } from '../lib/dates'
import { useCategories, useEvents, useHolidays, useLeaves, useTasks } from '../lib/db'
import { EVENT_TYPE_LABEL, L } from '../lib/i18n'
import { exportICS } from '../lib/io'

type CalView = 'day' | 'workweek' | 'week' | 'month' | 'agenda'

export function CalendarPage() {
  const { settings, editTask, editEvent, quickAdd, go, params } = useApp()
  const [view, setView] = useState<CalView>(() => (params.cv as CalView) || (localStorage.getItem('df-calview') as CalView) || (window.innerWidth < 700 ? 'agenda' : 'week'))
  const [cursor, setCursor] = useState(params.d || todayStr())
  const [showFilter, setShowFilter] = useState(false)
  const [filter, setFilter] = useState<CalFilter>({ types: Object.fromEntries(ALL_TYPES.map(t => [t, true])), q: '' })
  const events = useEvents() || []
  const tasks = useTasks() || []
  const leaves = useLeaves() || []
  const holidays = useHolidays() || []
  const cats = useCategories() || []
  const today = todayStr()
  const setV = (v: CalView) => { setView(v); localStorage.setItem('df-calview', v) }

  const weekStart = startOfWeek(cursor, settings.weekStart)
  const { from, to, dates } = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor, dates: [cursor] }
    if (view === 'week') { const d = range(weekStart, addDays(weekStart, 6)); return { from: d[0], to: d[6], dates: d } }
    if (view === 'workweek') { const d = range(weekStart, addDays(weekStart, 6)).filter(x => settings.workdays.includes(dow(x))); return { from: weekStart, to: addDays(weekStart, 6), dates: d.length ? d : [cursor] } }
    if (view === 'month') { const s = startOfWeek(startOfMonth(cursor), settings.weekStart); const e = addDays(startOfWeek(endOfMonth(cursor), settings.weekStart), 6); return { from: s, to: e, dates: range(s, e) } }
    return { from: cursor, to: addDays(cursor, 30), dates: range(cursor, addDays(cursor, 30)) }
  }, [view, cursor, settings.weekStart, settings.workdays])

  const data = useMemo(() => buildCalendar({
    from, to, events, tasks, leaves, holidays, settings, cats, filter,
    onEvent: e => editEvent(e, e.instanceDate), onTask: editTask, onLeave: () => go('leave'), onHoliday: () => go('leave'),
  }), [from, to, events, tasks, leaves, holidays, settings, cats, filter])

  // swipe: in RTL "next" sits to the left, so the finger moves right (and the reverse in LTR)
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)
  const swipeRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<(n: number) => void>(() => {})
  useEffect(() => {
    const el = swipeRef.current
    if (!el) return
    let x0 = 0, y0 = 0, t0 = 0, active = false
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement
      if (e.touches.length !== 1 || t.closest('.grip, .rsz, input, select, textarea, .modal')) { active = false; return }
      active = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now()
    }
    const end = (e: TouchEvent) => {
      if (!active) return
      active = false
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 800) return
      const rtl = document.documentElement.dir === 'rtl'
      const next = rtl ? dx > 0 : dx < 0
      stepRef.current(next ? 1 : -1)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchend', end, { passive: true })
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchend', end) }
  }, [view, cursor])

  const step = (n: number) => {
    setSlide(n > 0 ? 'next' : 'prev')
    if (view === 'day') setCursor(addDays(cursor, n))
    else if (view === 'month') setCursor(addMonths(cursor, n))
    else if (view === 'agenda') setCursor(addDays(cursor, 30 * n))
    else setCursor(addDays(cursor, 7 * n))
  }
  stepRef.current = step
  const title = view === 'month' ? fmtMonth(cursor) : view === 'day' ? fmtLong(cursor) : view === 'agenda' ? `${fmtShort(from)} – ${fmtShort(to)}` : `${fmtShort(dates[0])} – ${fmtShort(dates[dates.length - 1])}`
  const prevIcon = document.documentElement.dir === 'rtl' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />
  const nextIcon = document.documentElement.dir === 'rtl' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />
  const activeFilters = Object.values(filter.types).filter(v => !v).length + (filter.q ? 1 : 0) + (filter.categoryId ? 1 : 0)

  return (
    <div className="stack view-enter">
      <div className="card" style={{ padding: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn icon sm" onClick={() => step(-1)} aria-label={L('السابق', 'Previous')}>{prevIcon}</button>
            <button className="btn sm" onClick={() => { setSlide(null); setCursor(today) }}>{L('اليوم', 'Today')}</button>
            <button className="btn icon sm" onClick={() => step(1)} aria-label={L('التالي', 'Next')}>{nextIcon}</button>
          </div>
          <h2 className="grow" style={{ fontSize: 17, minWidth: 150 }}>{title}{settings.showHijri && view === 'day' && <span className="small muted" style={{ fontWeight: 500 }}> · {hijri(cursor)}</span>}</h2>
          <Seg label={L('طريقة العرض', 'View')} value={view} onChange={setV} options={[
            { v: 'day', l: L('يوم', 'Day') }, { v: 'workweek', l: L('أسبوع العمل', 'Workweek') }, { v: 'week', l: L('أسبوع', 'Week') },
            { v: 'month', l: L('شهر', 'Month') }, { v: 'agenda', l: L('قائمة', 'Agenda') },
          ]} />
          <button className={`btn sm${activeFilters ? ' accent' : ''}`} onClick={() => setShowFilter(s => !s)} aria-expanded={showFilter}><Filter size={15} />{L('تصفية', 'Filter')}{activeFilters ? ` (${activeFilters})` : ''}</button>
          <button className="btn sm" onClick={exportICS} title={L('تصدير التقويم بصيغة ICS', 'Export calendar as ICS')}><FileIcon kind="ics" size={17} />ICS</button>
          <button className="btn primary sm" onClick={() => quickAdd({ kind: 'event', date: view === 'month' || view === 'agenda' ? (cursor >= today ? cursor : today) : cursor })}><Plus size={15} />{L('موعد', 'Event')}</button>
        </div>
        {showFilter && (
          <div className="col" style={{ marginTop: 12, gap: 10 }}>
            <div className="row wrap">
              <Search size={16} className="muted" />
              <input className="input" style={{ maxWidth: 260 }} value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} placeholder={L('بحث في التقويم…', 'Search calendar…')} aria-label={L('بحث', 'Search')} />
              <select className="input" style={{ maxWidth: 240 }} value={filter.categoryId || ''} onChange={e => setFilter({ ...filter, categoryId: e.target.value || undefined })} aria-label={L('التصنيف', 'Category')}>
                <option value="">{L('كل التصنيفات', 'All categories')}</option>
                {cats.map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
              </select>
              <button className="btn ghost sm" onClick={() => setFilter({ types: Object.fromEntries(ALL_TYPES.map(t => [t, true])), q: '' })}>{L('إعادة تعيين', 'Reset')}</button>
            </div>
            <div className="row wrap">
              {ALL_TYPES.map(t => (
                <button key={t} className={`fchip${filter.types[t] ? ' on' : ''}`} aria-pressed={filter.types[t]} onClick={() => setFilter({ ...filter, types: { ...filter.types, [t]: !filter.types[t] } })}>
                  <span className="dot" style={{ ['--c' as any]: typeColor(t, settings.typeColors) }} />{(EVENT_TYPE_LABEL() as any)[t]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={swipeRef} className={slide ? `slide-${slide}` : undefined} key={`${view}-${cursor}`} style={{ touchAction: 'pan-y' }}>
      {(view === 'day' || view === 'week' || view === 'workweek') && (
        <div className="card" style={{ padding: 0, overflow: 'clip' }}>
          {view === 'day' && <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><DateBadge date={cursor} sm /><b>{relDay(cursor)}</b>{!settings.workdays.includes(dow(cursor)) && <span className="pill">{L('عطلة نهاية الأسبوع', 'Weekend')}</span>}</div>}
          <TimeGrid dates={dates} items={data.timed} allDay={data.allDay} startHour={settings.dayStart} endHour={settings.dayEnd} slotMin={settings.slotMin} workdays={settings.workdays}
            onSlot={(d, time) => quickAdd({ kind: 'event', date: d, time })}
            onOpen={it => (it.kind === 'task' ? editTask(it.ref) : editEvent(it.ref, it.ref.instanceDate))}
            onMove={(it, d, s, e) => moveGridItem(it, d, s, e)}
            onDropTask={(id, d, time) => scheduleTaskAt(id, d, time, settings.slotMin)}
            onHeadClick={d => { setCursor(d); setV('day') }} />
        </div>
      )}

      {view === 'month' && (
        <div className="card" style={{ padding: 0, overflow: 'clip' }}>
          <div className="month" role="grid" aria-label={fmtMonth(cursor)}>
            {dates.slice(0, 7).map(d => <div key={d} className="mh" role="columnheader">{weekdayName(d, window.innerWidth < 700 ? 'narrow' : 'short')}</div>)}
            {dates.map(d => {
              const items = [...(data.allDay[d] || []), ...data.timed.filter(i => i.date === d).sort((a, b) => a.start - b.start).map(i => ({ key: i.key, title: `${fmtTime(minToHM(i.start)).replace(':00', '')} ${i.title}`, color: i.color, done: i.done, onClick: () => (i.kind === 'task' ? editTask(i.ref) : editEvent(i.ref, i.ref.instanceDate)), est: false }))]
              const max = window.innerWidth < 700 ? 2 : 3
              return (
                <div key={d} role="gridcell" className={`mcell${d.slice(0, 7) !== cursor.slice(0, 7) ? ' out' : ''}${!settings.workdays.includes(dow(d)) ? ' weekend' : ''}${d === today ? ' today' : ''}`}
                  onClick={() => { setCursor(d); setV('day') }} aria-label={fmtLong(d)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') { setCursor(d); setV('day') } }}>
                  <span className="dn">{+d.slice(8)}</span>
                  {items.slice(0, max).map(a => <button key={a.key} className={`chip${a.est ? ' est' : ''}${a.done ? ' done' : ''}`} style={{ ['--c' as any]: a.color }} title={a.title} onClick={e => { e.stopPropagation(); a.onClick?.() }}>{a.title}</button>)}
                  {items.length > max && <span className="more">+{items.length - max}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'agenda' && <Agenda dates={dates} data={data} />}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{L('الأسبوع يبدأ يوم الأحد، والجمعة والسبت عطلة نهاية الأسبوع (قابل للتعديل من الإعدادات). العطل ذات الإطار المنقّط تواريخ تقديرية.', 'Weeks start on Sunday; Friday and Saturday are the weekend (configurable in Settings). Dashed holidays are estimated dates.')}<span className="swipe-hint"> {L('اسحب بإصبعك يميناً أو يساراً للتنقل.', 'Swipe left or right to move between periods.')}</span></p>
    </div>
  )
}

function Agenda({ dates, data }: { dates: string[]; data: ReturnType<typeof buildCalendar> }) {
  const { editTask, editEvent, quickAdd } = useApp()
  const today = todayStr()
  const days = dates.map(d => ({ d, all: data.allDay[d] || [], timed: data.timed.filter(i => i.date === d).sort((a, b) => a.start - b.start) })).filter(x => x.all.length || x.timed.length)
  if (!days.length) return <div className="card"><Empty text={L('لا شيء في هذه الفترة.', 'Nothing in this period.')} action={<button className="btn sm" onClick={() => quickAdd({ kind: 'event' })}><Plus size={15} />{L('إضافة موعد', 'Add event')}</button>} /></div>
  return (
    <div className="stack">
      {days.map(({ d, all, timed }) => (
        <section key={d} className="card" style={{ padding: 14 }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
            <DateBadge date={d} sm cream={d !== today} />
            <div className="grow col" style={{ gap: 6 }}>
              <b className="small">{relDay(d)}</b>
              {all.map(a => <button key={a.key} className={`chip${a.est ? ' est' : ''}${a.done ? ' done' : ''}`} style={{ ['--c' as any]: a.color, fontSize: 13.5, padding: '3px 9px' }} onClick={a.onClick}>{a.title}</button>)}
              {timed.map(i => (
                <button key={i.key} className="row" style={{ border: 0, background: 'none', textAlign: 'start', padding: '4px 0', cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => (i.kind === 'task' ? editTask(i.ref) : editEvent(i.ref, i.ref.instanceDate))}>
                  <span className="dot" style={{ ['--c' as any]: i.color, marginTop: 7 }} />
                  <span className="ltr nowrap small muted" style={{ minWidth: 76 }}>{fmtTime(minToHM(i.start))}</span>
                  <span className="grow">
                    <span style={{ fontWeight: 650, textDecoration: i.done ? 'line-through' : undefined }}>{i.title}</span>
                    {i.sub && <span className="tiny muted row"><MapPin size={11} />{i.sub}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
