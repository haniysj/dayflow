import { Bell, Plus, Repeat, X } from 'lucide-react'
import { useState } from 'react'
import { L } from '../lib/i18n'
import { isDayRem, remLabel, remSort, sameRem } from '../lib/reminders'
import type { ReminderRepeat, ReminderSpec } from '../lib/types'

/** Day presets (evening before / morning of) + minute presets + custom, with optional repeat */
export function ReminderPicker({ value, onChange, repeat, onRepeat, timed, dayPresets = true }: {
  value: ReminderSpec[]; onChange: (v: ReminderSpec[]) => void
  repeat?: ReminderRepeat | null; onRepeat?: (r: ReminderRepeat | null) => void
  timed: boolean; dayPresets?: boolean
}) {
  const presets: ReminderSpec[] = [
    ...(dayPresets ? [{ d: 1, t: '20:00' }, { d: 0, t: '07:00' }] : []),
    ...(timed ? [0, 10, 30, 60] : [0]),
    1440,
  ]
  const has = (r: ReminderSpec) => value.some(x => sameRem(x, r))
  const toggle = (r: ReminderSpec) => onChange(has(r) ? value.filter(x => !sameRem(x, r)) : [...value, r].sort(remSort))
  const custom = value.filter(v => !presets.some(p => sameRem(p, v)))

  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'day' | 'before'>('day')
  const [d, setD] = useState(1)
  const [t, setT] = useState('09:00')
  const [n, setN] = useState(2)
  const [unit, setUnit] = useState<1 | 60 | 1440>(60)
  const addCustom = () => {
    const r: ReminderSpec = mode === 'day' ? { d: Math.max(0, Math.min(60, d)), t } : Math.max(0, Math.round(n)) * unit
    if (!has(r)) onChange([...value, r].sort(remSort))
    setAdding(false)
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row wrap">
        {presets.map(p => {
          const on = has(p)
          return <button key={String(isDayRem(p) ? p.d + p.t : p)} type="button" className={`fchip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(p)}>{remLabel(p)}</button>
        })}
        {custom.map(c => (
          <span key={String(isDayRem(c) ? c.d + c.t : c)} className="fchip on" style={{ paddingInlineEnd: 4 }}>
            <Bell size={12} />{remLabel(c)}
            <button type="button" className="btn ghost icon sm" style={{ width: 22, minHeight: 22, color: 'inherit' }} aria-label={L('إزالة', 'Remove')} onClick={() => onChange(value.filter(x => !sameRem(x, c)))}><X size={13} /></button>
          </span>
        ))}
        {!adding && <button type="button" className="fchip" onClick={() => setAdding(true)}><Plus size={13} />{L('مخصص', 'Custom')}</button>}
      </div>

      {adding && (
        <div className="card flat col" style={{ padding: 12, gap: 10, background: 'var(--soft)' }}>
          <div className="btn-group" role="radiogroup" aria-label={L('نوع التذكير', 'Reminder type')}>
            <button type="button" role="radio" aria-checked={mode === 'day'} className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>{L('يوم ووقت محدد', 'Day & time')}</button>
            <button type="button" role="radio" aria-checked={mode === 'before'} className={mode === 'before' ? 'on' : ''} onClick={() => setMode('before')}>{L('قبل الموعد بمدة', 'Time before')}</button>
          </div>
          {mode === 'day' ? (
            <div className="row wrap">
              <select className="input" style={{ width: 'auto' }} value={d} onChange={e => setD(+e.target.value)} aria-label={L('اليوم', 'Day')}>
                <option value={0}>{L('في نفس اليوم', 'Same day')}</option>
                <option value={1}>{L('قبل يوم', '1 day before')}</option>
                <option value={2}>{L('قبل يومين', '2 days before')}</option>
                {[3, 4, 5, 6, 7, 10, 14, 30].map(x => <option key={x} value={x}>{L(`قبل ${x} ${x <= 10 ? 'أيام' : 'يوماً'}`, `${x} days before`)}</option>)}
              </select>
              <span className="small">{L('الساعة', 'at')}</span>
              <input className="input" type="time" style={{ width: 130 }} value={t} onChange={e => setT(e.target.value || '09:00')} aria-label={L('الوقت', 'Time')} />
            </div>
          ) : (
            <div className="row wrap">
              <span className="small">{L('قبل', 'Before by')}</span>
              <input className="input" type="number" min={1} max={999} inputMode="numeric" style={{ width: 90 }} value={n} onChange={e => setN(+e.target.value || 1)} aria-label={L('المدة', 'Amount')} />
              <select className="input" style={{ width: 'auto' }} value={unit} onChange={e => setUnit(+e.target.value as any)} aria-label={L('الوحدة', 'Unit')}>
                <option value={1}>{L('دقيقة', 'minutes')}</option>
                <option value={60}>{L('ساعة', 'hours')}</option>
                <option value={1440}>{L('يوم', 'days')}</option>
              </select>
            </div>
          )}
          <div className="row">
            <button type="button" className="btn primary sm" onClick={addCustom}><Plus size={14} />{L('إضافة التذكير', 'Add reminder')}</button>
            <button type="button" className="btn sm" onClick={() => setAdding(false)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      )}

      {onRepeat && value.length > 0 && (
        <div className="row wrap small">
          <Repeat size={15} className="muted" />
          <span>{L('تكرار التنبيه', 'Repeat alert')}</span>
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={repeat?.count ? repeat.every : 0}
            onChange={e => { const every = +e.target.value; onRepeat(every ? { every, count: repeat?.count || 2 } : null) }} aria-label={L('تكرار التنبيه', 'Repeat alert')}>
            <option value={0}>{L('بدون تكرار', 'No repeat')}</option>
            <option value={5}>{L('كل 5 دقائق', 'every 5 min')}</option>
            <option value={10}>{L('كل 10 دقائق', 'every 10 min')}</option>
            <option value={15}>{L('كل 15 دقيقة', 'every 15 min')}</option>
            <option value={30}>{L('كل 30 دقيقة', 'every 30 min')}</option>
            <option value={60}>{L('كل ساعة', 'every hour')}</option>
          </select>
          {!!repeat?.count && (
            <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={repeat.count} onChange={e => onRepeat({ ...repeat, count: +e.target.value })} aria-label={L('عدد المرات', 'Times')}>
              {[1, 2, 3, 4, 5].map(c => <option key={c} value={c}>{c === 1 ? L('مرة واحدة إضافية', '1 more time') : c === 2 ? L('مرتين إضافيتين', '2 more times') : L(`${c} مرات إضافية`, `${c} more times`)}</option>)}
            </select>
          )}
        </div>
      )}
      {onRepeat && !!repeat?.count && <span className="tiny muted">{L('يتوقف التكرار عند فتح التنبيه أو تجاهله، أو عند بدء الموعد.', 'Repeats stop when you open or dismiss the alert, or when the event starts.')}</span>}
    </div>
  )
}
