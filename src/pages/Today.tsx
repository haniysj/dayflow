import {
  Archive, ArrowRight, Bell, CalendarCheck2, CalendarClock, CalendarPlus, CheckCircle2, Clock, FolderPlus, Inbox, ListPlus, MoonStar,
  Plus, Search, Settings as Cog, Star, StickyNote, Sunrise, Trash2, UserRound, X, Pencil,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app-context'
import { buildCalendar, moveGridItem, scheduleTaskAt } from '../components/calendarData'
import { Menu, MenuItem, quickComplete, TaskRow } from '../components/TaskRow'
import { CheckIcon } from '../components/TaskEditor'
import { TimeGrid } from '../components/TimeGrid'
import { catName, confirmDialog, DateBadge, Empty, Modal, toast } from '../components/ui'
import { addDays, dow, fmtDuration, fmtLong, fmtTime, hijri, hmToMin, msToDate, nowMinutes, relDay, todayStr, minToHM } from '../lib/dates'
import { patch, remove, save, uid, useCategories, useDay, useEvents, useHolidays, useLeaves, useNotes, useProjects, useTasks } from '../lib/db'
import { L, PRIORITY_LABEL } from '../lib/i18n'
import { expandEvents, isOpen, isOverdue, newEvent, setPriority } from '../lib/logic'
import { centerItems, scheduleSoon } from '../lib/notify'
import type { Note, PrioritySlot, Task } from '../lib/types'

export function Today() {
  const app = useApp()
  const { settings, editTask, editEvent, openReminders, go, openPlanTomorrow, openReview, quickAdd } = app
  const today = todayStr()
  const tomorrow = addDays(today, 1)
  const tasks = useTasks() || []
  const events = useEvents() || []
  const cats = useCategories() || []
  const projects = useProjects() || []
  const leaves = useLeaves() || []
  const holidays = useHolidays() || []
  const notes = useNotes() || []
  const dayRec = useDay(today)

  const dueToday = tasks.filter(t => t.dueDate === today && t.status !== 'cancelled' && t.status !== 'archived')
  const doneToday = dueToday.filter(t => t.status === 'completed').length
  const pct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0
  const overdue = tasks.filter(t => isOverdue(t, today)).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
  const openToday = dueToday.filter(isOpen).sort((a, b) => prioRank(b) - prioRank(a) || (a.startTime || '99').localeCompare(b.startTime || '99'))
  const followUps = tasks.filter(t => isOpen(t) && ((t.followUpDate && t.followUpDate <= today) || (t.status === 'waiting' && (!t.followUpDate || t.followUpDate <= today))) && t.dueDate !== today && !isOverdue(t, today))
  const unscheduled = openToday.filter(t => !t.startTime)

  const { timed, allDay } = useMemo(() => buildCalendar({
    from: today, to: today, events, tasks, leaves, holidays, settings, cats,
    onEvent: e => editEvent(e, e.instanceDate), onTask: editTask,
    onLeave: () => go('leave'), onHoliday: () => go('leave'),
  }), [events, tasks, leaves, holidays, settings, cats, today])

  // what is next?
  const nowM = nowMinutes()
  const next = timed.filter(i => !i.done && i.end > nowM).sort((a, b) => a.start - b.start)[0]
  const tomorrowEvents = expandEvents(events, tomorrow, tomorrow, settings.workdays)
  const tomorrowTasks = tasks.filter(t => t.dueDate === tomorrow && isOpen(t))
  const inbox = notes.filter(n => !n.archived)
  const unread = centerItems().filter(i => !i.dismissed).length
  const hour = +minToHM(nowM).slice(0, 2)
  const greeting = hour < 12 ? L('صباح الخير', 'Good morning') : hour < 17 ? L('مساء الخير', 'Good afternoon') : L('مساء الخير', 'Good evening')
  const [schedFor, setSchedFor] = useState<Task | null>(null)

  return (
    <div className="stack view-enter">
      {/* A. Daily header */}
      <section className="card" aria-label={L('اليوم', 'Today')}>
        <div className="day-head">
          <DateBadge date={today} />
          <div className="grow">
            <div className="tiny muted" style={{ fontWeight: 700 }}>{greeting}</div>
            <h2 style={{ fontSize: 20 }}>{fmtLong(today)}</h2>
            {settings.showHijri && <div className="small muted">{hijri(today)} <span className="tiny">({L('تقريبي', 'approx.')})</span></div>}
            {settings.motivation && <div className="motto" style={{ marginTop: 4 }}>{settings.motivation}</div>}
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="ring" style={{ ['--p' as any]: pct }} role="img" aria-label={L(`نسبة الإنجاز ${pct}%`, `${pct}% complete`)}>
              <div><span className="ltr">{pct}%</span></div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <button className="btn icon sm" onClick={openReminders} aria-label={L('مركز التذكيرات', 'Reminder center')} title={L('التذكيرات', 'Reminders')} style={{ position: 'relative' }}>
                <Bell size={17} />{unread > 0 && <span className="pill rose" style={{ position: 'absolute', top: -7, insetInlineEnd: -7, padding: '0 6px', fontSize: 11 }}>{unread}</span>}
              </button>
              <button className="btn icon sm" onClick={() => go('settings')} aria-label={L('الإعدادات', 'Settings')} title={L('الإعدادات', 'Settings')}><Cog size={17} /></button>
            </div>
          </div>
        </div>
        <div className="row wrap small" style={{ marginTop: 12, gap: 6 }}>
          <span className="pill teal"><CheckCircle2 size={12} />{doneToday}/{dueToday.length} {L('مهام اليوم', "today's tasks")}</span>
          {overdue.length > 0 && <span className="pill overdue">{overdue.length} {L('متأخرة', 'overdue')}</span>}
          {followUps.length > 0 && <span className="pill saffron">{followUps.length} {L('للمتابعة', 'to follow up')}</span>}
          {inbox.length > 0 && <span className="pill">{inbox.length} {L('في الوارد', 'in inbox')}</span>}
        </div>
      </section>

      <div className="today-grid">
        <div className="stack">
          {/* next up */}
          <section className="card next-up" aria-label={L('التالي', 'Next up')}>
            <div className="row">
              <Clock size={18} />
              <div className="grow">
                <div className="tiny muted" style={{ fontWeight: 700 }}>{L('التالي في جدولك', 'Next on your schedule')}</div>
                {next ? <div className="row wrap" style={{ gap: 8 }}>
                  <b style={{ fontSize: 16 }}>{next.title}</b>
                  <span className="pill" style={{ background: 'rgba(255,255,255,.14)', color: 'inherit' }}><span className="ltr">{fmtTime(minToHM(next.start))} – {fmtTime(minToHM(next.end))}</span></span>
                  {next.start > nowM && <span className="tiny muted">{L('بعد', 'in')} {fmtDuration(next.start - nowM)}</span>}
                  {next.start <= nowM && <span className="tiny muted">{L('جارٍ الآن', 'happening now')}</span>}
                </div> : <b>{L('لا مواعيد متبقية اليوم — وقت مرن', 'Nothing else scheduled — flexible time')}</b>}
              </div>
              {next && <button className="btn sm" style={{ background: 'transparent', color: 'inherit', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => (next.kind === 'task' ? editTask(next.ref) : editEvent(next.ref, next.ref.instanceDate))}>{L('فتح', 'Open')}</button>}
            </div>
          </section>

          {/* B. Top three */}
          <Priorities date={today} slots={dayRec?.priorities || [null, null, null]} tasks={tasks} />

          {/* C. Timeline */}
          <section className="card" aria-label={L('جدول اليوم', 'Schedule')}>
            <div className="card-h">
              <h2><CalendarClock size={18} />{L('جدول اليوم', "Today's schedule")}</h2>
              <span className="spacer" />
              <button className="btn sm" onClick={() => quickAdd({ kind: 'event', date: today })}><Plus size={15} />{L('كتلة وقت', 'Time block')}</button>
            </div>
            {unscheduled.length > 0 && (
              <div className="banner info" style={{ marginBottom: 10, flexDirection: 'column', gap: 6 }}>
                <b className="small">{L('مهام اليوم دون وقت — اسحبها إلى الجدول أو اضغط «جدولة»', 'Unscheduled tasks — drag onto the schedule or tap “Schedule”')}</b>
                <div className="row wrap">
                  {unscheduled.map(t => (
                    <span key={t.id} className="pill tray-item" draggable onDragStart={e => e.dataTransfer.setData('text/df-task', t.id)} style={{ background: 'var(--card)', border: '1px solid var(--line)', padding: '2px 4px 2px 10px', gap: 6 }}>
                      <span className="ellipsis" style={{ maxWidth: 180 }}>{t.title}</span>
                      <button className="btn ghost sm" style={{ minHeight: 26, padding: '0 8px' }} onClick={() => setSchedFor(t)}>{L('جدولة', 'Schedule')}</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <TimeGrid compact dates={[today]} items={timed} allDay={allDay} startHour={settings.dayStart} endHour={settings.dayEnd} slotMin={settings.slotMin} workdays={settings.workdays}
              onSlot={(d, time) => quickAdd({ kind: 'event', date: d, time })}
              onOpen={it => (it.kind === 'task' ? editTask(it.ref) : editEvent(it.ref, it.ref.instanceDate))}
              onMove={(it, d, s, e) => moveGridItem(it, d, s, e)}
              onDropTask={(id, d, time) => scheduleTaskAt(id, d, time, settings.slotMin)} />
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>{L('اضغط على أي فترة فارغة لإضافة موعد. اسحب المقبض لنقل كتلة، والحافة السفلية لتغيير مدتها. الوقت غير المخطط يبقى فارغاً.', 'Tap an empty slot to add. Drag the handle to move a block, its bottom edge to resize. Unplanned time stays empty.')}</p>
          </section>
        </div>

        <div className="stack">
          {/* must complete */}
          <section className="card" aria-label={L('المطلوب إنجازه', 'To complete')}>
            <div className="card-h">
              <h2><CalendarCheck2 size={18} />{L('المطلوب إنجازه اليوم', 'Must complete today')}</h2>
              <span className="spacer" />
              <button className="btn icon sm" onClick={() => quickAdd({ kind: 'task', date: today })} aria-label={L('مهمة جديدة', 'New task')}><Plus size={16} /></button>
            </div>
            {openToday.length === 0 && overdue.length === 0
              ? <Empty icon={<CheckCircle2 size={28} />} text={dueToday.length ? L('أنجزت كل مهام اليوم. أحسنت.', 'All of today’s tasks are done. Nice.') : L('لا مهام مستحقة اليوم.', 'No tasks due today.')} />
              : <>
                {openToday.map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} showDate={false} />)}
                {overdue.length > 0 && <>
                  <div className="row between" style={{ marginTop: 10 }}>
                    <div className="section-title" style={{ color: 'var(--overdue)' }}>{L('من أيام سابقة', 'From earlier days')} ({overdue.length})</div>
                    <button className="btn ghost sm" onClick={async () => {
                      const before = overdue.map(t => ({ ...t }))
                      for (const t of overdue) await patch('tasks', t.id, { dueDate: today, originalDueDate: t.originalDueDate ?? t.dueDate, rescheduleCount: (t.rescheduleCount || 0) + 1 })
                      scheduleSoon()
                      toast(L(`نُقلت ${overdue.length} إلى اليوم`, `Moved ${overdue.length} to today`), { action: { label: L('تراجع', 'Undo'), fn: async () => { for (const b of before) await save('tasks', b) } } })
                    }}>{L('نقل الكل إلى اليوم', 'Move all to today')}</button>
                  </div>
                  {overdue.map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} />)}
                </>}
              </>}
          </section>

          {/* follow-ups */}
          {followUps.length > 0 && (
            <section className="card" aria-label={L('المتابعات', 'Follow-ups')}>
              <div className="card-h"><h2><UserRound size={18} />{L('قد تحتاج متابعة', 'Might need a follow-up')}</h2></div>
              {followUps.map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} />)}
            </section>
          )}

          {/* D. Inbox */}
          <InboxCard notes={inbox} />

          {/* tomorrow */}
          <section className="card" aria-label={L('الغد', 'Tomorrow')}>
            <div className="card-h">
              <h2><Sunrise size={18} />{L('للتحضير للغد', 'Prepare for tomorrow')}</h2>
              <span className="spacer" />
              <span className="tiny muted">{relDay(tomorrow)}{!settings.workdays.includes(dow(tomorrow)) ? ' · ' + L('عطلة نهاية الأسبوع', 'weekend') : ''}</span>
            </div>
            {tomorrowEvents.length + tomorrowTasks.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{L('لا شيء مجدول للغد بعد.', 'Nothing scheduled for tomorrow yet.')}</p> : (
              <div className="col" style={{ gap: 4 }}>
                {tomorrowEvents.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).map(e => (
                  <div key={e.id + e.instanceDate} className="row small"><span className="dot" style={{ ['--c' as any]: 'var(--accent)' }} /><span className="ltr nowrap muted">{e.allDay ? L('طوال اليوم', 'All day') : fmtTime(e.startTime)}</span><span className="ellipsis">{e.title}</span></div>
                ))}
                {tomorrowTasks.map(t => <div key={t.id} className="row small"><span className="dot" style={{ ['--c' as any]: 'var(--saffron)' }} /><span className="ellipsis">{t.title}</span></div>)}
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={openPlanTomorrow}><Sunrise size={16} />{L('خطّط للغد', 'Plan Tomorrow')}</button>
              <button className="btn" onClick={() => openReview(today)}><MoonStar size={16} />{dayRec?.review?.doneAt ? L('عرض مراجعة اليوم', 'View today’s review') : L('مراجعة نهاية اليوم', 'End-of-day review')}</button>
            </div>
          </section>
        </div>
      </div>
      {schedFor && <ScheduleDialog task={schedFor} onClose={() => setSchedFor(null)} />}
    </div>
  )
}

const prioRank = (t: Task) => ({ urgent: 3, high: 2, normal: 1, low: 0 }[t.priority])

function ScheduleDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { settings } = useApp()
  const nm = nowMinutes()
  const [time, setTime] = useState(minToHM(Math.ceil((nm + 5) / 15) * 15))
  const [date, setDate] = useState(task.dueDate || todayStr())
  return (
    <Modal title={L('جدولة المهمة', 'Schedule task')} icon={<Clock size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={async () => { await scheduleTaskAt(task.id, date, time, settings.slotMin); toast(L('أُضيفت إلى الجدول', 'Added to schedule')); onClose() }}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
    </>}>
      <b>{task.title}</b>
      <div className="grid g2">
        <label className="field"><span>{L('التاريخ', 'Date')}</span><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field"><span>{L('الوقت', 'Time')}</span><input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      </div>
      <span className="tiny muted">{L('المدة', 'Length')}: {fmtDuration(task.estMin || Math.max(30, settings.slotMin))}</span>
    </Modal>
  )
}

// ---------- Priorities ----------
export function Priorities({ date, slots, tasks, title }: { date: string; slots: (PrioritySlot | null)[]; tasks: Task[]; title?: string }) {
  const { settings } = useApp()
  const [edit, setEdit] = useState<number | null>(null)
  const filled = [0, 1, 2].map(i => slots[i] || null)
  const toggle = async (i: number) => {
    const s = filled[i]!
    const done = !s.done
    await setPriority(date, i, { ...s, done })
    if (s.taskId) {
      const t = tasks.find(x => x.id === s.taskId)
      if (t && (t.status === 'completed') !== done) await quickComplete(t, settings)
    }
  }
  return (
    <section className="card" aria-label={L('الأولويات الثلاث', 'Top three priorities')}>
      <div className="card-h"><h2><Star size={18} />{title || L('أهم ثلاث أولويات', 'Top three priorities')}</h2><span className="spacer" /><span className="tiny muted">{filled.filter(s => s?.done).length}/{filled.filter(Boolean).length || 3}</span></div>
      <div className="col">
        {filled.map((s, i) => s ? (
          <div key={i} className={`prio-slot${s.done ? ' done' : ''}`}>
            <span className="prio-num">{i + 1}</span>
            <div className="grow">
              <div style={{ fontWeight: 700, textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--muted)' : undefined, overflowWrap: 'anywhere' }}>{s.title}</div>
              <div className="row wrap" style={{ gap: 5, marginTop: 2 }}>
                {s.priority !== 'normal' && <span className={`pill ${s.priority === 'urgent' ? 'rose' : s.priority === 'high' ? 'saffron' : ''}`}>{(PRIORITY_LABEL() as any)[s.priority]}</span>}
                {s.estMin ? <span className="pill">{fmtDuration(s.estMin)}</span> : null}
                {s.taskId && <span className="pill outline">{L('مرتبطة بمهمة', 'Linked task')}</span>}
                {s.desc && <span className="tiny muted ellipsis">{s.desc}</span>}
              </div>
            </div>
            <button className="btn ghost icon sm" onClick={() => setEdit(i)} aria-label={L('تعديل', 'Edit')}><Pencil size={15} /></button>
            <button className={`cbx${s.done ? ' on' : ''}`} aria-pressed={s.done} aria-label={L('إنجاز', 'Done')} onClick={() => toggle(i)}>{s.done && <CheckIcon />}</button>
          </div>
        ) : (
          <button key={i} className="prio-slot empty" onClick={() => setEdit(i)}><Plus size={16} />{L(`حدد الأولوية ${i + 1}`, `Set priority ${i + 1}`)}</button>
        ))}
      </div>
      {edit !== null && <PriorityEditor date={date} index={edit} slot={filled[edit]} others={filled} tasks={tasks} onClose={() => setEdit(null)} />}
    </section>
  )
}

function PriorityEditor({ date, index, slot, others, tasks, onClose }: { date: string; index: number; slot: PrioritySlot | null; others: (PrioritySlot | null)[]; tasks: Task[]; onClose: () => void }) {
  const [s, setS] = useState<PrioritySlot>(slot || { title: '', priority: 'normal', done: false })
  const [q, setQ] = useState('')
  const used = new Set(others.map(o => o?.taskId).filter(Boolean))
  const candidates = tasks.filter(t => isOpen(t) && !used.has(t.id) && (!q || t.title.includes(q)))
    .sort((a, b) => (a.dueDate === date ? -1 : 0) - (b.dueDate === date ? -1 : 0) || prioRank(b) - prioRank(a)).slice(0, 8)
  const saveIt = async () => {
    if (!s.title.trim()) return toast(L('اكتب عنواناً أو اختر مهمة', 'Enter a title or pick a task'), { err: true })
    await setPriority(date, index, { ...s, title: s.title.trim() })
    onClose()
  }
  return (
    <Modal title={L(`الأولوية ${index + 1}`, `Priority ${index + 1}`)} icon={<Star size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={saveIt}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      <span className="grow" />
      {slot && <button className="btn ghost sm danger" onClick={async () => { await setPriority(date, index, null); onClose() }}><X size={15} />{L('إفراغ الخانة', 'Clear slot')}</button>}
    </>}>
      <div className="section-title" style={{ margin: 0 }}>{L('اختر من مهامك', 'Pick one of your tasks')}</div>
      <div className="row"><Search size={16} className="muted" /><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={L('بحث…', 'Search…')} /></div>
      <div className="col" style={{ gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {candidates.map(t => (
          <button key={t.id} className={`nav-btn${s.taskId === t.id ? ' active' : ''}`} style={{ whiteSpace: 'normal' }}
            onClick={() => setS({ ...s, title: t.title, taskId: t.id, priority: t.priority, estMin: t.estMin, desc: t.desc })}>
            <span className={`prio-bar prio-${t.priority}`} style={{ height: 18 }} />
            <span className="grow">{t.title}</span>
            {t.dueDate && <span className="tiny muted nowrap">{relDay(t.dueDate)}</span>}
          </button>
        ))}
        {!candidates.length && <span className="small muted">{L('لا نتائج', 'No matches')}</span>}
      </div>
      <div className="section-title" style={{ margin: 0 }}>{L('أو اكتبها مباشرة', 'Or write it directly')}</div>
      <label className="field"><span>{L('العنوان', 'Title')}</span><input className="input" value={s.title} onChange={e => setS({ ...s, title: e.target.value, taskId: e.target.value === s.title ? s.taskId : s.taskId })} /></label>
      <label className="field"><span>{L('وصف (اختياري)', 'Description (optional)')}</span><input className="input" value={s.desc || ''} onChange={e => setS({ ...s, desc: e.target.value })} /></label>
      <div className="grid g2">
        <label className="field"><span>{L('الأولوية', 'Priority')}</span>
          <select className="input" value={s.priority} onChange={e => setS({ ...s, priority: e.target.value as any })}>{Object.entries(PRIORITY_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field"><span>{L('المدة المقدّرة (دقيقة)', 'Estimate (min)')}</span><input className="input" type="number" min={0} step={5} value={s.estMin ?? ''} onChange={e => setS({ ...s, estMin: e.target.value ? +e.target.value : null })} /></label>
      </div>
      {s.taskId && <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setS({ ...s, taskId: null })}><X size={14} />{L('فك الارتباط بالمهمة', 'Unlink task')}</button>}
    </Modal>
  )
}

// ---------- Inbox ----------
function InboxCard({ notes }: { notes: Note[] }) {
  const { editTask, editEvent, settings } = useApp()
  const projects = useProjects() || []
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [remindFor, setRemindFor] = useState<Note | null>(null)
  const [projFor, setProjFor] = useState<Note | null>(null)
  const list = notes.filter(n => !q || n.text.includes(q))

  const add = async () => {
    if (!text.trim()) return
    await save('notes', { id: uid(), text: text.trim(), createdAt: Date.now() })
    setText('')
  }
  const toTask = async (n: Note, projectId?: string) => {
    const id = uid()
    const task: Task = { id, updatedAt: 0, title: n.text.split('\n')[0].slice(0, 140), desc: n.text.includes('\n') ? n.text : undefined, createdAt: Date.now(), priority: 'normal', status: 'inbox', dueDate: null, projectId: projectId || null, subtasks: [], links: [], reminders: [] }
    await save('tasks', task)
    await save('notes', { ...n, archived: true, convertedTo: { kind: projectId ? 'project' : 'task', id } })
    toast(L('حُوّلت إلى مهمة', 'Converted to a task'), { action: { label: L('تراجع', 'Undo'), fn: async () => { await remove('tasks', id); await save('notes', { ...n }) } } })
    editTask({ ...task, updatedAt: Date.now() })
  }
  const toEvent = async (n: Note) => {
    const e = newEvent({ title: n.text.split('\n')[0].slice(0, 140), notes: n.text, date: todayStr(), startTime: minToHM(Math.ceil((nowMinutes() + 30) / 30) * 30), reminders: settings.defaultReminders })
    e.endTime = minToHM(hmToMin(e.startTime) + 60)
    await save('events', e)
    await save('notes', { ...n, archived: true, convertedTo: { kind: 'event', id: e.id } })
    editEvent({ ...e, updatedAt: Date.now() })
  }

  return (
    <section className="card" aria-label={L('الوارد', 'Inbox')}>
      <div className="card-h"><h2><Inbox size={18} />{L('ملاحظات سريعة والوارد', 'Quick notes & inbox')}</h2><span className="spacer" />{notes.length > 4 && <input className="input" style={{ width: 130, minHeight: 34 }} value={q} onChange={e => setQ(e.target.value)} placeholder={L('بحث…', 'Search…')} aria-label={L('بحث في الوارد', 'Search inbox')} />}</div>
      <div className="row">
        <input className="input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={L('سجّل فكرة أو طلباً… بلا تصنيف أو تاريخ', 'Capture a thought… no category or date needed')} aria-label={L('ملاحظة جديدة', 'New note')} />
        <button className="btn primary icon" onClick={add} aria-label={L('حفظ', 'Save')}><Plus size={18} /></button>
      </div>
      <div style={{ marginTop: 6 }}>
        {list.length === 0 && <p className="small muted" style={{ margin: '8px 0 0' }}>{L('الوارد فارغ.', 'Inbox is empty.')}</p>}
        {list.map(n => (
          <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <StickyNote size={16} className="muted" style={{ marginTop: 4, flexShrink: 0 }} />
            <div className="grow">
              {editing === n.id
                ? <textarea className="input" autoFocus defaultValue={n.text} onBlur={async e => { const v = e.target.value.trim(); if (v && v !== n.text) await save('notes', { ...n, text: v }); setEditing(null) }} />
                : <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', cursor: 'text' }} onClick={() => setEditing(n.id)}>{n.text}</div>}
              <div className="row wrap" style={{ gap: 5, marginTop: 2 }}>
                <span className="tiny muted">{relDay(msToDate(n.createdAt))}</span>
                {n.remindAt && <span className="pill saffron"><Bell size={11} /><span className="ltr">{n.remindAt.replace('T', ' ')}</span></span>}
                {n.demo && <span className="pill outline">{L('تجريبي', 'Demo')}</span>}
              </div>
            </div>
            <Menu label={L('تحويل', 'Convert')} icon={<ArrowRight size={17} />}>
              {close => <>
                <MenuItem icon={<ListPlus size={16} />} onClick={() => { close(); toTask(n) }}>{L('إلى مهمة', 'To a task')}</MenuItem>
                <MenuItem icon={<CalendarPlus size={16} />} onClick={() => { close(); toEvent(n) }}>{L('إلى موعد', 'To an event')}</MenuItem>
                <MenuItem icon={<FolderPlus size={16} />} onClick={() => { close(); setProjFor(n) }}>{L('إلى إجراء في مشروع', 'To a project action')}</MenuItem>
                <MenuItem icon={<Bell size={16} />} onClick={() => { close(); setRemindFor(n) }}>{L('إلى تذكير', 'To a reminder')}</MenuItem>
                <MenuItem icon={<Archive size={16} />} onClick={async () => { close(); await save('notes', { ...n, archived: true }); toast(L('أُرشفت', 'Archived'), { action: { label: L('تراجع', 'Undo'), fn: () => save('notes', n) } }) }}>{L('أرشفة', 'Archive')}</MenuItem>
                <MenuItem icon={<Trash2 size={16} />} danger onClick={async () => { close(); if (await confirmDialog({ title: L('حذف الملاحظة؟', 'Delete note?'), ok: L('حذف', 'Delete'), danger: true })) { await remove('notes', n.id); toast(L('حُذفت', 'Deleted'), { action: { label: L('تراجع', 'Undo'), fn: () => save('notes', n) } }) } }}>{L('حذف', 'Delete')}</MenuItem>
              </>}
            </Menu>
          </div>
        ))}
      </div>
      {remindFor && <RemindDialog note={remindFor} onClose={() => setRemindFor(null)} />}
      {projFor && (
        <Modal title={L('اختر المشروع', 'Choose project')} onClose={() => setProjFor(null)}>
          {projects.filter(p => p.status === 'active').map(p => (
            <button key={p.id} className="nav-btn" onClick={() => { toTask(projFor, p.id); setProjFor(null) }}><FolderPlus size={16} />{p.name}</button>
          ))}
          {!projects.some(p => p.status === 'active') && <p className="muted">{L('لا مشاريع نشطة بعد — أنشئ مشروعاً من صفحة التصنيفات والمشاريع.', 'No active projects yet — create one in Categories & Projects.')}</p>}
        </Modal>
      )}
    </section>
  )
}

function RemindDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const [date, setDate] = useState(note.remindAt?.split('T')[0] || todayStr())
  const [time, setTime] = useState(note.remindAt?.split('T')[1] || minToHM(Math.ceil((nowMinutes() + 60) / 30) * 30))
  return (
    <Modal title={L('تذكير', 'Reminder')} icon={<Bell size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={async () => { await save('notes', { ...note, remindAt: `${date}T${time}` }); scheduleSoon(); toast(L('سيُذكّرك التطبيق', 'Reminder set')); onClose() }}>{L('حفظ', 'Save')}</button>
      {note.remindAt && <button className="btn" onClick={async () => { await save('notes', { ...note, remindAt: null }); scheduleSoon(); onClose() }}>{L('إزالة التذكير', 'Remove reminder')}</button>}
    </>}>
      <p style={{ margin: 0 }}>{note.text}</p>
      <div className="grid g2">
        <label className="field"><span>{L('التاريخ', 'Date')}</span><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field"><span>{L('الوقت', 'Time')}</span><input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

export { catName }
