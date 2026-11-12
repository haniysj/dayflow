import { CalendarRange } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app-context'
import {
  addDays, addMonths, dow, endOfMonth, fmtMonth, fmtShort, fmtTime, hijri, monthShort, range, startOfMonth, startOfWeek, todayStr, weekdayName,
} from '../lib/dates'
import { useEvents, useHolidays, useLeaves, useTasks } from '../lib/db'
import { getLang, L, LEAVE_TYPE_LABEL } from '../lib/i18n'
import { printPages, savePdf } from '../lib/printPdf'
import { expandEvents } from '../lib/logic'
import { FileIcon, Modal, PrintIcon, Seg, Switch } from './ui'

/* Physical layout on paper (independent of RTL/LTR):
   header  = [month calendar | week priorities | title]  → calendar sits top-LEFT
   each day = [day+date | writing space]  (day on the right by default, can be switched)  */

const PAGE_W = 210, PAGE_H = 297 // mm, A4 portrait
const MM = 96 / 25.4 // px per mm

interface Opts { span: 'month' | 'year'; year: number; cover: boolean; month: string; startWeek: string; weeks: number; labelSide: 'left' | 'right'; withItems: boolean; withHijri: boolean }

/** Sundays whose Sun–Thu span touches the given month */
function weeksOfMonth(month: string) {
  const first = startOfMonth(month), last = endOfMonth(month)
  const out: string[] = []
  for (let s = startOfWeek(first, 0); s <= last; s = addDays(s, 7)) {
    const workEnd = addDays(s, 4)
    if (workEnd >= first) out.push(s)
  }
  return out
}

/** Sundays whose Sun–Thu span touches the given year (52 or 53 weeks) */
export function weeksOfYear(year: number) {
  const first = `${year}-01-01`, last = `${year}-12-31`
  const out: string[] = []
  for (let s = startOfWeek(first, 0); s <= last; s = addDays(s, 7)) if (addDays(s, 4) >= first) out.push(s)
  return out
}

