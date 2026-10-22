import { CalendarRange } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app-context'
import {
  addDays, addMonths, dow, endOfMonth, fmtMonth, fmtShort, fmtTime, hijri, monthShort, range, startOfMonth, startOfWeek, todayStr, weekdayName,
} from '../lib/dates'
import { useEvents, useHolidays, useLeaves, useTasks } from '../lib/db'
import { getLang, L, LEAVE_TYPE_LABEL } from '../lib/i18n'
import { expandEvents } from '../lib/logic'
import { FileIcon, Modal, PrintIcon, Seg, Switch, toast } from './ui'

/* Physical layout on paper (independent of RTL/LTR):
   header  = [month calendar | week priorities | title]  → calendar sits top-LEFT
   each day = [day+date | writing space]  (day on the left by default, can be switched)  */

const PAGE_W = 210, PAGE_H = 297 // mm, A4 portrait
const MM = 96 / 25.4 // px per mm

interface Opts { month: string; startWeek: string; weeks: number; labelSide: 'left' | 'right'; withItems: boolean; withHijri: boolean }

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

export function PlannerDialog({ onClose, initialMonth }: { onClose: () => void; initialMonth?: string }) {
  const today = todayStr()
  const [opts, setOpts] = useState<Opts>(() => {
    const m = startOfMonth(initialMonth || today)
    return { month: m, startWeek: weeksOfMonth(m)[0], weeks: 4, labelSide: 'left', withItems: true, withHijri: true }
  })
  const up = (c: Partial<Opts>) => setOpts(o => ({ ...o, ...c }))
  const monthOptions = useMemo(() => Array.from({ length: 15 }, (_, i) => addMonths(startOfMonth(today), i - 2)), [today])
  const weekOptions = weeksOfMonth(opts.month)
  const sundays = Array.from({ length: opts.weeks }, (_, i) => addDays(opts.startWeek, 7 * i))
  const [busy, setBusy] = useState<'' | 'pdf' | 'print'>('')
  const printRoot = useRef<HTMLDivElement>(null)

  const setMonth = (m: string) => up({ month: m, startWeek: weeksOfMonth(m)[0] })

  const doPrint = async () => {
    setBusy('print')
    await document.fonts?.ready
    const style = document.createElement('style')
    style.textContent = '@page { size: A4 portrait; margin: 0 }'
    document.head.appendChild(style)
    document.body.classList.add('pl-printing')
    const done = () => { document.body.classList.remove('pl-printing'); style.remove(); setBusy(''); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => { window.print(); setTimeout(done, 1500) }, 60)
  }

  /** Collect the CSS rules the planner sheet uses (".pl-…"), skipping @media print blocks */
  const plannerCss = () => {
    const out: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try { rules = sheet.cssRules } catch { continue }
      for (const r of Array.from(rules)) if (r instanceof CSSStyleRule && /\.pl-|#pl-print-root/.test(r.selectorText)) out.push(r.cssText)
    }
    return out.join('\n')
  }
  const fileName = `dayflow-planner-${opts.startWeek}.pdf`
  const download = (blob: Blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = fileName
    document.body.appendChild(a); a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 4000)
  }

  /** Vector PDF (real text) rendered by the server; image PDF only as an offline fallback */
  const doPdf = async () => {
    setBusy('pdf')
    try {
      if (!navigator.onLine) throw new Error('offline')
      const r = await fetch('/api/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: printRoot.current?.innerHTML || '', css: plannerCss(), lang: getLang(), name: fileName }),
      })
      if (!r.ok || !(r.headers.get('content-type') || '').includes('pdf')) throw new Error('server ' + r.status)
      download(await r.blob())
      toast(L('حُفظ ملف PDF', 'PDF saved'))
    } catch (e) {
      console.warn('server pdf failed, using image fallback', e)
      await imagePdf()
    }
    setBusy('')
  }

  const imagePdf = async () => {
    try {
      await document.fonts?.ready
      const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas-pro')])
      const html2canvas = (h2c as any).default || h2c
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
      const pages = [...(printRoot.current?.querySelectorAll<HTMLElement>('.pl-page') || [])]
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false })
        if (i) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_W, PAGE_H, `p${i}`)
      }
      download(pdf.output('blob'))
      toast(L('حُفظ PDF كصورة (دون اتصال). للحصول على نص واضح أعد الحفظ عند الاتصال بالإنترنت.', 'Saved as an image PDF (offline). Save again when online for crisp text.'), { ms: 6000 })
    } catch (e) {
      console.error(e)
      toast(L('تعذّر إنشاء PDF — جرّب زر الطباعة ثم «حفظ كـ PDF»', 'Could not create PDF — use Print → Save as PDF'), { err: true })
    }
  }

  const previewScale = Math.min(0.42, (Math.min(window.innerWidth, 560) - 70) / (PAGE_W * MM))

  return (
    <>
      <Modal wide title={L('طباعة المخطط الأسبوعي', 'Print weekly planner')} icon={<CalendarRange size={18} />} onClose={onClose}
        footer={<>
          <button className="btn primary" disabled={!!busy} onClick={doPrint}><PrintIcon size={17} />{L('طباعة', 'Print')}</button>
          <button className="btn" disabled={!!busy} onClick={doPdf}><FileIcon kind="pdf" size={18} />{busy === 'pdf' ? L('جارٍ إنشاء الملف…', 'Creating…') : L('حفظ PDF', 'Save PDF')}</button>
          <span className="grow" />
          <span className="tiny muted">A4 · {opts.weeks} {L('صفحات', 'pages')}</span>
        </>}>
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
        <div className="row wrap" style={{ gap: 14 }}>
          <div className="field"><span>{L('عدد الأسابيع', 'Weeks')}</span>
            <Seg label={L('عدد الأسابيع', 'Weeks')} value={opts.weeks} onChange={v => up({ weeks: v })} options={[1, 2, 3, 4, 5].map(v => ({ v, l: String(v) }))} />
          </div>
          <div className="field"><span>{L('موضع اليوم والتاريخ', 'Day & date position')}</span>
            <Seg label={L('موضع اليوم', 'Day position')} value={opts.labelSide} onChange={v => up({ labelSide: v })} options={[{ v: 'left', l: L('يسار', 'Left') }, { v: 'right', l: L('يمين', 'Right') }]} />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="row small"><Switch label="items" checked={opts.withItems} onChange={v => up({ withItems: v })} /><b>{L('إدراج مواعيدي ومهامي المسجلة', 'Include my events & tasks')}</b></label>
          <label className="row small"><Switch label="hijri" checked={opts.withHijri} onChange={v => up({ withHijri: v })} /><b>{L('التاريخ الهجري', 'Hijri date')}</b></label>
        </div>
        <div className="small muted">{L('الصفحات', 'Pages')}: {sundays.map(s => `${fmtShort(s)}–${fmtShort(addDays(s, 4))}`).join(' · ')}</div>
        <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--soft)', borderRadius: 14, padding: 12 }}>
          <div dir="ltr" style={{ position: 'relative', width: PAGE_W * MM * previewScale, height: PAGE_H * MM * previewScale, overflow: 'hidden', boxShadow: '0 4px 16px rgba(16,42,67,.18)', borderRadius: 3, background: '#fff' }} aria-label={L('معاينة الصفحة الأولى', 'Preview of first page')}>
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left', width: PAGE_W * MM }}>
              <PlannerPages sundays={sundays.slice(0, 1)} opts={opts} />
            </div>
          </div>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{L('على الآيباد أو الجوال: «حفظ PDF» ينشئ الملف مباشرة. «طباعة» يفتح نافذة الطباعة، ومنها يمكن أيضاً اختيار «حفظ كـ PDF».', 'On iPad/phone, “Save PDF” creates the file directly. “Print” opens the print dialog, where you can also choose “Save as PDF”.')}</p>
      </Modal>
      {createPortal(<div id="pl-print-root" ref={printRoot}><PlannerPages sundays={sundays} opts={opts} /></div>, document.body)}
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
                {[1, 2, 3].map(n => <div key={n} className="pl-prio-line"><span>{n}</span></div>)}
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

