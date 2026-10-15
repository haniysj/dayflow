import { dow, weekdayName, addDays } from '../lib/dates'
import { L } from '../lib/i18n'
import type { Recurrence } from '../lib/types'

export function RecurrenceField({ value, start, onChange }: { value: Recurrence | null; start: string; onChange: (r: Recurrence | null) => void }) {
  const freq = value?.freq || 'none'
  const sunday = addDays(start, -dow(start))
  return (
    <div className="col" style={{ gap: 6 }}>
      <select className="input" value={freq} aria-label={L('تكرار', 'Repeat')}
        onChange={e => {
          const f = e.target.value
          if (f === 'none') return onChange(null)
          if (f === 'workdays') return onChange({ freq: 'daily', interval: 1, workdaysOnly: true, until: value?.until })
          onChange({ freq: f as Recurrence['freq'], interval: value?.interval || 1, byDay: f === 'weekly' ? [dow(start)] : undefined, until: value?.until })
        }}>
        <option value="none">{L('لا يتكرر', 'Does not repeat')}</option>
        <option value="daily">{L('يومياً', 'Daily')}</option>
        <option value="workdays">{L('أيام العمل', 'Workdays')}</option>
        <option value="weekly">{L('أسبوعياً', 'Weekly')}</option>
        <option value="monthly">{L('شهرياً', 'Monthly')}</option>
        <option value="yearly">{L('سنوياً', 'Yearly')}</option>
      </select>
      {value && value.freq === 'weekly' && (
        <div className="row wrap" role="group" aria-label={L('أيام الأسبوع', 'Days of week')}>
          {[0, 1, 2, 3, 4, 5, 6].map(d => {
            const on = value.byDay?.includes(d)
            return <button type="button" key={d} className={`fchip${on ? ' on' : ''}`} aria-pressed={on} style={{ padding: '3px 9px' }}
              onClick={() => {
                const next = on ? value.byDay!.filter(x => x !== d) : [...(value.byDay || []), d]
                onChange({ ...value, byDay: next.length ? next.sort() : [d] })
              }}>{weekdayName(addDays(sunday, d), 'short')}</button>
          })}
        </div>
      )}
      {value && (
        <div className="row wrap small">
          {!value.workdaysOnly && <>
            <span>{L('كل', 'Every')}</span>
            <input className="input" style={{ width: 70, minHeight: 34, padding: '4px 8px' }} type="number" min={1} max={99} value={value.interval}
              onChange={e => onChange({ ...value, interval: Math.max(1, +e.target.value || 1) })} aria-label={L('الفاصل', 'Interval')} />
          </>}
          <span>{L('حتى', 'until')}</span>
          <input className="input" style={{ width: 160, minHeight: 34, padding: '4px 8px' }} type="date" value={value.until || ''} onChange={e => onChange({ ...value, until: e.target.value || undefined })} aria-label={L('حتى تاريخ', 'Until')} />
        </div>
      )}
    </div>
  )
}
