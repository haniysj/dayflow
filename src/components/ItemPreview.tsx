import { Bell, CalendarClock, CheckCircle2, Clock, FolderKanban, Hourglass, Link2, ListChecks, MapPin, Pencil, Repeat, RotateCcw, StickyNote, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../app-context'
import { addDays, diffDays, fmtDuration, fmtLong, fmtShort, fmtTime, relDay, todayStr } from '../lib/dates'
import { save, useCategories, useEvents, useProjects, useTasks } from '../lib/db'
import { EVENT_TYPE_LABEL, L, PRIORITY_LABEL, STATUS_LABEL } from '../lib/i18n'
import { remLabel, remSort, repeatLabel } from '../lib/reminders'
import { isOverdue } from '../lib/logic'
import type { CalEvent, Recurrence, ReminderRepeat, ReminderSpec, Task } from '../lib/types'
import { typeColor } from './EventEditor'
import { quickComplete } from './TaskRow'
import { CheckIcon } from './TaskEditor'
import { CatPill, Modal } from './ui'

export type PreviewTarget = { kind: 'event'; event: CalEvent; date: string } | { kind: 'task'; task: Task }

const DAYS = () => [L('الأحد', 'Sun'), L('الإثنين', 'Mon'), L('الثلاثاء', 'Tue'), L('الأربعاء', 'Wed'), L('الخميس', 'Thu'), L('الجمعة', 'Fri'), L('السبت', 'Sat')]
function recurrenceText(r: Recurrence) {
  const n = r.interval || 1
  let s = ''
  if (r.workdaysOnly) s = L('كل أيام العمل', 'Every workday')
  else if (r.freq === 'daily') s = n === 1 ? L('يومياً', 'Daily') : L(`كل ${n} أيام`, `Every ${n} days`)
  else if (r.freq === 'weekly') s = (n === 1 ? L('أسبوعياً', 'Weekly') : L(`كل ${n} أسابيع`, `Every ${n} weeks`)) + (r.byDay?.length ? ' · ' + r.byDay.map(d => DAYS()[d]).join('، ') : '')
  else if (r.freq === 'monthly') s = n === 1 ? L('شهرياً', 'Monthly') : L(`كل ${n} أشهر`, `Every ${n} months`)
  else s = L('سنوياً', 'Yearly')
  return r.until ? `${s} · ${L('حتى', 'until')} ${fmtShort(r.until)}` : s
}
const reminderText = (list?: ReminderSpec[], rep?: ReminderRepeat | null) =>
  [(list || []).slice().sort(remSort).map(remLabel).join('، '), repeatLabel(rep)].filter(Boolean).join(' · ')

/** "اليوم / غداً / بعد 3 أيام / قبل يومين" */
function relText(d: string, today: string) {
  const n = diffDays(d, today), a = Math.abs(n)
  if (n === 0) return L('اليوم', 'Today')
  if (n === 1) return L('غداً', 'Tomorrow')
  if (n === -1) return L('أمس', 'Yesterday')
  const ar = a === 2 ? 'يومين' : a <= 10 ? `${a} أيام` : `${a} يوماً`
  return n > 0 ? L(`بعد ${ar}`, `in ${a} days`) : L(`قبل ${ar}`, `${a} days ago`)
}

const Line = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
    <span className="muted" style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
    <div className="grow" style={{ overflowWrap: 'anywhere' }}>{children}</div>
  </div>
)