function MiniMonth({ month, weekStart, rtl, holidays }: { month: string; weekStart: string; rtl: boolean; holidays: Set<string> }) {
  const first = startOfWeek(startOfMonth(month), 0)
  const last = addDays(startOfWeek(endOfMonth(month), 0), 6)
  const days = range(first, last)
  const weekEnd = addDays(weekStart, 4)
  return (
    <div className="pl-cal" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="pl-cal-t">{fmtMonth(month)}</div>
      <div className="pl-cal-g">
        {days.slice(0, 7).map(d => <div key={'h' + d} className="pl-cal-h">{weekdayName(d, 'narrow')}</div>)}
        {days.map(d => {
          const out = d.slice(0, 7) !== month.slice(0, 7)
          const inWeek = d >= weekStart && d <= weekEnd
          const we = dow(d) === 5 || dow(d) === 6
          return <div key={d} className={`pl-cal-d${out ? ' out' : ''}${inWeek ? ' wk' : ''}${we ? ' we' : ''}${holidays.has(d) && !out ? ' hol' : ''}`}>{+d.slice(8)}</div>
        })}
      </div>
    </div>
  )
}

/** Small helper so other pages can open the dialog */
export function usePlannerDialog() {
  const [open, setOpen] = useState(false)
  useEffect(() => () => document.body.classList.remove('pl-printing'), [])
  return { open, show: () => setOpen(true), hide: () => setOpen(false) }
}
