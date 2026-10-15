import { CalendarPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app-context'
import { hmToMin, isValidDate, isValidTime, minToHM } from '../lib/dates'
import { db, remove, save, uid, useCategories } from '../lib/db'
import { EVENT_TYPE_LABEL, L, REMINDER_OPTIONS } from '../lib/i18n'
import { newEvent } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { CalEvent, EventType } from '../lib/types'
import { RecurrenceField } from './RecurrenceField'
import { catName, confirmDialog, Modal, Seg, Switch, toast } from './ui'

export const TYPE_COLORS: Record<string, string> = {
  work: '#2F5F98', meeting: '#2F5F98', personal: '#6D3BB0', deadline: '#C2453A', reminder: '#B4561B', occasion: '#AD3B7A',
  travel: '#00838F', break: '#627D98', focus: '#1F7A6D', leave: '#8A6100', holiday: '#2E7D32', task: '#334E68',
}
export const typeColor = (type: string, overrides: Record<string, string> = {}) => overrides[type] || TYPE_COLORS[type] || '#334E68'
export const EVENT_TYPES: EventType[] = ['work', 'meeting', 'personal', 'deadline', 'reminder', 'occasion', 'travel', 'focus', 'break']

export function EventEditor({ ev, instanceDate, onClose }: { ev: CalEvent | Partial<CalEvent>; instanceDate?: string; onClose: () => void }) {
  const { settings } = useApp()
  const cats = useCategories() || []
  const isNew = !(ev as any).updatedAt
  const [e, setE] = useState<CalEvent>(() => (isNew ? newEvent({ reminders: settings.defaultReminders, ...ev }) : { ...(ev as CalEvent) }))
  const recurringInstance = !isNew && !!e.recurrence && !!instanceDate && instanceDate !== e.date
  const [scope, setScope] = useState<'one' | 'all'>(recurringInstance ? 'one' : 'all')
  const [err, setErr] = useState('')
  const up = (c: Partial<CalEvent>) => setE(x => ({ ...x, ...c }))
  // when editing one occurrence, show that occurrence's date
  const [occDate, setOccDate] = useState(instanceDate || e.date)

  async function submit() {
    const title = e.title.trim()
    if (!title) return setErr(L('اكتب عنوان الموعد', 'Enter a title'))
    const date = scope === 'one' && e.recurrence ? occDate : e.date
    if (!isValidDate(date)) return setErr(L('تاريخ غير صالح', 'Invalid date'))
    if (e.endDate && e.endDate < date) return setErr(L('تاريخ النهاية قبل البداية', 'End date is before start'))
    if (!e.allDay) {
      if (!isValidTime(e.startTime) || !isValidTime(e.endTime)) return setErr(L('حدد وقت البداية والنهاية', 'Set start and end times'))
      if ((!e.endDate || e.endDate === date) && hmToMin(e.endTime) <= hmToMin(e.startTime)) return setErr(L('يجب أن ينتهي الموعد بعد بدايته', 'End must be after start'))
    }
    // duplicate guard: same title + date + start time already exists
    const dupe = (await db.events.where('date').equals(date).toArray()).find(x => !x.deleted && x.id !== e.id && x.title.trim() === title && (x.allDay ? e.allDay : x.startTime === e.startTime))
    if (dupe && isNew && !(await confirmDialog({ title: L('موعد مشابه موجود', 'Similar event exists'), body: L('يوجد موعد بنفس العنوان والوقت. هل تريد إضافته مع ذلك؟', 'An event with the same title and time already exists. Add anyway?'), ok: L('إضافة', 'Add') }))) return
    const clean = { ...e, title, endDate: e.endDate && e.endDate > date ? e.endDate : null, startTime: e.allDay ? null : e.startTime, endTime: e.allDay ? null : e.endTime }
    if (recurringInstance && scope === 'one') {
      const series = (await db.events.get(e.id))!
      await save('events', { ...series, exDates: [...(series.exDates || []), instanceDate!] })
      await save('events', { ...clean, id: uid(), date, recurrence: null, exDates: [] })
    } else {
      await save('events', { ...clean, date })
    }
    scheduleSoon()
    toast(isNew ? L('أُضيف الموعد', 'Event added') : L('تم الحفظ', 'Saved'))
    onClose()
  }

  async function del() {
    if (recurringInstance || (!isNew && e.recurrence)) {
      const choice = await confirmDialog({ title: L('حذف موعد متكرر', 'Delete repeating event'), body: e.title, ok: '', choices: [{ v: '1', l: L('هذا الموعد فقط', 'This occurrence'), danger: true }, { v: '2', l: L('السلسلة كاملة', 'Whole series'), danger: true }] })
      if (choice === '1') {
        const series = (await db.events.get(e.id))!
        await save('events', { ...series, exDates: [...(series.exDates || []), instanceDate || e.date] })
      } else if (choice === '2') await remove('events', e.id)
      else return
    } else {
      if (!(await confirmDialog({ title: L('حذف الموعد؟', 'Delete event?'), body: e.title, ok: L('حذف', 'Delete'), danger: true }))) return
      const snap = { ...e }
      await remove('events', e.id)
      toast(L('حُذف الموعد', 'Event deleted'), { action: { label: L('تراجع', 'Undo'), fn: () => save('events', snap) } })
    }
    scheduleSoon()
    onClose()
  }

  return (
    <Modal wide title={isNew ? L('موعد جديد', 'New event') : L('تعديل الموعد', 'Edit event')} icon={<CalendarPlus size={18} />} onClose={onClose}
      footer={<>
        <button className="btn primary" onClick={submit}>{L('حفظ', 'Save')}</button>
        <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
        <span className="grow" />
        {!isNew && <button className="btn ghost icon sm danger" onClick={del} aria-label={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
      </>}>
      {err && <div className="banner err" role="alert">{err}</div>}
      {recurringInstance && (
        <Seg label={L('نطاق التعديل', 'Edit scope')} value={scope} onChange={setScope}
          options={[{ v: 'one', l: L('هذا الموعد فقط', 'This occurrence') }, { v: 'all', l: L('كل السلسلة', 'Whole series') }]} />
      )}
      <label className="field"><span>{L('العنوان', 'Title')} *</span>
        <input className="input" value={e.title} onChange={x => { up({ title: x.target.value }); setErr('') }} />
      </label>
      <div className="field"><span>{L('النوع', 'Type')}</span>
        <div className="row wrap">
          {EVENT_TYPES.map(tp => (
            <button key={tp} type="button" className={`fchip${e.type === tp ? ' on' : ''}`} aria-pressed={e.type === tp} onClick={() => up({ type: tp, allDay: tp === 'deadline' || tp === 'occasion' ? true : e.allDay })}>
              <span className="dot" style={{ ['--c' as any]: typeColor(tp, settings.typeColors) }} />{(EVENT_TYPE_LABEL() as any)[tp]}
            </button>
          ))}
        </div>
      </div>
      <div className="row"><Switch label={L('طوال اليوم', 'All day')} checked={e.allDay} onChange={v => up({ allDay: v, startTime: v ? e.startTime : e.startTime || '09:00', endTime: v ? e.endTime : e.endTime || '10:00' })} /><b className="small">{L('طوال اليوم', 'All day')}</b></div>
      <div className="grid g2">
        <label className="field"><span>{L('التاريخ', 'Date')}</span>
          <input className="input" type="date" value={scope === 'one' && e.recurrence ? occDate : e.date} onChange={x => (scope === 'one' && e.recurrence ? setOccDate(x.target.value) : up({ date: x.target.value }))} />
        </label>
        <label className="field"><span>{L('حتى تاريخ (متعدد الأيام)', 'End date (multi-day)')}</span>
          <input className="input" type="date" value={e.endDate || ''} onChange={x => up({ endDate: x.target.value || null })} />
        </label>
        {!e.allDay && <>
          <label className="field"><span>{L('من', 'Start')}</span>
            <input className="input" type="time" value={e.startTime || ''} onChange={x => {
              const dur = hmToMin(e.endTime) - hmToMin(e.startTime)
              up({ startTime: x.target.value, endTime: x.target.value && dur > 0 ? minToHM(hmToMin(x.target.value) + dur) : e.endTime })
            }} />
          </label>
          <label className="field"><span>{L('إلى', 'End')}</span>
            <input className="input" type="time" value={e.endTime || ''} onChange={x => up({ endTime: x.target.value })} />
          </label>
        </>}
        <label className="field"><span>{L('المكان', 'Location')}</span>
          <input className="input" value={e.location || ''} onChange={x => up({ location: x.target.value })} />
        </label>
        <label className="field"><span>{L('التصنيف', 'Category')}</span>
          <select className="input" value={e.categoryId || ''} onChange={x => up({ categoryId: x.target.value || null })}>
            <option value="">{L('— بدون —', '— None —')}</option>
            {cats.filter(c => !c.archived || c.id === e.categoryId).map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </select>
        </label>
      </div>
      {scope === 'all' && <div className="field"><span>{L('تكرار', 'Repeat')}</span><RecurrenceField value={e.recurrence || null} start={e.date} onChange={r => up({ recurrence: r })} /></div>}
      <div className="field"><span>{L('التذكير', 'Reminders')}</span>
        <div className="row wrap">
          {REMINDER_OPTIONS().map(o => {
            const on = e.reminders?.includes(o.v)
            return <button key={o.v} type="button" className={`fchip${on ? ' on' : ''}`} aria-pressed={on}
              onClick={() => up({ reminders: on ? e.reminders!.filter(x => x !== o.v) : [...(e.reminders || []), o.v] })}>{o.l}</button>
          })}
        </div>
      </div>
      <label className="field"><span>{L('ملاحظات', 'Notes')}</span>
        <textarea className="input" value={e.notes || ''} onChange={x => up({ notes: x.target.value })} />
      </label>
    </Modal>
  )
}
