import { CalendarPlus, ListPlus, StickyNote, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp, type QuickAddDefaults } from '../app-context'
import { addDays, hmToMin, minToHM, startOfWeek, todayStr } from '../lib/dates'
import { save, uid, useCategories } from '../lib/db'
import { L } from '../lib/i18n'
import { newEvent, newTask } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import { catName, Modal, Seg, toast } from './ui'

export function QuickAdd({ defaults, onClose }: { defaults: QuickAddDefaults; onClose: () => void }) {
  const { settings, editTask, editEvent } = useApp()
  const cats = useCategories() || []
  const today = todayStr()
  const [kind, setKind] = useState<'task' | 'event' | 'note'>(defaults.kind || (defaults.time ? 'event' : 'task'))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<string | null>(defaults.date !== undefined ? defaults.date : today)
  const [time, setTime] = useState(defaults.time || '')
  const [cat, setCat] = useState(defaults.categoryId || '')
  const [err, setErr] = useState('')
  // one id per dialog: a double tap / double Enter overwrites the same record instead of creating a copy
  const ids = useRef({ task: uid(), event: uid(), note: uid() }).current
  const busy = useRef(false)

  const endFor = (t: string) => defaults.endTime || minToHM(hmToMin(t) + 60)
  const build = () => {
    if (kind === 'event') return newEvent({ id: ids.event, title: title.trim(), date: date || today, allDay: !time, startTime: time || null, endTime: time ? endFor(time) : null, categoryId: cat || null, reminders: settings.defaultReminders })
    return newTask({ id: ids.task, title: title.trim(), dueDate: date, startTime: time || null, endTime: time ? endFor(time) : null, categoryId: cat || null, projectId: defaults.projectId || null, reminders: date ? settings.defaultReminders : [] })
  }
  async function submit() {
    if (busy.current) return
    if (!title.trim()) return setErr(L('اكتب شيئاً أولاً', 'Type something first'))
    busy.current = true
    if (kind === 'note') {
      await save('notes', { id: ids.note, text: title.trim(), createdAt: Date.now() })
      toast(L('حُفظت في الوارد', 'Saved to inbox'))
    } else if (kind === 'event') { await save('events', build()); toast(L('أُضيف الموعد', 'Event added')) }
    else { await save('tasks', build()); toast(L('أُضيفت المهمة', 'Task added')) }
    scheduleSoon()
    onClose()
  }
  const more = () => {
    onClose()
    if (kind === 'event') editEvent(build() as any)
    else editTask(build() as any)
  }
  const dates: [string, string | null][] = [
    [L('اليوم', 'Today'), today], [L('غداً', 'Tomorrow'), addDays(today, 1)],
    [L('الأسبوع القادم', 'Next week'), addDays(startOfWeek(today, settings.weekStart), 7)],
    ...(kind === 'task' ? [[L('لاحقاً', 'Someday'), null] as [string, null]] : []),
  ]
  return (
    <Modal title={L('إضافة سريعة', 'Quick add')} icon={<Zap size={18} />} onClose={onClose}
      footer={<>
        <button className="btn primary" onClick={submit}>{L('إضافة', 'Add')}</button>
        {kind !== 'note' && <button className="btn" onClick={more}>{L('تفاصيل أكثر', 'More details')}</button>}
        <span className="grow" />
        <span className="tiny muted hide-m"><span className="kbd">Enter</span> {L('للإضافة', 'to add')}</span>
      </>}>
      <Seg label={L('النوع', 'Kind')} value={kind} onChange={setKind} options={[
        { v: 'task', l: <span className="row"><ListPlus size={15} />{L('مهمة', 'Task')}</span> },
        { v: 'event', l: <span className="row"><CalendarPlus size={15} />{L('موعد', 'Event')}</span> },
        { v: 'note', l: <span className="row"><StickyNote size={15} />{L('ملاحظة', 'Note')}</span> },
      ]} />
      {err && <div className="banner err" role="alert">{err}</div>}
      <label className="field"><span className="sr-only">{L('العنوان', 'Title')}</span>
        {kind === 'note'
          ? <textarea className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr('') }} placeholder={L('فكرة، طلب، تذكير… دون تصنيف أو تاريخ', 'Idea, request, reminder… no category or date needed')}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
          : <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr('') }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) { e.preventDefault(); submit() } }}
              placeholder={kind === 'task' ? L('عنوان المهمة', 'Task title') : L('عنوان الموعد', 'Event title')} />}
      </label>
      {kind !== 'note' && <>
        <div className="row wrap">
          {dates.map(([l, d]) => <button key={l} type="button" className={`fchip${date === d ? ' on' : ''}`} onClick={() => setDate(d)}>{l}</button>)}
          <input className="input" type="date" style={{ width: 160 }} value={date || ''} onChange={e => setDate(e.target.value || null)} aria-label={L('التاريخ', 'Date')} />
        </div>
        <div className="grid g2">
          <label className="field"><span>{L('الوقت (اختياري)', 'Time (optional)')}</span>
            <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!date} />
          </label>
          <label className="field"><span>{L('التصنيف (اختياري)', 'Category (optional)')}</span>
            <select className="input" value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">{L('— بدون —', '— None —')}</option>
              {cats.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
            </select>
          </label>
        </div>
      </>}
    </Modal>
  )
}
