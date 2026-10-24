import { CalendarDays, CheckCircle2, Copy, Link2, ListChecks, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../app-context'
import { addDays, isValidDate, isValidTime, startOfWeek, todayStr, hmToMin, fmtShort, fmtNumeric } from '../lib/dates'
import { remove, save, uid, useCategories, useProjects } from '../lib/db'
import { L, PRIORITY_LABEL, STATUS_LABEL } from '../lib/i18n'
import { ReminderPicker } from './ReminderPicker'
import { completeTask, newTask, reopenTask } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { Priority, Recurrence, Task, TaskStatus } from '../lib/types'
import { catName, confirmDialog, Modal, toast } from './ui'
import { RecurrenceField } from './RecurrenceField'

export function TaskEditor({ task, onClose }: { task: Task | Partial<Task>; onClose: () => void }) {
  const { settings } = useApp()
  const cats = useCategories() || []
  const projects = useProjects() || []
  const isNew = !(task as any).updatedAt
  const [t, setT] = useState<Task>(() => (isNew ? newTask({ reminders: settings.defaultReminders, ...task }) : { ...(task as Task) }))
  const [err, setErr] = useState('')
  const [more, setMore] = useState(!isNew)
  const busy = useRef(false)
  const up = (c: Partial<Task>) => setT(x => ({ ...x, ...c }))
  const today = todayStr()

  const setDue = (d: string | null) => {
    const orig = (task as Task).dueDate
    up({
      dueDate: d,
      status: d ? (t.status === 'inbox' ? 'planned' : t.status) : t.status === 'planned' ? 'inbox' : t.status,
      ...(!isNew && orig && d !== orig ? { originalDueDate: t.originalDueDate ?? orig } : {}),
    })
  }

  async function submit() {
    if (busy.current) return
    const title = t.title.trim()
    if (!title) return setErr(L('اكتب عنوان المهمة', 'Enter a task title'))
    for (const d of [t.dueDate, t.startDate, t.followUpDate]) if (d && !isValidDate(d)) return setErr(L('تاريخ غير صالح', 'Invalid date'))
    if (t.startTime && !isValidTime(t.startTime)) return setErr(L('وقت البداية غير صالح', 'Invalid start time'))
    if (t.endTime && !t.startTime) return setErr(L('حدد وقت البداية أولاً', 'Set a start time first'))
    if (t.startTime && t.endTime && hmToMin(t.endTime) <= hmToMin(t.startTime)) return setErr(L('يجب أن ينتهي الوقت بعد بدايته', 'End time must be after start time'))
    if (t.startTime && !t.dueDate) return setErr(L('الوقت يحتاج إلى تاريخ', 'A time needs a date'))
    if (t.startDate && t.dueDate && t.startDate > t.dueDate) return setErr(L('تاريخ البدء بعد تاريخ الاستحقاق', 'Start date is after the due date'))
    busy.current = true
    const orig = (task as Task).dueDate
    const rescheduled = !isNew && orig && t.dueDate !== orig
    onClose()
    await save('tasks', {
      ...t, title, demo: false,
      rescheduleCount: (t.rescheduleCount || 0) + (rescheduled ? 1 : 0),
      links: (t.links || []).map(l => l.trim()).filter(Boolean),
      subtasks: (t.subtasks || []).filter(s => s.title.trim()),
      estMin: t.estMin ? Math.max(0, Math.round(t.estMin)) : null,
      actualMin: t.actualMin ? Math.max(0, Math.round(t.actualMin)) : null,
    })
    scheduleSoon()
    toast(isNew ? L('أُضيفت المهمة', 'Task added') : L('تم الحفظ', 'Saved'))
  }

  async function del() {
    if (!(await confirmDialog({ title: L('حذف المهمة؟', 'Delete task?'), body: t.title, ok: L('حذف', 'Delete'), danger: true }))) return
    const snapshot = { ...t }
    await remove('tasks', t.id)
    scheduleSoon()
    toast(L('حُذفت المهمة', 'Task deleted'), { action: { label: L('تراجع', 'Undo'), fn: () => save('tasks', snapshot) } })
    onClose()
  }

  async function toggleDone() {
    if (t.status === 'completed') { await reopenTask(t); onClose(); return }
    await save('tasks', t)
    const r = await completeTask(t, settings)
    toast(r.next ? L('أُنجزت — أُنشئ الموعد التالي', 'Done — next occurrence created') : L('أُنجزت المهمة ✓', 'Task completed ✓'), { action: { label: L('تراجع', 'Undo'), fn: r.undo } })
    scheduleSoon()
    onClose()
  }

  async function duplicate() {
    await save('tasks', { ...t, demo: false, id: uid(), createdAt: Date.now(), status: t.dueDate ? 'planned' : 'inbox', completedAt: null, title: t.title + L(' (نسخة)', ' (copy)') })
    toast(L('أُنشئت نسخة', 'Duplicated'))
    onClose()
  }

  const quickDates: [string, string | null][] = [
    [L('اليوم', 'Today'), today],
    [L('غداً', 'Tomorrow'), addDays(today, 1)],
    [L('الأسبوع القادم', 'Next week'), addDays(startOfWeek(today, settings.weekStart), 7)],
    [L('لاحقاً', 'Someday'), null],
  ]
  const projs = projects.filter(p => p.status !== 'archived' && (!t.categoryId || !p.categoryId || p.categoryId === t.categoryId))

  return (
    <Modal wide title={isNew ? L('مهمة جديدة', 'New task') : L('تعديل المهمة', 'Edit task')} icon={<ListChecks size={18} />} onClose={onClose}
      footer={<>
        <button className="btn primary" onClick={submit}>{L('حفظ', 'Save')}</button>
        <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
        <span className="grow" />
        {!isNew && <button className="btn ghost sm" onClick={toggleDone}><CheckCircle2 size={16} />{t.status === 'completed' ? L('إعادة فتح', 'Reopen') : L('إنجاز', 'Complete')}</button>}
        {!isNew && <button className="btn ghost icon sm" onClick={duplicate} aria-label={L('نسخ', 'Duplicate')} title={L('نسخ', 'Duplicate')}><Copy size={16} /></button>}
        {!isNew && <button className="btn ghost icon sm danger" onClick={del} aria-label={L('حذف', 'Delete')} title={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
      </>}>
      {err && <div className="banner err" role="alert">{err}</div>}
      <label className="field"><span>{L('العنوان', 'Title')} *</span>
        <input className="input" value={t.title} onChange={e => { up({ title: e.target.value }); setErr('') }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) { e.preventDefault(); submit() } }} placeholder={L('ماذا تريد أن تنجز؟', 'What needs doing?')} />
      </label>
      <div className="field"><span>{L('تاريخ الاستحقاق', 'Due date')}</span>
        <div className="row wrap">
          {quickDates.map(([l, d]) => <button key={l} type="button" className={`fchip${t.dueDate === d ? ' on' : ''}`} onClick={() => setDue(d)}>{l}</button>)}
          <input className="input" type="date" style={{ width: 170 }} value={t.dueDate || ''} onChange={e => setDue(e.target.value || null)} aria-label={L('تاريخ الاستحقاق', 'Due date')} />
        </div>
        {t.originalDueDate && t.originalDueDate !== t.dueDate && <span className="tiny muted">{L('الاستحقاق الأصلي:', 'Original due:')} <span className="iso">{fmtNumeric(t.originalDueDate)}</span> · {L('أُجّلت', 'moved')} {t.rescheduleCount || 0}×</span>}
      </div>
      <div className="grid g3">
        <label className="field"><span>{L('الأولوية', 'Priority')}</span>
          <select className="input" value={t.priority} onChange={e => up({ priority: e.target.value as Priority })}>
            {Object.entries(PRIORITY_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>{L('التصنيف', 'Category')}</span>
          <select className="input" value={t.categoryId || ''} onChange={e => up({ categoryId: e.target.value || null })}>
            <option value="">{L('— بدون —', '— None —')}</option>
            {cats.filter(c => !c.archived || c.id === t.categoryId).map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </select>
        </label>
        <label className="field"><span>{L('الحالة', 'Status')}</span>
          <select className="input" value={t.status} onChange={e => up({ status: e.target.value as TaskStatus, completedAt: e.target.value === 'completed' ? t.completedAt || Date.now() : null })}>
            {Object.entries(STATUS_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="grid g3">
        <label className="field"><span>{L('من', 'Start time')}</span>
          <input className="input" type="time" value={t.startTime || ''} onChange={e => up({ startTime: e.target.value || null })} />
        </label>
        <label className="field"><span>{L('إلى', 'End time')}</span>
          <input className="input" type="time" value={t.endTime || ''} onChange={e => up({ endTime: e.target.value || null })} />
        </label>
        <label className="field"><span>{L('المدة المقدّرة (دقيقة)', 'Estimate (min)')}</span>
          <input className="input" type="number" min={0} step={5} inputMode="numeric" value={t.estMin ?? ''} onChange={e => up({ estMin: e.target.value ? +e.target.value : null })} />
        </label>
      </div>
      <div className="field"><span>{L('التذكير', 'Reminders')}</span>
        <ReminderPicker timed={!!t.startTime} dayPresets={!!t.dueDate} value={t.reminders || []} onChange={v => up({ reminders: v })} repeat={t.reminderRepeat} onRepeat={r => up({ reminderRepeat: r })} />
        {!t.startTime && !!t.reminders?.length && <span className="tiny muted">{L(`بدون وقت محدد، يُحسب التذكير من الساعة ${settings.defaultReminderTime}`, `Without a time, reminders count from ${settings.defaultReminderTime}`)}</span>}
      </div>

      {!more ? <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(true)}><Plus size={15} />{L('تفاصيل إضافية', 'More details')}</button> : <>
        <label className="field"><span>{L('الوصف', 'Description')}</span>
          <textarea className="input" value={t.desc || ''} onChange={e => up({ desc: e.target.value })} />
        </label>
        <div className="grid g2">
          <label className="field"><span>{L('المشروع', 'Project')}</span>
            <select className="input" value={t.projectId || ''} onChange={e => up({ projectId: e.target.value || null })}>
              <option value="">{L('— بدون —', '— None —')}</option>
              {projs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{L('تاريخ البدء', 'Start date')}</span>
            <input className="input" type="date" value={t.startDate || ''} onChange={e => up({ startDate: e.target.value || null })} />
          </label>
          <label className="field"><span>{L('تاريخ المتابعة', 'Follow-up date')}</span>
            <input className="input" type="date" value={t.followUpDate || ''} onChange={e => up({ followUpDate: e.target.value || null })} />
          </label>
          <label className="field"><span>{L('الشخص / الجهة للمتابعة', 'Follow up with')}</span>
            <input className="input" value={t.contact || ''} onChange={e => up({ contact: e.target.value })} />
          </label>
          <label className="field"><span>{L('المدة الفعلية (دقيقة)', 'Actual (min)')}</span>
            <input className="input" type="number" min={0} step={5} inputMode="numeric" value={t.actualMin ?? ''} onChange={e => up({ actualMin: e.target.value ? +e.target.value : null })} />
          </label>
          <div className="field"><span>{L('تكرار', 'Repeat')}</span>
            <RecurrenceField value={t.recurrence || null} start={t.dueDate || today} onChange={(r: Recurrence | null) => up({ recurrence: r })} />
            {t.recurrence && !t.dueDate && <span className="tiny" style={{ color: 'var(--overdue)' }}>{L('التكرار يحتاج تاريخ استحقاق', 'Repeat needs a due date')}</span>}
          </div>
        </div>
        <div className="field"><span className="row"><ListChecks size={15} />{L('مهام فرعية', 'Subtasks')}</span>
          {(t.subtasks || []).map((s, i) => (
            <div key={s.id} className="row">
              <button type="button" className={`cbx${s.done ? ' on' : ''}`} aria-pressed={s.done} aria-label={L('إنجاز', 'Done')} onClick={() => up({ subtasks: t.subtasks!.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}>{s.done && <CheckIcon />}</button>
              <input className="input" value={s.title} onChange={e => up({ subtasks: t.subtasks!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <button type="button" className="btn ghost icon sm" aria-label={L('حذف', 'Remove')} onClick={() => up({ subtasks: t.subtasks!.filter((_, j) => j !== i) })}><X size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ subtasks: [...(t.subtasks || []), { id: uid(), title: '', done: false }] })}><Plus size={14} />{L('إضافة مهمة فرعية', 'Add subtask')}</button>
        </div>
        <label className="field"><span>{L('ملاحظات', 'Notes')}</span>
          <textarea className="input" value={t.notes || ''} onChange={e => up({ notes: e.target.value })} />
        </label>
        <div className="field"><span className="row"><Link2 size={15} />{L('روابط', 'Links')}</span>
          {(t.links || []).map((l, i) => (
            <div key={i} className="row">
              <input className="input ltr" style={{ display: 'block' }} type="url" value={l} placeholder="https://" onChange={e => up({ links: t.links!.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="btn ghost icon sm" aria-label={L('حذف', 'Remove')} onClick={() => up({ links: t.links!.filter((_, j) => j !== i) })}><X size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ links: [...(t.links || []), ''] })}><Plus size={14} />{L('إضافة رابط', 'Add link')}</button>
        </div>
        {!isNew && <p className="tiny muted" style={{ margin: 0 }}><CalendarDays size={12} /> {L('أُنشئت', 'Created')} {fmtShort(new Date(t.createdAt).toISOString().slice(0, 10))}{t.completedAt ? ` · ${L('أُنجزت', 'Completed')} ${fmtShort(new Date(t.completedAt).toISOString().slice(0, 10))}` : ''}{t.recurrence ? <> · <Repeat size={12} /></> : null}</p>}
      </>}
    </Modal>
  )
}

export const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
