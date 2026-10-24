import { CalendarClock, Star, Sunrise } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app-context'
import { Modal, toast } from '../components/ui'
import { addDays, dow, fmtLong, fmtTime, relDay, todayStr } from '../lib/dates'
import { db, save, useEvents, useTasks } from '../lib/db'
import { L, PRIORITY_LABEL } from '../lib/i18n'
import { emptySlots, expandEvents, isOpen, normSlots, rescheduleTask } from '../lib/logic'
import { PRIORITY_SLOTS } from '../lib/types'
import { scheduleSoon } from '../lib/notify'

export function PlanTomorrow({ onClose }: { onClose: () => void }) {
  const { settings } = useApp()
  const today = todayStr()
  // if tomorrow is a weekend day, offer the next workday
  const nextWork = useMemo(() => { let d = addDays(today, 1); for (let i = 0; i < 7 && !settings.workdays.includes(dow(d)); i++) d = addDays(d, 1); return d }, [today])
  const [target, setTarget] = useState(nextWork)
  const tasks = useTasks() || []
  const events = useEvents() || []
  const leftover = tasks.filter(t => isOpen(t) && t.dueDate && t.dueDate <= today).sort((a, b) => rank(b) - rank(a))
  const [move, setMove] = useState<Set<string> | null>(null)
  const moveSet = move ?? new Set(leftover.filter(t => t.priority === 'high' || t.priority === 'urgent').map(t => t.id))
  const toggle = (id: string) => { const n = new Set(moveSet); n.has(id) ? n.delete(id) : n.add(id); setMove(n) }
  const targetTasks = [...tasks.filter(t => isOpen(t) && t.dueDate === target), ...leftover.filter(t => moveSet.has(t.id))]
  const [prios, setPrios] = useState<string[] | null>(null)
  const chosen = prios ?? []
  const appts = expandEvents(events, target, target, settings.workdays).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const pick = (id: string) => setPrios(chosen.includes(id) ? chosen.filter(x => x !== id) : chosen.length >= PRIORITY_SLOTS ? chosen : [...chosen, id])

  const submit = async () => {
    for (const t of leftover.filter(t => moveSet.has(t.id))) await rescheduleTask(t, target)
    const day = (await db.days.get(target)) || { id: target, updatedAt: 0, priorities: emptySlots() }
    const existing = (day.deleted ? emptySlots() : normSlots(day.priorities)) as any[]
    const slots = existing.map((_, i) => {
      const id = chosen[i]
      if (!id) return existing[i] || null
      const t = targetTasks.find(x => x.id === id)!
      return { title: t.title, taskId: t.id, priority: t.priority, estMin: t.estMin, done: false }
    })
    const planned = [...new Set([...(day.planned || []), ...targetTasks.map(t => t.id)])]
    await save('days', { ...day, deleted: 0, priorities: slots, planned })
    scheduleSoon()
    toast(L('خطة الغد جاهزة', 'Tomorrow is planned'))
    onClose()
  }

  return (
    <Modal wide title={L('خطّط للغد', 'Plan Tomorrow')} icon={<Sunrise size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={submit}>{L('حفظ الخطة', 'Save plan')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
    </>}>
      <div className="row wrap">
        <b>{fmtLong(target)}</b>
        {target !== nextWork && <button className="btn ghost sm" onClick={() => { setTarget(nextWork); setPrios(null) }}>{L('خطط ليوم العمل التالي بدلاً من ذلك', 'Plan the next workday instead')} ({relDay(nextWork)})</button>}
        {target !== addDays(today, 1) && <button className="btn ghost sm" onClick={() => { setTarget(addDays(today, 1)); setPrios(null) }}>{L('الغد', 'Tomorrow')}</button>}
      </div>

      <div>
        <div className="section-title">1. {L('ما الذي لم يكتمل؟ اختر ما ينتقل إلى', 'Unfinished — choose what moves to')} {relDay(target)}</div>
        {leftover.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{L('لا مهام معلّقة. ممتاز.', 'Nothing left over. Great.')}</p> : leftover.map(t => (
          <label key={t.id} className="list-item check" style={{ fontWeight: 500 }}>
            <input type="checkbox" checked={moveSet.has(t.id)} onChange={() => toggle(t.id)} />
            <span className="grow">{t.title}</span>
            {t.priority !== 'normal' && <span className={`pill ${t.priority === 'urgent' ? 'rose' : t.priority === 'high' ? 'saffron' : ''}`}>{(PRIORITY_LABEL() as any)[t.priority]}</span>}
            <span className="tiny muted nowrap">{relDay(t.dueDate!)}</span>
          </label>
        ))}
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>{L('غير المحدد يبقى في مكانه دون تغيير — لا يُؤجَّل شيء تلقائياً.', 'Unchecked items stay where they are — nothing is postponed automatically.')}</p>
      </div>

      <div>
        <div className="section-title">2. {L('مواعيد', 'Appointments on')} {relDay(target)}</div>
        {appts.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{L('لا مواعيد.', 'No appointments.')}</p> : appts.map(e => (
          <div key={e.id + e.instanceDate} className="row small" style={{ padding: '3px 0' }}><CalendarClock size={14} className="muted" /><span className="iso nowrap muted" style={{ minWidth: 70 }}>{e.allDay ? L('طوال اليوم', 'All day') : fmtTime(e.startTime)}</span><span>{e.title}</span></div>
        ))}
      </div>

      <div>
        <div className="section-title">3. {L('اختر حتى 5 أولويات', 'Pick up to five priorities')} ({chosen.length}/{PRIORITY_SLOTS})</div>
        {targetTasks.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{L('لا مهام لهذا اليوم بعد — يمكنك تحديد الأولويات لاحقاً من صفحة اليوم.', 'No tasks for that day yet — you can set priorities later on the Today page.')}</p> : (
          <div className="row wrap">
            {targetTasks.map(t => {
              const i = chosen.indexOf(t.id)
              return <button key={t.id} className={`fchip${i >= 0 ? ' on' : ''}`} aria-pressed={i >= 0} disabled={i < 0 && chosen.length >= PRIORITY_SLOTS} onClick={() => pick(t.id)}>{i >= 0 ? <b>{i + 1}</b> : <Star size={13} />}{t.title}</button>
            })}
          </div>
        )}
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>{L('لا تُملأ ساعات اليوم تلقائياً؛ اترك مساحة للطوارئ.', 'Hours are not auto-filled; leave room for the unexpected.')}</p>
      </div>
    </Modal>
  )
}
const rank = (t: { priority: string }) => ({ urgent: 3, high: 2, normal: 1, low: 0 } as any)[t.priority]