export function PlannerDialog({ onClose, initialMonth }: { onClose: () => void; initialMonth?: string }) {
  const today = todayStr()
  const [opts, setOpts] = useState<Opts>(() => {
    const m = startOfMonth(initialMonth || today)
    const y = +today.slice(0, 4) + (+today.slice(5, 7) >= 10 ? 1 : 0) // from October on, default to planning next year
    return { span: 'month', year: y, cover: true, month: m, startWeek: weeksOfMonth(m)[0], weeks: 4, labelSide: 'right', withItems: true, withHijri: true }
  })
  const up = (c: Partial<Opts>) => setOpts(o => ({ ...o, ...c }))
  const monthOptions = useMemo(() => Array.from({ length: 15 }, (_, i) => addMonths(startOfMonth(today), i - 2)), [today])
  const weekOptions = weeksOfMonth(opts.month)
  const isYear = opts.span === 'year'
  const sundays = isYear ? weeksOfYear(opts.year) : Array.from({ length: opts.weeks }, (_, i) => addDays(opts.startWeek, 7 * i))
  const withCover = isYear && opts.cover
  const pageCount = sundays.length + (withCover ? 1 : 0)
  const y0 = +today.slice(0, 4)
  const [busy, setBusy] = useState<'' | 'pdf' | 'print'>('')
  const printRoot = useRef<HTMLDivElement>(null)

  const setMonth = (m: string) => up({ month: m, startWeek: weeksOfMonth(m)[0] })

  const fileName = isYear ? `dayflow-planner-${opts.year}.pdf` : `dayflow-planner-${opts.startWeek}.pdf`
  const doPrint = () => { setBusy('print'); printPages('portrait', () => setBusy('')) }
  const doPdf = async () => { setBusy('pdf'); await savePdf(printRoot.current, fileName, 'portrait'); setBusy('') }

  const previews = withCover ? 2 : 1
  const previewScale = Math.min(0.42, (Math.min(window.innerWidth, 560) - 70 - (previews - 1) * 12) / previews / (PAGE_W * MM))
  const pageBox = (child: React.ReactNode, label: string) => (
    <div dir="ltr" style={{ position: 'relative', width: PAGE_W * MM * previewScale, height: PAGE_H * MM * previewScale, overflow: 'hidden', boxShadow: '0 4px 16px rgba(16,42,67,.18)', borderRadius: 3, background: '#fff', flexShrink: 0 }} aria-label={label}>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left', width: PAGE_W * MM }}>{child}</div>
    </div>
  )

  return (
    <>
      <Modal wide title={L('طباعة المخطط الأسبوعي', 'Print weekly planner')} icon={<CalendarRange size={18} />} onClose={onClose}
        footer={<>
          <button className="btn primary" disabled={!!busy} onClick={doPrint}><PrintIcon size={17} />{L('طباعة', 'Print')}</button>
          <button className="btn" disabled={!!busy} onClick={doPdf}><FileIcon kind="pdf" size={18} />{busy === 'pdf' ? L('جارٍ إنشاء الملف…', 'Creating…') : L('حفظ PDF', 'Save PDF')}</button>
          <span className="grow" />
          <span className="tiny muted">A4 · {pageCount} {pageCount > 10 ? L('صفحة', 'pages') : L('صفحات', 'pages')}</span>
        </>}>
        <div className="row wrap" style={{ gap: 14 }}>
          <div className="field"><span>{L('المدة', 'Range')}</span>
            <Seg label={L('المدة', 'Range')} value={opts.span} onChange={v => up({ span: v })} options={[{ v: 'month', l: L('أسابيع من شهر', 'Weeks of a month') }, { v: 'year', l: L('سنة كاملة', 'Full year') }]} />
          </div>
          <div className="field"><span>{L('موضع اليوم والتاريخ', 'Day & date position')}</span>
            <Seg label={L('موضع اليوم', 'Day position')} value={opts.labelSide} onChange={v => up({ labelSide: v })} options={[{ v: 'right', l: L('يمين', 'Right') }, { v: 'left', l: L('يسار', 'Left') }]} />
          </div>
        </div>
        {isYear ? (
          <div className="grid g2">
            <label className="field"><span>{L('السنة', 'Year')}</span>
              <select className="input" value={opts.year} onChange={e => up({ year: +e.target.value })}>
                {[y0 - 1, y0, y0 + 1, y0 + 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="row small" style={{ alignSelf: 'end', paddingBottom: 8 }}><Switch label="cover" checked={opts.cover} onChange={v => up({ cover: v })} /><b>{L('صفحة غلاف في البداية', 'Cover page first')}</b></label>
          </div>
        ) : (<>
        <div className="grid g2">
          <label className="field"><span>{L('الشهر', 'Month')}</span>
            <select className="input" value={opts.month} onChange={e => setMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
          </label>
          <label className="field"><span>{L('يبدأ من أسبوع', 'Starting week')}</span>
            <select className="input" value={opts.startWeek} onChange={e => up({ startWeek: e.target.value })}>
              {weekOptions.map((s, i) => <option key={s} value={s}>{L(`الأسبوع ${i + 1}`, `Week ${i + 1}`)}: {fmtShort(s)} – {fmtShort(addDays(s, 4))}</option>)}
            </select>
          </label>
        </div>
          <div className="field"><span>{L('عدد الأسابيع', 'Weeks')}</span>
            <Seg label={L('عدد الأسابيع', 'Weeks')} value={opts.weeks} onChange={v => up({ weeks: v })} options={[1, 2, 3, 4, 5].map(v => ({ v, l: String(v) }))} />
          </div>
        </>)}
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="row small"><Switch label="items" checked={opts.withItems} onChange={v => up({ withItems: v })} /><b>{L('إدراج مواعيدي ومهامي المسجلة', 'Include my events & tasks')}</b></label>
          <label className="row small"><Switch label="hijri" checked={opts.withHijri} onChange={v => up({ withHijri: v })} /><b>{L('التاريخ الهجري', 'Hijri date')}</b></label>
        </div>
        <div className="small muted">{L('الصفحات', 'Pages')}: {isYear
          ? <>{withCover && L('غلاف + ', 'cover + ')}{sundays.length} {L('أسبوعاً', 'weeks')} ({fmtShort(sundays[0])} {sundays[0].slice(0, 4)} – {fmtShort(addDays(sundays[sundays.length - 1], 4))} {addDays(sundays[sundays.length - 1], 4).slice(0, 4)})</>
          : sundays.map(s => `${fmtShort(s)}–${fmtShort(addDays(s, 4))}`).join(' · ')}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, background: 'var(--soft)', borderRadius: 14, padding: 12 }}>
          {withCover && pageBox(<YearCover year={opts.year} withHijri={opts.withHijri} />, L('معاينة الغلاف', 'Cover preview'))}
          {pageBox(<PlannerPages sundays={sundays.slice(0, 1)} opts={opts} />, L('معاينة الصفحة الأولى', 'Preview of first page'))}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{L('على الآيباد أو الجوال: «حفظ PDF» ينشئ الملف مباشرة. «طباعة» يفتح نافذة الطباعة، ومنها يمكن أيضاً اختيار «حفظ كـ PDF».', 'On iPad/phone, “Save PDF” creates the file directly. “Print” opens the print dialog, where you can also choose “Save as PDF”.')}</p>
      </Modal>
      {createPortal(<div id="pl-print-root" ref={printRoot}>{withCover && <YearCover year={opts.year} withHijri={opts.withHijri} />}<PlannerPages sundays={sundays} opts={opts} /></div>, document.body)}
    </>
  )
}

function PlannerPages({ sundays, opts }: { sundays: string[]; opts: Opts }) {
  const { settings } = useApp()
  const events = useEvents() || []
  const tasks = useTasks() || []
  const holidays = useHolidays() || []
  const leaves = useLeaves() || []
  const rtl = getLang() === 'ar'
  const total = sundays.length

  const dayInfo = (d: string) => {
    const hol = holidays.filter(h => h.start <= d && h.end >= d)
    const lv = leaves.filter(l => l.start <= d && l.end >= d)
    const tags = [
      ...hol.map(h => ({ t: (rtl || !h.nameEn ? h.name : h.nameEn) + (h.status === 'estimated' ? L(' (تقديري)', ' (est.)') : ''), c: h.official ? '#2E7D32' : '#AD3B7A' })),
      ...lv.map(l => ({ t: (LEAVE_TYPE_LABEL() as any)[l.type], c: '#8A6100' })),
    ]
    if (!opts.withItems) return { tags, items: [] as { time: string; text: string; done?: boolean; task?: boolean }[] }
    const ev = expandEvents(events.filter(e => e.type !== 'break'), d, d, settings.workdays)
      .sort((a, b) => (a.allDay ? '' : a.startTime || '').localeCompare(b.allDay ? '' : b.startTime || ''))
      .map(e => ({ time: e.allDay ? '' : fmtTime(e.startTime), text: e.title, done: false, task: false }))
    const ts = tasks.filter(t => t.dueDate === d && !['cancelled', 'archived'].includes(t.status))
      .sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'))
      .map(t => ({ time: t.startTime ? fmtTime(t.startTime) : '', text: t.title, done: t.status === 'completed', task: true }))
    return { tags, items: [...ev, ...ts] }
  }

  return (
    <>
      {sundays.map((s, wi) => {
        const days = range(s, addDays(s, 4))
        return (
          <section key={s} className="pl-page" dir="ltr">
            {/* header: physical order left → right */}
            <div className="pl-head">
              <MiniMonth month={startOfMonth(addDays(s, 2))} weekStart={s} rtl={rtl} holidays={new Set(holidays.flatMap(h => (h.official ? range(h.start, h.end) : [])))} />
              <div className="pl-prio" dir={rtl ? 'rtl' : 'ltr'}>
                <div className="pl-label">{L('أهم أولويات الأسبوع', 'Top priorities this week')}</div>
                {[1, 2, 3, 4, 5].map(n => <div key={n} className="pl-prio-line"><span>{n}</span></div>)}
              </div>
              <div className="pl-title" dir={rtl ? 'rtl' : 'ltr'}>
                <div className="pl-app">{settings.appName}</div>
                <h1>{L('المخطط الأسبوعي', 'Weekly planner')}</h1>
                <div className="pl-range">{fmtShort(days[0])} – {fmtShort(days[4])} {days[4].slice(0, 4)}</div>
                <div className="pl-week">{L(`الأسبوع ${wi + 1} من ${total}`, `Week ${wi + 1} of ${total}`)}</div>
              </div>
            </div>

            <div className="pl-table">
              {days.map(d => {
                const info = dayInfo(d)
                const isOff = info.tags.length > 0 && holidays.some(h => h.official && h.start <= d && h.end >= d)
                const label = (
                  <div className="pl-day" dir={rtl ? 'rtl' : 'ltr'}>
                    <div className="pl-dname">{weekdayName(d, 'long')}</div>
                    <div className="pl-dnum">{+d.slice(8)}</div>
                    <div className="pl-dmon">{monthShort(d)}</div>
                    {opts.withHijri && <div className="pl-hijri">{hijri(d)}</div>}
                  </div>
                )
                const body = (
                  <div className={`pl-write${isOff ? ' off' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const tag = i === 0 && info.tags.length ? info.tags : null
                      const item = info.items[i - (info.tags.length ? 1 : 0)]
                      const overflow = i === 6 && info.items.length > 6 - (info.tags.length ? 1 : 0)
                      return (
                        <div key={i} className="pl-line">
                          {tag && tag.map((x, k) => <span key={k} className="pl-tag" style={{ color: x.c, borderColor: x.c }}>{x.t}</span>)}
                          {!tag && item && !overflow && <span className={item.done ? 'pl-done' : ''}>{item.task && <i className={`pl-box${item.done ? ' on' : ''}`} />}{item.time && <b className="pl-time">{item.time}</b>}{item.text}</span>}
                          {overflow && <span className="pl-more">+{info.items.length - 5} {L('أخرى', 'more')}</span>}
                        </div>
                      )
                    })}
                  </div>
                )
                return <div key={d} className="pl-row">{opts.labelSide === 'left' ? <>{label}{body}</> : <>{body}{label}</>}</div>
              })}
            </div>
            <div className="pl-foot" dir={rtl ? 'rtl' : 'ltr'}><span>{settings.appName} · {fmtMonth(addDays(s, 2))}</span><span>Prepared by: Hani Al Ghatrifi</span></div>
          </section>
        )
      })}
    </>
  )
}

function MiniMonth({ month, weekStart, rtl, holidays }: { month: string; weekStart?: string; rtl: boolean; holidays: Set<string> }) {
  const first = startOfWeek(startOfMonth(month), 0)
  const last = addDays(startOfWeek(endOfMonth(month), 0), 6)
  const days = range(first, last)
  const weekEnd = weekStart ? addDays(weekStart, 4) : ''
  return (
    <div className="pl-cal" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="pl-cal-t">{fmtMonth(month)}</div>
      <div className="pl-cal-g">
        {days.slice(0, 7).map(d => <div key={'h' + d} className="pl-cal-h">{weekdayName(d, 'narrow')}</div>)}
        {days.map(d => {
          const out = d.slice(0, 7) !== month.slice(0, 7)
          const inWeek = !!weekStart && d >= weekStart && d <= weekEnd
          const we = dow(d) === 5 || dow(d) === 6
          return <div key={d} className={`pl-cal-d${out ? ' out' : ''}${inWeek ? ' wk' : ''}${we ? ' we' : ''}${holidays.has(d) && !out ? ' hol' : ''}`}>{+d.slice(8)}</div>
        })}
      </div>
    </div>
  )
}

const hijriYear = (d: string) => {
  try {
    return new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
  } catch { return '' }
}

/** Cover page for the full-year planner */
function YearCover({ year, withHijri }: { year: number; withHijri: boolean }) {
  const { settings } = useApp()
  const holidays = useHolidays() || []
  const rtl = getLang() === 'ar'
  const off = new Set(holidays.flatMap(h => (h.official ? range(h.start, h.end) : [])))
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`)
  const hy = withHijri ? [hijriYear(`${year}-01-01`), hijriYear(`${year}-12-31`)] : []
  return (
    <section className="pl-page pl-cover" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="pl-cv-band">
        <div className="pl-cv-app">{settings.appName}</div>
        <div className="pl-cv-title">{L('المخطط السنوي', 'Annual Planner')}</div>
        <div className="pl-cv-year"><span className="pl-cv-for">{L('لعام', 'for')}</span><span className="pl-cv-num">{year}</span></div>
        {withHijri && <div className="pl-cv-hijri">{hy[0] === hy[1] ? hy[0] : `${hy[0]} – ${hy[1]}`}</div>}
        <div className="pl-cv-rule" />
      </div>
      <div className="pl-cv-body">
        <div className="pl-cv-goals">
          <div className="pl-label">{L(`أهدافي لعام ${year}`, `My goals for ${year}`)}</div>
          {[1, 2, 3, 4, 5].map(n => <div key={n} className="pl-prio-line"><span>{n}</span></div>)}
        </div>
        <div className="pl-label">{L('السنة في لمحة', 'The year at a glance')}</div>
        <div className="pl-cv-months" dir={rtl ? 'rtl' : 'ltr'}>
          {months.map(m => <MiniMonth key={m} month={m} rtl={rtl} holidays={off} />)}
        </div>
        <div className="pl-foot"><span>{settings.appName} · {L('العطل الرسمية باللون الأخضر', 'Public holidays in green')}</span><span>Prepared by: Hani Al Ghatrifi</span></div>
      </div>
    </section>
  )
}

/** Small helper so other pages can open the dialog */
export function usePlannerDialog() {
  const [open, setOpen] = useState(false)
  useEffect(() => () => document.body.classList.remove('pl-printing'), [])
  return { open, show: () => setOpen(true), hide: () => setOpen(false) }
}
