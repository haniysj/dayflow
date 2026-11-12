import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { addDays, addMonths, dow, endOfMonth, fmtMonth, fmtShort, startOfMonth, startOfWeek, todayStr, weekdayName } from '../lib/dates'
import { getLang, L } from '../lib/i18n'

/**
 * Pick a date range with two taps: the first tap sets the start, the second the end
 * (tapping an earlier day second swaps them). A third tap starts a new range.
 */
export function RangePicker({ start, end, onChange, holidays, workdays }: {
  start: string; end: string; onChange: (start: string, end: string) => void; holidays: Set<string>; workdays: number[]
}) {
  const [month, setMonth] = useState(startOfMonth(start || todayStr()))
  const [awaitEnd, setAwaitEnd] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const today = todayStr()
  const rtl = getLang() === 'ar'
  const first = startOfWeek(month, 0)
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const after = days.findIndex(d => d > endOfMonth(month))
  const cells = days.slice(0, after > 0 ? Math.ceil(after / 7) * 7 : 42) // only the weeks this month needs

  const tap = (d: string) => {
    if (!awaitEnd) { onChange(d, d); setAwaitEnd(true) }
    else { d < start ? onChange(d, start) : onChange(start, d); setAwaitEnd(false); setHover(null) }
  }
  // while choosing the end, preview the range up to the hovered day (desktop)
  const [a, b] = awaitEnd && hover ? (hover < start ? [hover, start] : [start, hover]) : [start, end]
  const Prev = rtl ? ChevronRight : ChevronLeft, Next = rtl ? ChevronLeft : ChevronRight

  return (
    <div className="rp">
      <div className="rp-head">
        <button type="button" className="btn ghost icon sm" onClick={() => setMonth(addMonths(month, -1))} aria-label={L('الشهر السابق', 'Previous month')}><Prev size={18} /></button>
        <b>{fmtMonth(month)}</b>
        <button type="button" className="btn ghost icon sm" onClick={() => setMonth(addMonths(month, 1))} aria-label={L('الشهر التالي', 'Next month')}><Next size={18} /></button>
      </div>
      <div className="rp-grid" role="grid" aria-label={fmtMonth(month)} onPointerLeave={() => setHover(null)}>
        {cells.slice(0, 7).map(d => <div key={'h' + d} className="rp-wd" role="columnheader">{weekdayName(d, 'narrow')}</div>)}
        {cells.map(d => {
          const out = d.slice(0, 7) !== month.slice(0, 7)
          const inR = d >= a && d <= b
          const cls = ['rp-d', out && 'out', !workdays.includes(dow(d)) && 'we', holidays.has(d) && 'hol', inR && 'in', d === a && 'a', d === b && 'b', d === today && 'now'].filter(Boolean).join(' ')
          return (
            <button key={d} type="button" className={cls} onClick={() => tap(d)} onPointerEnter={() => awaitEnd && setHover(d)} aria-pressed={inR} aria-label={d}>
              <span>{+d.slice(8)}</span>
            </button>
          )
        })}
      </div>
      <div className="rp-foot">
        <span className={`rp-hint${awaitEnd ? ' on' : ''}`}>{awaitEnd ? L('اضغط يوم النهاية', 'Tap the last day') : L('اضغط يوم البداية ثم يوم النهاية', 'Tap the first day, then the last day')}</span>
        <span className="tiny muted iso">{fmtShort(a)}{a !== b ? ` – ${fmtShort(b)}` : ''}</span>
      </div>
      <div className="rp-legend tiny muted">
        <span><i className="rp-sw we" />{L('عطلة نهاية الأسبوع', 'Weekend')}</span>
        <span><i className="rp-sw hol" />{L('عطلة رسمية', 'Public holiday')}</span>
      </div>
    </div>
  )
}

/** "1 يوم" · "2 يومان" · "5 أيام" · "12 يوماً" */
export function daysLabel(n: number) {
  if (getLang() !== 'ar') return `${n} ${n === 1 ? 'day' : 'days'}`
  return n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يوماً`
}
