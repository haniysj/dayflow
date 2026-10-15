import { CheckCheck, ChevronLeft, ChevronRight, Columns3, Download, LayoutList, ListChecks, Plus, Search, SquareCheck, Trash2, X, CalendarRange } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app-context'
import { quickComplete, TaskRow } from '../components/TaskRow'
import { catName, confirmDialog, Empty, FileIcon, Seg, toast } from '../components/ui'
import { addDays, dow, fmtMed, fmtShort, relDay, startOfWeek, todayStr, range, weekdayName } from '../lib/dates'
import { db, removeMany, save, useCategories, useProjects, useTasks } from '../lib/db'
import { L, PRIORITY_LABEL, STATUS_LABEL } from '../lib/i18n'
import { exportTasksCSV } from '../lib/io'
import { completeTask, isOpen, isOverdue, rescheduleTask } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { Task, TaskStatus } from '../lib/types'

type F = 'open' | 'today' | 'tomorrow' | 'week' | 'overdue' | 'upcoming' | 'waiting' | 'someday' | 'completed' | 'all'

export function TasksPage() {
  const { settings, quickAdd, params } = useApp()
  const tasks = useTasks() || []
  const cats = useCategories() || []
  const projects = useProjects() || []
  const today = todayStr()
  const [f, setF] = useState<F>((params.f as F) || 'open')
  const [cat, setCat] = useState(params.cat || '')
  const [proj, setProj] = useState(params.proj || '')
  const [prio, setPrio] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'list' | 'board' | 'week'>(() => (localStorage.getItem('df-taskview') as any) || 'list')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [bulkDate, setBulkDate] = useState('')
  const setM = (m: typeof mode) => { setMode(m); localStorage.setItem('df-taskview', m) }

  const wkStart = startOfWeek(today, settings.weekStart)
  const wkEnd = addDays(wkStart, 6)
  const tests: Record<F, (t: Task) => boolean> = {
    open: isOpen,
    today: t => isOpen(t) && t.dueDate === today,
    tomorrow: t => isOpen(t) && t.dueDate === addDays(today, 1),
    week: t => isOpen(t) && !!t.dueDate && t.dueDate >= wkStart && t.dueDate <= wkEnd,
    overdue: t => isOverdue(t, today),
    upcoming: t => isOpen(t) && !!t.dueDate && t.dueDate > today,
    waiting: t => isOpen(t) && t.status === 'waiting',
    someday: t => isOpen(t) && !t.dueDate,
    completed: t => t.status === 'completed',
    all: () => true,
  }
  const base = tasks.filter(t => (!cat || t.categoryId === cat) && (!proj || t.projectId === proj) && (!prio || t.priority === prio) && (!q || (t.title + ' ' + (t.desc || '') + ' ' + (t.contact || '')).toLowerCase().includes(q.toLowerCase())))
  const list = base.filter(tests[f])
  const counts = Object.fromEntries((Object.keys(tests) as F[]).map(k => [k, base.filter(tests[k]).length]))
  const FL: [F, string][] = [
    ['open', L('المفتوحة', 'Open')], ['today', L('اليوم', 'Today')], ['tomorrow', L('غداً', 'Tomorrow')], ['week', L('هذا الأسبوع', 'This week')],
    ['overdue', L('متأخرة', 'Overdue')], ['upcoming', L('القادمة', 'Upcoming')], ['waiting', L('بانتظار رد', 'Waiting')],
    ['someday', L('لاحقاً', 'Someday')], ['completed', L('مكتملة', 'Completed')], ['all', L('الكل', 'All')],
  ]

  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selected = () => tasks.filter(t => sel.has(t.id))
  const bulkDone = async () => {
    const items = selected().filter(isOpen)
    const undos: (() => Promise<void>)[] = []
    for (const t of items) undos.push((await completeTask(t, settings)).undo)
    scheduleSoon(); setSel(new Set())
    toast(L(`أُنجزت ${items.length} مهام`, `Completed ${items.length} tasks`), { action: { label: L('تراجع', 'Undo'), fn: async () => { for (const u of undos) await u() } } })
  }
  const bulkMove = async (d: string | null) => {
    const items = selected()
    const before = items.map(t => ({ ...t }))
    for (const t of items) await rescheduleTask(t, d)
    scheduleSoon(); setSel(new Set()); setBulkDate('')
    toast(L(`نُقلت ${items.length} مهام`, `Moved ${items.length} tasks`), { action: { label: L('تراجع', 'Undo'), fn: async () => { for (const b of before) await save('tasks', b) } } })
  }
  const bulkDelete = async () => {
    const items = selected()
    if (!(await confirmDialog({ title: L(`حذف ${items.length} مهام؟`, `Delete ${items.length} tasks?`), body: L('يمكنك التراجع مباشرة بعد الحذف.', 'You can undo right after.'), ok: L('حذف', 'Delete'), danger: true }))) return
    const before = items.map(t => ({ ...t }))
    await removeMany('tasks', items.map(t => t.id))
    scheduleSoon(); setSel(new Set())
    toast(L('حُذفت', 'Deleted'), { action: { label: L('تراجع', 'Undo'), fn: async () => { for (const b of before) await save('tasks', b) } } })
  }

  // list grouping
  const groups = useMemo(() => {
    const g: { key: string; label: string; items: Task[]; tone?: string }[] = []
    const add = (key: string, label: string, items: Task[], tone?: string) => items.length && g.push({ key, label, items, tone })
    const sorted = [...list].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || pr(b) - pr(a) || (a.startTime || '99').localeCompare(b.startTime || '99'))
    if (f === 'completed') return [{ key: 'c', label: L('مكتملة', 'Completed'), items: sorted.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)) }]
    add('over', L('متأخرة', 'Overdue'), sorted.filter(t => isOverdue(t, today)), 'overdue')
    const dated = sorted.filter(t => t.dueDate && !isOverdue(t, today))
    const byDate = new Map<string, Task[]>()
    for (const t of dated) byDate.set(t.dueDate!, [...(byDate.get(t.dueDate!) || []), t])
    for (const [d, items] of byDate) add(d, `${relDay(d, today)}${d > addDays(today, 1) ? '' : ' · ' + fmtShort(d)}`, items)
    add('none', L('بدون تاريخ (لاحقاً)', 'No date (someday)'), sorted.filter(t => !t.dueDate))
    return g
  }, [list, f, today])

  return (
    <div className="stack view-enter">
      <div className="card" style={{ padding: 12 }}>
        <div className="row wrap">
          <div className="row grow" style={{ minWidth: 200 }}>
            <Search size={16} className="muted" />
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={L('ابحث في المهام…', 'Search tasks…')} aria-label={L('بحث', 'Search')} />
          </div>
          <Seg label={L('العرض', 'View')} value={mode} onChange={setM} options={[
            { v: 'list', l: <span className="row"><LayoutList size={15} /><span className="vh-m">{L('قائمة', 'List')}</span></span> },
            { v: 'board', l: <span className="row"><Columns3 size={15} /><span className="vh-m">{L('لوحة', 'Board')}</span></span> },
            { v: 'week', l: <span className="row"><CalendarRange size={15} /><span className="vh-m">{L('تخطيط الأسبوع', 'Week plan')}</span></span> },
          ]} />
          <button className={`btn sm${selecting ? ' accent' : ''}`} onClick={() => { setSelecting(s => !s); setSel(new Set()) }} aria-pressed={selecting}><SquareCheck size={15} />{L('تحديد', 'Select')}</button>
          <button className="btn sm" onClick={exportTasksCSV} title={L('تصدير CSV (يفتح في Excel)', 'Export CSV (opens in Excel)')}><FileIcon kind="csv" size={17} /><span className="vh-m">CSV</span></button>
          <button className="btn primary sm" onClick={() => quickAdd({ kind: 'task', date: f === 'someday' ? null : f === 'tomorrow' ? addDays(today, 1) : today, categoryId: cat || undefined, projectId: proj || undefined })}><Plus size={15} />{L('مهمة', 'Task')}</button>
        </div>
        {mode === 'list' && (
          <div className="chips-scroll" style={{ marginTop: 10 }} role="tablist" aria-label={L('تصفية', 'Filters')}>
            {FL.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={`fchip${f === k ? ' on' : ''}`} onClick={() => setF(k)}>{l}<span className="cnt">{counts[k]}</span></button>)}
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 8 }}>
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={cat} onChange={e => setCat(e.target.value)} aria-label={L('التصنيف', 'Category')}>
            <option value="">{L('كل التصنيفات', 'All categories')}</option>
            {cats.map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={proj} onChange={e => setProj(e.target.value)} aria-label={L('المشروع', 'Project')}>
            <option value="">{L('كل المشاريع', 'All projects')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }} value={prio} onChange={e => setPrio(e.target.value)} aria-label={L('الأولوية', 'Priority')}>
            <option value="">{L('كل الأولويات', 'All priorities')}</option>
            {Object.entries(PRIORITY_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(cat || proj || prio || q) && <button className="btn ghost sm" onClick={() => { setCat(''); setProj(''); setPrio(''); setQ('') }}><X size={14} />{L('مسح', 'Clear')}</button>}
        </div>
      </div>

      {selecting && (
        <div className="card row wrap" style={{ padding: 10, position: 'sticky', top: 64, zIndex: 12 }}>
          <b className="small">{L(`المحدد: ${sel.size}`, `Selected: ${sel.size}`)}</b>
          <button className="btn ghost sm" onClick={() => setSel(new Set(list.map(t => t.id)))}>{L('تحديد الكل', 'Select all')}</button>
          <span className="grow" />
          <button className="btn sm" disabled={!sel.size} onClick={bulkDone}><CheckCheck size={15} />{L('إنجاز', 'Complete')}</button>
          <button className="btn sm" disabled={!sel.size} onClick={() => bulkMove(today)}>{L('إلى اليوم', 'To today')}</button>
          <button className="btn sm" disabled={!sel.size} onClick={() => bulkMove(addDays(today, 1))}>{L('إلى الغد', 'To tomorrow')}</button>
          <input className="input" type="date" style={{ width: 160, minHeight: 34 }} value={bulkDate} onChange={e => setBulkDate(e.target.value)} aria-label={L('تاريخ جديد', 'New date')} />
          <button className="btn sm" disabled={!sel.size || !bulkDate} onClick={() => bulkMove(bulkDate)}>{L('نقل', 'Move')}</button>
          <button className="btn sm danger" disabled={!sel.size} onClick={bulkDelete}><Trash2 size={15} /></button>
        </div>
      )}

      {mode === 'list' && (
        groups.length === 0
          ? <div className="card"><Empty icon={<ListChecks size={30} />} text={q ? L('لا نتائج مطابقة.', 'No matching tasks.') : L('لا مهام هنا.', 'No tasks here.')} /></div>
          : groups.map(g => (
            <section key={g.key} className="card" style={{ paddingTop: 12, paddingBottom: 8 }}>
              <div className="section-title" style={{ color: g.tone === 'overdue' ? 'var(--overdue)' : undefined }}>{g.label} <span className="muted">({g.items.length})</span></div>
              {g.items.map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} showDate={g.key === 'over' || g.key === 'c'} selectable={selecting} selected={sel.has(t.id)} onSelect={() => toggleSel(t.id)} draggable />)}
            </section>
          ))
      )}
      {mode === 'board' && <Board tasks={base.filter(t => t.status !== 'archived' || f === 'all')} />}
      {mode === 'week' && <WeekPlan tasks={base} />}
    </div>
  )
}
const pr = (t: Task) => ({ urgent: 3, high: 2, normal: 1, low: 0 }[t.priority])

