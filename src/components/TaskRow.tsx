import { ArrowLeftRight, CalendarArrowUp, CalendarClock, Clock, Hourglass, MoreHorizontal, Repeat, Star, Trash2, UserRound, ListChecks } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app-context'
import { addDays, fmtDuration, fmtTime, relDay, todayStr } from '../lib/dates'
import { remove, save } from '../lib/db'
import { L } from '../lib/i18n'
import { completeTask, isOverdue, reopenTask, rescheduleTask, setPriority, ensureDay } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { Category, Project, Task } from '../lib/types'
import { CheckIcon } from './TaskEditor'
import { CatPill, confirmDialog, toast } from './ui'

export function Menu({ label, children, icon }: { label: string; children: (close: () => void) => ReactNode; icon?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn ghost icon sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} title={label} onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>{icon || <MoreHorizontal size={17} />}</button>
      {open && (
        <div role="menu" className="card" style={{ position: 'absolute', insetInlineEnd: 0, top: '100%', zIndex: 40, padding: 6, minWidth: 210, animation: 'rise .15s ease' }} onClick={e => e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
export const MenuItem = ({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button role="menuitem" className="nav-btn" style={{ padding: '8px 10px', fontSize: 14, color: danger ? 'var(--rose)' : undefined }} onClick={onClick}>{icon}{children}</button>
)

export async function quickComplete(t: Task, settings: any) {
  if (t.status === 'completed') { await reopenTask(t); return }
  const r = await completeTask(t, settings)
  scheduleSoon()
  toast(r.next ? L('أُنجزت — أُنشئ الموعد التالي', 'Done — next occurrence created') : L('أُنجزت ✓', 'Done ✓'), { action: { label: L('تراجع', 'Undo'), fn: r.undo } })
}

export function TaskRow({ t, cats, projects, showDate = true, selectable, selected, onSelect, draggable }: {
  t: Task; cats: Category[]; projects?: Project[]; showDate?: boolean; selectable?: boolean; selected?: boolean; onSelect?: () => void; draggable?: boolean
}) {
  const { editTask, settings } = useApp()
  const today = todayStr()
  const cat = cats.find(c => c.id === t.categoryId)
  const proj = projects?.find(p => p.id === t.projectId)
  const done = t.status === 'completed'
  const overdue = isOverdue(t, today)
  const sub = t.subtasks?.length ? `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}` : ''
  const [pick, setPick] = useState(false)

  const move = async (d: string | null) => {
    const before = { ...t }
    await rescheduleTask(t, d)
    scheduleSoon()
    toast(d ? L(`نُقلت إلى ${relDay(d)}`, `Moved to ${relDay(d)}`) : L('نُقلت إلى لاحقاً', 'Moved to someday'), { action: { label: L('تراجع', 'Undo'), fn: () => save('tasks', before) } })
  }
  const promote = async () => {
    const d = await ensureDay(today)
    const idx = d.priorities.findIndex((p: any) => !p)
    if (d.priorities.some((p: any) => p?.taskId === t.id)) return toast(L('هي ضمن أولويات اليوم بالفعل', 'Already a top priority today'))
    if (idx < 0) return toast(L('الأولويات الثلاث ممتلئة — أزل واحدة أولاً', 'All three priorities are set — remove one first'), { err: true })
    await setPriority(today, idx, { title: t.title, taskId: t.id, priority: t.priority, estMin: t.estMin, done: done })
    if (t.dueDate !== today) await rescheduleTask(t, today)
    toast(L(`أصبحت الأولوية رقم ${idx + 1} لليوم`, `Set as today's priority #${idx + 1}`))
  }
  const del = async () => {
    if (!(await confirmDialog({ title: L('حذف المهمة؟', 'Delete task?'), body: t.title, ok: L('حذف', 'Delete'), danger: true }))) return
    const snap = { ...t }
    await remove('tasks', t.id)
    scheduleSoon()
    toast(L('حُذفت', 'Deleted'), { action: { label: L('تراجع', 'Undo'), fn: () => save('tasks', snap) } })
  }

  return (
    <div className={`trow${done ? ' done' : ''}${selected ? ' selected' : ''}`} draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/df-task', t.id); e.dataTransfer.effectAllowed = 'move' }}>
      <span className={`prio-bar prio-${t.priority}`} aria-hidden />
      {selectable
        ? <input type="checkbox" className="check" style={{ width: 20, height: 20, marginTop: 3, accentColor: 'var(--accent)' }} checked={!!selected} onChange={onSelect} aria-label={L('تحديد', 'Select')} />
        : <button className={`cbx round${done ? ' on' : ''}`} aria-pressed={done} aria-label={done ? L('إعادة فتح', 'Reopen') : L('إنجاز', 'Complete')} onClick={() => quickComplete(t, settings)}>{done && <CheckIcon />}</button>}
      <div className="grow">
        <div className="t-title" role="button" tabIndex={0} onClick={() => editTask(t)} onKeyDown={e => e.key === 'Enter' && editTask(t)}>{t.title}</div>
        <div className="t-meta">
          {showDate && t.dueDate && <span className={`pill${overdue ? ' overdue' : ''}`}><CalendarClock size={12} />{relDay(t.dueDate, today)}</span>}
          {overdue && <span className="pill overdue">{L('متأخرة', 'Overdue')}</span>}
          {!t.dueDate && <span className="pill outline">{L('بدون تاريخ', 'No date')}</span>}
          {t.startTime && <span className="pill"><Clock size={12} /><span className="ltr">{fmtTime(t.startTime)}</span></span>}
          {t.estMin ? <span className="pill">{fmtDuration(t.estMin)}</span> : null}
          {t.status === 'waiting' && <span className="pill saffron"><Hourglass size={12} />{L('بانتظار رد', 'Waiting')}{t.contact ? ` · ${t.contact}` : ''}</span>}
          {t.status === 'in_progress' && <span className="pill teal">{L('قيد التنفيذ', 'In progress')}</span>}
          {t.followUpDate && t.status !== 'completed' && <span className={`pill${t.followUpDate <= today ? ' saffron' : ''}`}><UserRound size={12} />{L('متابعة', 'Follow-up')} {relDay(t.followUpDate, today)}</span>}
          {t.originalDueDate && t.originalDueDate !== t.dueDate && !done && <span className="pill outline"><ArrowLeftRight size={11} />{L('مؤجلة', 'Rescheduled')}</span>}
          {sub && <span className="pill"><ListChecks size={12} /><span className="ltr">{sub}</span></span>}
          {t.recurrence && <span className="pill" title={L('متكررة', 'Repeats')}><Repeat size={12} /></span>}
          <CatPill cat={cat} />
          {proj && <span className="pill outline">{proj.name}</span>}
          {t.demo && <span className="pill outline">{L('تجريبي', 'Demo')}</span>}
        </div>
        {pick && (
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" type="date" autoFocus style={{ width: 170, minHeight: 36 }} defaultValue={t.dueDate || ''}
              onChange={e => { if (e.target.value) { move(e.target.value); setPick(false) } }} aria-label={L('تاريخ جديد', 'New date')} />
            <button className="btn sm" onClick={() => setPick(false)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        )}
      </div>
      {!selectable && (
        <Menu label={L('خيارات المهمة', 'Task options')}>
          {close => <>
            {!done && <MenuItem icon={<Star size={16} />} onClick={() => { close(); promote() }}>{L('اجعلها من أولويات اليوم', 'Make a top priority today')}</MenuItem>}
            {!done && t.dueDate !== today && <MenuItem icon={<CalendarArrowUp size={16} />} onClick={() => { close(); move(today) }}>{L('إلى اليوم', 'Move to today')}</MenuItem>}
            {!done && <MenuItem icon={<CalendarArrowUp size={16} />} onClick={() => { close(); move(addDays(t.dueDate && t.dueDate >= today ? t.dueDate : today, 1)) }}>{L('تأجيل يوم', 'Postpone one day')}</MenuItem>}
            {!done && <MenuItem icon={<CalendarClock size={16} />} onClick={() => { close(); setPick(true) }}>{L('اختيار تاريخ…', 'Pick a date…')}</MenuItem>}
            {!done && t.dueDate && <MenuItem icon={<Hourglass size={16} />} onClick={() => { close(); move(null) }}>{L('إلى قائمة لاحقاً', 'Move to someday')}</MenuItem>}
            <MenuItem icon={<Trash2 size={16} />} danger onClick={() => { close(); del() }}>{L('حذف', 'Delete')}</MenuItem>
          </>}
        </Menu>
      )}
    </div>
  )
}