/** Read-only details sheet for a calendar entry, with a pencil button to open the editor */
export function ItemPreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const { editTask, editEvent, settings } = useApp()
  const tasks = useTasks() || []
  const events = useEvents() || []
  const cats = useCategories() || []
  const projects = useProjects() || []
  const today = todayStr()

  // always show the latest saved version
  const task = target.kind === 'task' ? tasks.find(t => t.id === target.task.id) ?? target.task : null
  const event = target.kind === 'event' ? events.find(e => e.id === target.event.id) ?? target.event : null
  if ((task && task.deleted) || (event && event.deleted)) { setTimeout(onClose); return null }

  const edit = () => {
    onClose()
    setTimeout(() => (task ? editTask(task) : editEvent(event!, target.kind === 'event' ? target.date : undefined)), 30)
  }
  const color = task ? (cats.find(c => c.id === task.categoryId)?.color || typeColor('task', settings.typeColors)) : typeColor(event!.type, settings.typeColors)
  const title = task ? task.title : event!.title

  let body: ReactNode
  if (event) {
    const date = target.kind === 'event' ? target.date : event.date
    const span = event.endDate && event.endDate > event.date ? diffDays(event.endDate, event.date) : 0
    const end = addDays(date, span)
    body = <>
      <Line icon={<CalendarClock size={17} />}>
        <b>{fmtLong(date)}</b>{span > 0 && <> – <b>{fmtLong(end)}</b></>}
        <div className="small muted">{relText(date, today)}</div>
      </Line>
      <Line icon={<Clock size={17} />}>{event.allDay ? L('طوال اليوم', 'All day') : <span style={{ unicodeBidi: 'isolate' }}>{fmtTime(event.startTime)} – {fmtTime(event.endTime)}</span>}</Line>
      {event.location && <Line icon={<MapPin size={17} />}>{event.location}</Line>}
      {event.recurrence && <Line icon={<Repeat size={17} />}>{recurrenceText(event.recurrence)}</Line>}
      {!!event.reminders?.length && <Line icon={<Bell size={17} />}>{reminderText(event.reminders, event.reminderRepeat)}</Line>}
      {event.notes && <Line icon={<StickyNote size={17} />}><div style={{ whiteSpace: 'pre-wrap' }}>{event.notes}</div></Line>}
    </>
  } else {
    const t = task!
    const done = t.status === 'completed'
    const subDone = t.subtasks?.filter(s => s.done).length || 0
    body = <>
      <Line icon={<CalendarClock size={17} />}>
        {t.dueDate ? <><b>{fmtLong(t.dueDate)}</b><div className="small muted">{relText(t.dueDate, today)}{isOverdue(t, today) ? ' · ' + L('متأخرة', 'Overdue') : ''}</div></> : <span className="muted">{L('بدون تاريخ (لاحقاً)', 'No date (someday)')}</span>}
        {t.originalDueDate && t.originalDueDate !== t.dueDate && <div className="tiny muted">{L('الاستحقاق الأصلي:', 'Originally due:')} {fmtShort(t.originalDueDate)}</div>}
      </Line>
      {(t.startTime || t.estMin) && <Line icon={<Clock size={17} />}>
        {t.startTime && <span style={{ unicodeBidi: 'isolate' }}>{fmtTime(t.startTime)}{t.endTime ? ` – ${fmtTime(t.endTime)}` : ''}</span>}
        {t.startTime && t.estMin ? ' · ' : ''}{t.estMin ? `${L('مقدّر', 'Est.')} ${fmtDuration(t.estMin)}` : ''}
      </Line>}
      {t.projectId && <Line icon={<FolderKanban size={17} />}>{projects.find(p => p.id === t.projectId)?.name}</Line>}
      {(t.followUpDate || t.contact) && <Line icon={<UserRound size={17} />}>{L('متابعة', 'Follow up')}{t.contact ? ` ${L('مع', 'with')} ${t.contact}` : ''}{t.followUpDate ? ` · ${relDay(t.followUpDate, today)}` : ''}</Line>}
      {t.recurrence && <Line icon={<Repeat size={17} />}>{recurrenceText(t.recurrence)}</Line>}
      {!!t.reminders?.length && <Line icon={<Bell size={17} />}>{reminderText(t.reminders, t.reminderRepeat)}</Line>}
      {!!t.subtasks?.length && <Line icon={<ListChecks size={17} />}>
        <div className="small muted" style={{ marginBottom: 4 }}>{L('المهام الفرعية', 'Subtasks')} <span className="ltr">{subDone}/{t.subtasks.length}</span></div>
        <div className="col" style={{ gap: 4 }}>
          {t.subtasks.map((s, i) => (
            <label key={s.id} className="row small" style={{ cursor: 'pointer' }}>
              <button type="button" className={`cbx${s.done ? ' on' : ''}`} style={{ width: 20, height: 20 }} aria-pressed={s.done} aria-label={s.title}
                onClick={() => save('tasks', { ...t, subtasks: t.subtasks!.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}>{s.done && <CheckIcon />}</button>
              <span className={s.done ? 'strike' : ''}>{s.title}</span>
            </label>
          ))}
        </div>
      </Line>}
      {t.desc && <Line icon={<StickyNote size={17} />}><div style={{ whiteSpace: 'pre-wrap' }}>{t.desc}</div></Line>}
      {t.notes && <Line icon={<StickyNote size={17} />}><div style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</div></Line>}
      {!!t.links?.length && <Line icon={<Link2 size={17} />}><div className="col" style={{ gap: 2 }}>{t.links.map((l, i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="ltr ellipsis" style={{ maxWidth: '100%' }}>{l}</a>)}</div></Line>}
      {done && t.completedAt && <Line icon={<CheckCircle2 size={17} />}>{L('أُنجزت', 'Completed')} {relDay(new Date(t.completedAt).toISOString().slice(0, 10), today)}</Line>}
    </>
  }

  return (
    <Modal onClose={onClose}
      title={<span className="row" style={{ gap: 8, minWidth: 0 }}><span className="dot" style={{ ['--c' as any]: color, width: 10, height: 10 }} /><span style={{ overflowWrap: 'anywhere', textDecoration: task?.status === 'completed' ? 'line-through' : undefined }}>{title}</span></span>}
      footer={<>
        <button className="btn primary" onClick={edit}><Pencil size={16} />{L('تعديل', 'Edit')}</button>
        {task && <button className="btn" onClick={async () => { await quickComplete(task, settings) }}>
          {task.status === 'completed' ? <><RotateCcw size={16} />{L('إعادة فتح', 'Reopen')}</> : <><CheckCircle2 size={16} />{L('إنجاز', 'Complete')}</>}
        </button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>{L('إغلاق', 'Close')}</button>
      </>}>
      <div className="row wrap" style={{ gap: 6 }}>
        {event && <span className="pill c" style={{ ['--c' as any]: color }}>{(EVENT_TYPE_LABEL() as any)[event.type]}</span>}
        {task && <span className="pill c" style={{ ['--c' as any]: typeColor('task', settings.typeColors) }}>{L('مهمة', 'Task')}</span>}
        {task && <span className={`pill${task.status === 'completed' ? ' teal' : task.status === 'waiting' ? ' saffron' : ''}`}>{task.status === 'waiting' && <Hourglass size={11} />}{(STATUS_LABEL() as any)[task.status]}</span>}
        {task && task.priority !== 'normal' && <span className={`pill ${task.priority === 'urgent' ? 'rose' : task.priority === 'high' ? 'saffron' : ''}`}>{(PRIORITY_LABEL() as any)[task.priority]}</span>}
        <CatPill cat={cats.find(c => c.id === (task ? task.categoryId : event!.categoryId))} />
        {(task?.demo || event?.demo) && <span className="pill outline">{L('تجريبي', 'Demo')}</span>}
      </div>
      <div className="col" style={{ gap: 12 }}>{body}</div>
    </Modal>
  )
}