function Board({ tasks }: { tasks: Task[] }) {
  const { editTask, settings } = useApp()
  const cats = useCategories() || []
  const [over, setOver] = useState<string | null>(null)
  const cols: TaskStatus[] = ['inbox', 'planned', 'in_progress', 'waiting', 'completed']
  const move = async (id: string, status: TaskStatus) => {
    const t = await db.tasks.get(id)
    if (!t || t.status === status) return
    if (status === 'completed') return quickComplete(t, settings)
    await save('tasks', { ...t, status, completedAt: null })
  }
  const today = todayStr()
  return (
    <div className="board">
      {cols.map(s => {
        const items = tasks.filter(t => t.status === s).sort((a, b) => (s === 'completed' ? (b.completedAt || 0) - (a.completedAt || 0) : pr(b) - pr(a)))
        return (
          <div key={s} className={`bcol${over === s ? ' drop' : ''}`} onDragOver={e => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/df-task'); if (id) move(id, s) }}>
            <div className="section-title">{(STATUS_LABEL() as any)[s]} ({items.length})</div>
            {items.slice(0, s === 'completed' ? 20 : 200).map(t => {
              const cat = cats.find(c => c.id === t.categoryId)
              return (
                <div key={t.id} className="bcard" draggable onDragStart={e => e.dataTransfer.setData('text/df-task', t.id)} onClick={() => editTask(t)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && editTask(t)}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span className={`prio-bar prio-${t.priority}`} />
                    <b className="grow small" style={{ textDecoration: s === 'completed' ? 'line-through' : undefined }}>{t.title}</b>
                  </div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                    {t.dueDate && <span className={`pill${isOverdue(t, today) ? ' overdue' : ''}`}>{relDay(t.dueDate)}</span>}
                    {cat && <span className="pill c" style={{ ['--c' as any]: cat.color }}>{catName(cat)}</span>}
                  </div>
                  <select className="input" style={{ marginTop: 8, minHeight: 32, padding: '2px 8px', fontSize: 13 }} value={t.status} onClick={e => e.stopPropagation()} onChange={e => move(t.id, e.target.value as TaskStatus)} aria-label={L('نقل إلى', 'Move to')}>
                    {cols.concat(['cancelled', 'archived']).map(c => <option key={c} value={c}>{(STATUS_LABEL() as any)[c]}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function WeekPlan({ tasks }: { tasks: Task[] }) {
  const { settings, editTask } = useApp()
  const today = todayStr()
  const [ws, setWs] = useState(startOfWeek(today, settings.weekStart))
  const [over, setOver] = useState<string | null>(null)
  const days = range(ws, addDays(ws, 6))
  const drop = async (id: string, d: string | null) => {
    const t = await db.tasks.get(id)
    if (t) { await rescheduleTask(t, d); scheduleSoon() }
  }
  const col = (key: string, label: React.ReactNode, items: Task[], date: string | null, weekend = false) => (
    <div key={key} className={`bcol${over === key ? ' drop' : ''}`} style={weekend ? { background: 'var(--weekend)' } : undefined}
      onDragOver={e => { e.preventDefault(); setOver(key) }} onDragLeave={() => setOver(null)}
      onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/df-task'); if (id) drop(id, date) }}>
      <div className="section-title">{label} <span className="muted">({items.length})</span></div>
      {items.map(t => (
        <div key={t.id} className="bcard" draggable onDragStart={e => e.dataTransfer.setData('text/df-task', t.id)} onClick={() => editTask(t)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && editTask(t)}>
          <div className="row" style={{ alignItems: 'flex-start' }}><span className={`prio-bar prio-${t.priority}`} /><span className="grow small" style={{ fontWeight: 650, textDecoration: t.status === 'completed' ? 'line-through' : undefined }}>{t.title}</span></div>
          <select className="input" style={{ marginTop: 6, minHeight: 30, padding: '2px 8px', fontSize: 12.5 }} value={t.dueDate || ''} onClick={e => e.stopPropagation()} onChange={e => drop(t.id, e.target.value || null)} aria-label={L('نقل إلى يوم', 'Move to day')}>
            <option value="">{L('لاحقاً', 'Someday')}</option>
            {t.dueDate && !days.includes(t.dueDate) && <option value={t.dueDate}>{fmtMed(t.dueDate)}</option>}
            {days.map(d => <option key={d} value={d}>{fmtMed(d)}</option>)}
          </select>
        </div>
      ))}
    </div>
  )
  const prev = document.documentElement.dir === 'rtl' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />
  const next = document.documentElement.dir === 'rtl' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />
  return (
    <div className="stack">
      <div className="row">
        <button className="btn icon sm" onClick={() => setWs(addDays(ws, -7))} aria-label={L('الأسبوع السابق', 'Previous week')}>{prev}</button>
        <button className="btn sm" onClick={() => setWs(startOfWeek(today, settings.weekStart))}>{L('هذا الأسبوع', 'This week')}</button>
        <button className="btn icon sm" onClick={() => setWs(addDays(ws, 7))} aria-label={L('الأسبوع التالي', 'Next week')}>{next}</button>
        <b className="small">{fmtShort(ws)} – {fmtShort(addDays(ws, 6))}</b>
      </div>
      <div className="board" style={{ gridAutoColumns: 'minmax(210px, 1fr)' }}>
        {col('someday', L('لاحقاً (بدون تاريخ)', 'Someday (backlog)'), tasks.filter(t => isOpen(t) && !t.dueDate), null)}
        {days.map(d => col(d, <span>{weekdayName(d, 'long')} <span className="muted">{fmtShort(d)}</span>{d === today ? ' •' : ''}</span>,
          tasks.filter(t => t.dueDate === d && t.status !== 'cancelled' && t.status !== 'archived'), d, !settings.workdays.includes(dow(d))))}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{L('اسحب المهام بين الأيام، أو استخدم القائمة المنسدلة في كل بطاقة. لا يتم ملء الساعات تلقائياً.', 'Drag tasks between days or use each card’s dropdown. Hours are never auto-filled.')}</p>
    </div>
  )
}

export { Download }
