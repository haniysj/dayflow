import { CalendarDays } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app-context'
import { addDays, addMonths, dow, endOfMonth, fmtDay, fmtMonth, fmtShort, range, startOfMonth, startOfWeek, todayStr, weekdayName } from '../lib/dates'
import { useEvents, useHolidays, useLeaves } from '../lib/db'
import { getLang, L } from '../lib/i18n'
import { leaveTypeName } from '../lib/leaveTypes'
import { expandEvents } from '../lib/logic'
import { pageMM, printPages, savePdf, type Orient } from '../lib/printPdf'
import { FileIcon, Modal, PrintIcon, Seg, Switch } from './ui'

/* One A4 page holding the chosen months as small month grids (Sunday first, Fri/Sat shaded),
   with Oman holidays and my leave marked, and a list of the holidays/leave in range at the bottom. */

const MM = 96 / 25.4
type Mode = 'year' | 'half' | 'custom'
interface Opts { mode: Mode; year: number; halfStart: string; picked: string[]; orient: Orient; holidays: boolean; leave: boolean; events: boolean; hijri: boolean }

const monthsOfYear = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}-01`)
const monthName = (m: string) => fmtDay(m, { month: 'long' })

function hijriPart(s: string, part: 'month' | 'year') {
  try {
    return new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { timeZone: 'UTC', [part]: part === 'month' ? 'long' : 'numeric' })
      .format(new Date(s + 'T12:00:00Z'))
  } catch { return '' }
}
const hijriSpan = (a: string, b: string, part: 'month' | 'year') => { const x = hijriPart(a, part), y = hijriPart(b, part); return x === y ? x : `${x} – ${y}` }

export function selectedMonths(o: Opts) {
  if (o.mode === 'year') return monthsOfYear(o.year)
  if (o.mode === 'half') return Array.from({ length: 6 }, (_, i) => addMonths(o.halfStart, i))
  return [...o.picked].sort()
}

/** Pick the column count that gives each month the most room on the page */
function layout(n: number, gridW: number, gridH: number, gap: number) {
  let best = { cols: 1, rows: n, s: 0, empty: 0 }
  for (let cols = 1; cols <= Math.min(n, 6); cols++) {
    const rows = Math.ceil(n / cols)
    const cw = (gridW - (cols - 1) * gap) / cols, ch = (gridH - (rows - 1) * gap) / rows
    const s = Math.min(cw / 62, ch / 50) // a month reads well at about 62 × 50 mm for scale 1
    const empty = rows * cols - n
    if (s > best.s + 0.02 || (Math.abs(s - best.s) <= 0.02 && empty < best.empty)) best = { cols, rows, s, empty }
  }
  return best
}

export function YearCalendarDialog({ onClose, initialMonth }: { onClose: () => void; initialMonth?: string }) {
  const today = todayStr()
  const base = startOfMonth(initialMonth || today)
  const y0 = +base.slice(0, 4)
  const [opts, setOpts] = useState<Opts>(() => ({
    mode: 'year', year: y0, halfStart: `${y0}-${+base.slice(5, 7) <= 6 ? '01' : '07'}-01`,
    picked: [base, addMonths(base, 1), addMonths(base, 2)].filter(m => m.startsWith(String(y0))),
    orient: 'portrait', holidays: true, leave: true, events: true, hijri: true,
  }))
  const up = (c: Partial<Opts>) => setOpts(o => ({ ...o, ...c }))
  const months = selectedMonths(opts)
  const [busy, setBusy] = useState<'' | 'pdf' | 'print'>('')
  const printRoot = useRef<HTMLDivElement>(null)
  const years = [y0 - 1, y0, y0 + 1, y0 + 2]

  const setYear = (y: number) => setOpts(o => ({
    ...o, year: y, halfStart: `${y}${o.halfStart.slice(4)}`,
    picked: o.picked.map(m => `${y}${m.slice(4)}`),
  }))
  const toggle = (m: string) => up({ picked: opts.picked.includes(m) ? opts.picked.filter(x => x !== m) : [...opts.picked, m] })

  const tag = opts.mode === 'year' ? String(opts.year) : opts.mode === 'half' ? `${opts.halfStart.slice(0, 7)}-6m` : `${opts.year}-${months.map(m => m.slice(5, 7)).join('')}`
  const fileName = `dayflow-calendar-${tag}.pdf`
  const doPrint = () => { setBusy('print'); printPages(opts.orient, () => setBusy('')) }
  const doPdf = async () => { setBusy('pdf'); await savePdf(printRoot.current, fileName, opts.orient); setBusy('') }

  const { w, h } = pageMM(opts.orient)
  const previewScale = Math.min(opts.orient === 'portrait' ? 0.42 : 0.5, (Math.min(window.innerWidth, 560) - 70) / (w * MM))

  return (
    <>
      <Modal wide title={L('طباعة تقويم', 'Print calendar')} icon={<CalendarDays size={18} />} onClose={onClose}
        footer={<>
          <button className="btn primary" disabled={!!busy || !months.length} onClick={doPrint}><PrintIcon size={17} />{L('طباعة', 'Print')}</button>
          <button className="btn" disabled={!!busy || !months.length} onClick={doPdf}><FileIcon kind="pdf" size={18} />{busy === 'pdf' ? L('جارٍ إنشاء الملف…', 'Creating…') : L('حفظ PDF', 'Save PDF')}</button>
          <span className="grow" />
          <span className="tiny muted">A4 · {opts.orient === 'portrait' ? L('عمودي', 'Portrait') : L('أفقي', 'Landscape')} · {L('صفحة واحدة', '1 page')}</span>
        </>}>
        <div className="row wrap" style={{ gap: 14 }}>
          <div className="field"><span>{L('المدة', 'Range')}</span>
            <Seg label={L('المدة', 'Range')} value={opts.mode} onChange={v => up({ mode: v })} options={[
              { v: 'year', l: L('سنة كاملة', 'Full year') }, { v: 'half', l: L('6 أشهر', '6 months') }, { v: 'custom', l: L('أشهر محددة', 'Pick months') },
            ]} />
          </div>
          <div className="field"><span>{L('اتجاه الصفحة', 'Orientation')}</span>
            <Seg label={L('اتجاه الصفحة', 'Orientation')} value={opts.orient} onChange={v => up({ orient: v })} options={[
              { v: 'portrait', l: L('عمودي', 'Portrait') }, { v: 'landscape', l: L('أفقي', 'Landscape') },
            ]} />
          </div>
        </div>
        <div className="grid g2">
          <label className="field"><span>{L('السنة', 'Year')}</span>
            <select className="input" value={opts.year} onChange={e => setYear(+e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {opts.mode === 'half' && (
            <label className="field"><span>{L('يبدأ من شهر', 'Starting month')}</span>
              <select className="input" value={opts.halfStart} onChange={e => up({ halfStart: e.target.value })}>
                {monthsOfYear(opts.year).map(m => <option key={m} value={m}>{fmtMonth(m)} – {fmtMonth(addMonths(m, 5))}</option>)}
              </select>
            </label>
          )}
        </div>
        {opts.mode === 'custom' && (
          <div className="field"><span>{L('اختر الأشهر', 'Choose months')} ({months.length})</span>
            <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={L('الأشهر', 'Months')}>
              {monthsOfYear(opts.year).map(m => (
                <button key={m} type="button" className={`fchip${opts.picked.includes(m) ? ' on' : ''}`} aria-pressed={opts.picked.includes(m)} onClick={() => toggle(m)}>{monthName(m)}</button>
              ))}
              <button type="button" className="btn sm ghost" onClick={() => up({ picked: opts.picked.length === 12 ? [] : monthsOfYear(opts.year) })}>{opts.picked.length === 12 ? L('إلغاء الكل', 'Clear') : L('الكل', 'All')}</button>
            </div>
          </div>
        )}
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="row small"><Switch label="holidays" checked={opts.holidays} onChange={v => up({ holidays: v })} /><b>{L('العطل الرسمية', 'Public holidays')}</b></label>
          <label className="row small"><Switch label="leave" checked={opts.leave} onChange={v => up({ leave: v })} /><b>{L('إجازاتي', 'My leave')}</b></label>
          <label className="row small"><Switch label="events" checked={opts.events} onChange={v => up({ events: v })} /><b>{L('علامة لأيام مواعيدي', 'Mark days with events')}</b></label>
          <label className="row small"><Switch label="hijri" checked={opts.hijri} onChange={v => up({ hijri: v })} /><b>{L('الأشهر الهجرية', 'Hijri months')}</b></label>
        </div>
        {!months.length
          ? <div className="banner info">{L('اختر شهراً واحداً على الأقل.', 'Choose at least one month.')}</div>
          : <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--soft)', borderRadius: 14, padding: 12 }}>
            <div dir="ltr" style={{ position: 'relative', width: w * MM * previewScale, height: h * MM * previewScale, overflow: 'hidden', boxShadow: '0 4px 16px rgba(16,42,67,.18)', borderRadius: 3, background: '#fff' }} aria-label={L('معاينة الصفحة', 'Page preview')}>
              <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left', width: w * MM }}>
                <YearPage months={months} opts={opts} />
              </div>
            </div>
          </div>}
        <p className="tiny muted" style={{ margin: 0 }}>{L('«حفظ PDF» ينشئ الملف مباشرة. «طباعة» يفتح نافذة الطباعة، ومنها يمكن أيضاً اختيار «حفظ كـ PDF».', '“Save PDF” creates the file directly. “Print” opens the print dialog, where you can also choose “Save as PDF”.')}</p>
      </Modal>
      {months.length > 0 && createPortal(<div id="pl-print-root" ref={printRoot}><YearPage months={months} opts={opts} /></div>, document.body)}
    </>
  )
}

function YearPage({ months, opts }: { months: string[]; opts: Opts }) {
  const { settings } = useApp()
  const events = useEvents() || []
  const holidays = useHolidays() || []
  const leaves = useLeaves() || []
  const rtl = getLang() === 'ar'
  const today = todayStr()
  const from = months[0], to = endOfMonth(months[months.length - 1])

  const data = useMemo(() => {
    const hol = new Map<string, 'hol' | 'obs'>()
    const lv = new Set<string>()
    const ev = new Set<string>()
    const list: { from: string; to: string; name: string; c: string }[] = []
    const inMonths = (d: string) => months.includes(startOfMonth(d))
    if (opts.holidays) for (const x of holidays) {
      if (x.end < from || x.start > to) continue
      const days = range(x.start, x.end).filter(inMonths)
      if (!days.length) continue
      for (const d of days) if (hol.get(d) !== 'hol') hol.set(d, x.official ? 'hol' : 'obs')
      list.push({ from: x.start, to: x.end, name: (rtl || !x.nameEn ? x.name : x.nameEn) + (x.status === 'estimated' ? L(' (تقديري)', ' (est.)') : ''), c: x.official ? '#2E7D32' : '#AD3B7A' })
    }
    if (opts.leave) for (const x of leaves) {
      if (x.end < from || x.start > to) continue
      const days = range(x.start, x.end).filter(inMonths)
      if (!days.length) continue
      days.forEach(d => lv.add(d))
      list.push({ from: x.start, to: x.end, name: leaveTypeName(settings, x.type), c: '#8A6100' })
    }
    if (opts.events) for (const e of expandEvents(events.filter(e => e.type !== 'break'), from, to, settings.workdays)) ev.add(e.instanceDate)
    list.sort((a, b) => a.from.localeCompare(b.from))
    return { hol, lv, ev, list }
  }, [months.join(), opts.holidays, opts.leave, opts.events, holidays, leaves, events, rtl, settings.workdays])

  const { w, h } = pageMM(opts.orient)
  const listCols = opts.orient === 'landscape' ? 4 : 3
  const shown = data.list.slice(0, listCols * 6)
  const listH = shown.length ? Math.ceil(shown.length / listCols) * 3.9 + 8 : 0
  const gap = 4
  const gridW = w - 18, gridH = h - 16 - 19 - 4 - (listH ? listH + 4 : 0) - 8
  const lay = layout(months.length, gridW, gridH, gap)
  const fs = Math.max(6.5, Math.min(7.6 * lay.s, 22))

  const y1 = from.slice(0, 4), y2 = to.slice(0, 4)
  const years = y1 === y2 ? y1 : `${y1} – ${y2}`
  const title = opts.mode === 'year' ? L(`التقويم السنوي ${years}`, `${years} calendar`)
    : opts.mode === 'half' ? L(`تقويم ${monthName(from)} – ${monthName(to)} ${years}`, `${monthName(from)} – ${monthName(to)} ${years}`)
    : L(`تقويم ${years}`, `${years} calendar`)
  const sub = opts.mode === 'custom' ? months.map(monthName).join(rtl ? '، ' : ', ') : `${months.length} ${months.length > 10 ? L('شهراً', 'months') : L('أشهر', 'months')}`
  const weekend = (d: string) => !settings.workdays.includes(dow(d))

  return (
    <section className={`pl-page${opts.orient === 'landscape' ? ' pl-land' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="pl-yhead">
        <div>
          <div className="pl-app">{settings.appName}</div>
          <h1 className="pl-yt">{title}</h1>
          <div className="pl-ysub">{sub}{opts.hijri && <> · {hijriSpan(from, to, 'year')}</>}</div>
        </div>
        <div className="pl-ylegend">
          <span><i className="pl-ysw" style={{ background: '#F0F3F7', border: '0.25mm solid #D9E2EC' }} />{L('نهاية الأسبوع', 'Weekend')}</span>
          {opts.holidays && <span><i className="pl-ysw" style={{ background: '#D6EFDD' }} />{L('عطلة رسمية', 'Public holiday')}</span>}
          {opts.leave && <span><i className="pl-ysw" style={{ background: '#FBEBD0' }} />{L('إجازتي', 'My leave')}</span>}
          {opts.events && <span><i className="pl-ysw dot" />{L('موعد', 'Event')}</span>}
        </div>
      </div>

      <div className="pl-ygrid" dir={rtl ? 'rtl' : 'ltr'} style={{ gridTemplateColumns: `repeat(${lay.cols}, 1fr)`, gridTemplateRows: `repeat(${lay.rows}, 1fr)`, gap: `${gap}mm`, fontSize: `${fs}pt` }}>
        {months.map(m => {
          const first = startOfWeek(m, 0)
          const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i))
          return (
            <div key={m} className="pl-ym">
              <div className="pl-ymt">
                <span>{monthName(m)}{(opts.mode !== 'year' && y1 !== y2) || opts.mode === 'custom' ? <span className="pl-ymy"> {m.slice(0, 4)}</span> : null}</span>
                {opts.hijri && <span className="pl-ymh">{hijriSpan(m, endOfMonth(m), 'month')}</span>}
              </div>
              <div className="pl-ydays">
                {cells.slice(0, 7).map(d => <div key={'h' + d} className={`pl-ywd${weekend(d) ? ' we' : ''}`}>{weekdayName(d, lay.s > 1.6 ? 'short' : 'narrow')}</div>)}
                {cells.map(d => {
                  if (d.slice(0, 7) !== m.slice(0, 7)) return <div key={d} className="pl-yd out" />
                  const hk = data.hol.get(d)
                  const cls = ['pl-yd', weekend(d) && 'we', hk, data.lv.has(d) && 'lv', d === today && 'now'].filter(Boolean).join(' ')
                  return <div key={d} className={cls}><span>{+d.slice(8)}</span>{data.ev.has(d) && <i className="pl-ydot" />}</div>
                })}
              </div>
            </div>
          )
        })}
      </div>

      {shown.length > 0 && (
        <div className="pl-yhols" style={{ height: `${listH}mm` }}>
          <div className="pl-yhols-t">{opts.holidays && opts.leave ? L('العطل والإجازات', 'Holidays & leave') : opts.holidays ? L('العطل الرسمية', 'Public holidays') : L('إجازاتي', 'My leave')}</div>
          <div className="pl-yhols-g" style={{ gridTemplateColumns: `repeat(${listCols}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(shown.length / listCols)}, auto)`, gridAutoFlow: 'column' }}>
            {shown.map((x, i) => (
              <div key={i} className="pl-yh"><i className="pl-ysw" style={{ background: x.c }} /><b>{x.from === x.to ? fmtShort(x.from) : `${fmtShort(x.from)} – ${fmtShort(x.to)}`}</b><span>{x.name}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="pl-foot"><span>{settings.appName} · {L('الأسبوع يبدأ الأحد', 'Week starts on Sunday')}</span><span>Prepared by: Hani Al Ghatrifi</span></div>
    </section>
  )
}
