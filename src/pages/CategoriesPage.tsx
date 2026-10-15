import { Archive, ArchiveRestore, ArrowDown, ArrowUp, FolderKanban, Pencil, Plus, Trash2, X, Flag, CalendarClock, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app-context'
import { TaskRow } from '../components/TaskRow'
import { CatIcon, catName, CatPill, confirmDialog, DateBadge, Empty, ICONS, Modal, Seg, toast } from '../components/ui'
import { addDays, diffDays, relDay, todayStr } from '../lib/dates'
import { db, remove, save, uid, useCategories, useProjects, useTasks } from '../lib/db'
import { L, REMINDER_OPTIONS } from '../lib/i18n'
import { isOpen, isOverdue } from '../lib/logic'
import { CATEGORY_COLORS } from '../lib/seed'
import type { Category, Project, Task } from '../lib/types'

export function CategoriesPage() {
  const { params } = useApp()
  const [tab, setTab] = useState<'cats' | 'projects'>((params.tab as any) || 'cats')
  return (
    <div className="stack view-enter">
      <Seg label={L('القسم', 'Section')} value={tab} onChange={setTab} options={[{ v: 'cats', l: L('التصنيفات', 'Categories') }, { v: 'projects', l: L('المشاريع', 'Projects') }]} />
      {tab === 'cats' ? <Categories /> : <Projects />}
    </div>
  )
}

function Categories() {
  const { go } = useApp()
  const cats = useCategories() || []
  const tasks = useTasks() || []
  const projects = useProjects() || []
  const [edit, setEdit] = useState<Category | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const today = todayStr()
  const visible = cats.filter(c => showArchived || !c.archived)

  const reorder = async (c: Category, dir: -1 | 1) => {
    const list = cats.filter(x => !x.archived)
    const i = list.findIndex(x => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    await save('categories', { ...a, order: b.order })
    await save('categories', { ...b, order: a.order })
  }
  const del = async (c: Category) => {
    const n = tasks.filter(t => t.categoryId === c.id).length
    if (!(await confirmDialog({ title: L('حذف التصنيف؟', 'Delete category?'), body: n ? L(`${n} مهام ستبقى بلا تصنيف. يفضّل الأرشفة إن أردت الاحتفاظ بالسجل.`, `${n} tasks will become uncategorised. Archiving keeps history instead.`) : catName(c), ok: L('حذف', 'Delete'), danger: true }))) return
    for (const t of tasks.filter(t => t.categoryId === c.id)) await save('tasks', { ...t, categoryId: null })
    await remove('categories', c.id)
    toast(L('حُذف التصنيف', 'Category deleted'))
  }

  return (
    <>
      <div className="row wrap">
        <button className="btn primary" onClick={() => setEdit({ id: uid(), updatedAt: 0, name: '', icon: 'folder', color: CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length], order: (Math.max(0, ...cats.map(c => c.order)) + 1), defaultReminders: [] })}><Plus size={16} />{L('تصنيف جديد', 'New category')}</button>
        <span className="grow" />
        <label className="check small"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />{L('عرض المؤرشفة', 'Show archived')}</label>
      </div>
      {visible.length === 0 && <div className="card"><Empty text={L('لا تصنيفات بعد.', 'No categories yet.')} /></div>}
      <div className="grid g3">
        {visible.map((c, i) => {
          const ts = tasks.filter(t => t.categoryId === c.id)
          const open = ts.filter(isOpen)
          const over = ts.filter(t => isOverdue(t, today))
          const done = ts.filter(t => t.status === 'completed')
          const upcoming = open.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
          const attention = projects.filter(p => p.categoryId === c.id && p.status === 'active' && ((p.deadline && diffDays(p.deadline, today) <= 7) || tasks.some(t => t.projectId === p.id && isOverdue(t, today))))
          return (
            <section key={c.id} className="card cat-card" style={{ ['--c' as any]: c.color, opacity: c.archived ? 0.6 : 1 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="icon-tile"><CatIcon name={c.icon} size={18} /></span>
                <div className="grow">
                  <b style={{ display: 'block', lineHeight: 1.35 }}>{catName(c)}</b>
                  {c.desc && <span className="tiny muted">{c.desc}</span>}
                  {c.archived && <span className="pill outline">{L('مؤرشف', 'Archived')}</span>}
                </div>
                <div className="row" style={{ gap: 0 }}>
                  {!c.archived && <><button className="btn ghost icon sm" onClick={() => reorder(c, -1)} disabled={i === 0} aria-label={L('تحريك للأعلى', 'Move up')}><ArrowUp size={15} /></button>
                    <button className="btn ghost icon sm" onClick={() => reorder(c, 1)} aria-label={L('تحريك للأسفل', 'Move down')}><ArrowDown size={15} /></button></>}
                  <button className="btn ghost icon sm" onClick={() => setEdit(c)} aria-label={L('تعديل', 'Edit')}><Pencil size={15} /></button>
                </div>
              </div>
              <div className="row" style={{ gap: 14, margin: '12px 0 8px' }}>
                <button className="kpi" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'start' }} onClick={() => go('tasks', { cat: c.id, f: 'open' })}><b style={{ fontSize: 20 }}>{open.length}</b><span>{L('مفتوحة', 'Open')}</span></button>
                <div className="kpi"><b style={{ fontSize: 20, color: over.length ? 'var(--overdue)' : undefined }}>{over.length}</b><span>{L('متأخرة', 'Overdue')}</span></div>
                <div className="kpi"><b style={{ fontSize: 20 }}>{done.length}</b><span>{L('مكتملة', 'Done')}</span></div>
              </div>
              {upcoming.length > 0 && <div className="col" style={{ gap: 2 }}>
                <span className="tiny muted" style={{ fontWeight: 700 }}><CalendarClock size={12} /> {L('مواعيد قريبة', 'Upcoming deadlines')}</span>
                {upcoming.slice(0, 3).map(t => <span key={t.id} className="small ellipsis">• {t.title} <span className="muted">({relDay(t.dueDate!)})</span></span>)}
              </div>}
              {attention.length > 0 && <div className="banner warn" style={{ marginTop: 8, padding: '6px 10px' }}><AlertCircle size={15} /><span className="small">{L('مشاريع تحتاج انتباهاً:', 'Projects needing attention:')} {attention.map(p => p.name).join('، ')}</span></div>}
            </section>
          )
        })}
      </div>
      {edit && <CategoryEditor cat={edit} onClose={() => setEdit(null)} onDelete={() => { del(edit); setEdit(null) }} />}
    </>
  )
}

function CategoryEditor({ cat, onClose, onDelete }: { cat: Category; onClose: () => void; onDelete: () => void }) {
  const [c, setC] = useState(cat)
  const isNew = !cat.updatedAt
  const submit = async () => {
    if (!c.name.trim()) return toast(L('اكتب اسم التصنيف', 'Enter a name'), { err: true })
    await save('categories', { ...c, name: c.name.trim() })
    onClose()
  }
  return (
    <Modal title={isNew ? L('تصنيف جديد', 'New category') : L('تعديل التصنيف', 'Edit category')} onClose={onClose} footer={<>
      <button className="btn primary" onClick={submit}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      <span className="grow" />
      {!isNew && <button className="btn ghost sm" onClick={async () => { await save('categories', { ...c, archived: !c.archived }); onClose() }}>{c.archived ? <><ArchiveRestore size={15} />{L('استعادة', 'Restore')}</> : <><Archive size={15} />{L('أرشفة', 'Archive')}</>}</button>}
      {!isNew && <button className="btn ghost icon sm danger" onClick={onDelete} aria-label={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
    </>}>
      <div className="grid g2">
        <label className="field"><span>{L('الاسم', 'Name')} *</span><input className="input" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></label>
        <label className="field"><span>{L('الاسم بالإنجليزية', 'English name')}</span><input className="input" dir="ltr" value={c.nameEn || ''} onChange={e => setC({ ...c, nameEn: e.target.value })} /></label>
      </div>
      <label className="field"><span>{L('الوصف', 'Description')}</span><input className="input" value={c.desc || ''} onChange={e => setC({ ...c, desc: e.target.value })} /></label>
      <div className="field"><span>{L('اللون', 'Color')}</span>
        <div className="swatches">{CATEGORY_COLORS.map(col => <button key={col} className={`swatch${c.color === col ? ' on' : ''}`} style={{ background: col }} onClick={() => setC({ ...c, color: col })} aria-label={col} aria-pressed={c.color === col} />)}
          <input type="color" value={c.color} onChange={e => setC({ ...c, color: e.target.value })} aria-label={L('لون مخصص', 'Custom color')} style={{ width: 34, height: 34, border: 0, background: 'none' }} /></div>
      </div>
      <div className="field"><span>{L('الأيقونة', 'Icon')}</span>
        <div className="icons-pick">{Object.keys(ICONS).map(k => <button key={k} className={c.icon === k ? 'on' : ''} onClick={() => setC({ ...c, icon: k })} aria-label={k} aria-pressed={c.icon === k}><CatIcon name={k} size={18} /></button>)}</div>
      </div>
      <div className="field"><span>{L('تذكير افتراضي لمهام هذا التصنيف', 'Default reminder for this category')}</span>
        <div className="row wrap">{REMINDER_OPTIONS().map(o => { const on = c.defaultReminders?.includes(o.v); return <button key={o.v} className={`fchip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setC({ ...c, defaultReminders: on ? c.defaultReminders!.filter(x => x !== o.v) : [...(c.defaultReminders || []), o.v] })}>{o.l}</button> })}</div>
      </div>
      <div className="row"><span className="small muted">{L('معاينة:', 'Preview:')}</span><CatPill cat={{ ...c, name: c.name || '…' }} /></div>
    </Modal>
  )
}

// ---------- projects ----------
function Projects() {
  const projects = useProjects() || []
  const tasks = useTasks() || []
  const cats = useCategories() || []
  const [open, setOpen] = useState<Project | null>(null)
  const [st, setSt] = useState<'active' | 'done' | 'archived'>('active')
  const list = projects.filter(p => p.status === st).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
  const today = todayStr()
  return (
    <>
      <div className="row wrap">
        <button className="btn primary" onClick={() => setOpen({ id: uid(), updatedAt: 0, name: '', status: 'active', milestones: [], createdAt: Date.now() })}><Plus size={16} />{L('مشروع جديد', 'New project')}</button>
        <span className="grow" />
        <Seg label={L('الحالة', 'Status')} value={st} onChange={setSt} options={[{ v: 'active', l: L('نشطة', 'Active') }, { v: 'done', l: L('منجزة', 'Done') }, { v: 'archived', l: L('مؤرشفة', 'Archived') }]} />
      </div>
      {list.length === 0 && <div className="card"><Empty icon={<FolderKanban size={30} />} text={L('لا مشاريع في هذه القائمة.', 'No projects in this list.')} /></div>}
      <div className="grid g2">
        {list.map(p => {
          const ts = tasks.filter(t => t.projectId === p.id && t.status !== 'cancelled')
          const done = ts.filter(t => t.status === 'completed').length
          const ms = p.milestones.filter(m => m.done).length
          const total = ts.length + p.milestones.length
          const pct = total ? Math.round(((done + ms) / total) * 100) : 0
          const over = ts.filter(t => isOverdue(t, today)).length
          const cat = cats.find(c => c.id === p.categoryId)
          return (
            <section key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(p)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOpen(p)}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <b style={{ fontSize: 16 }}>{p.name}</b>
                  <div className="row wrap" style={{ gap: 5, marginTop: 4 }}>
                    <CatPill cat={cat} />
                    {over > 0 && <span className="pill overdue">{over} {L('متأخرة', 'overdue')}</span>}
                    {p.demo && <span className="pill outline">{L('تجريبي', 'Demo')}</span>}
                  </div>
                </div>
                {p.deadline && <DateBadge date={p.deadline} sm cream />}
              </div>
              {p.desc && <p className="small muted" style={{ margin: '8px 0 0' }}>{p.desc}</p>}
              <div className="row" style={{ marginTop: 12 }}>
                <div className="hbar grow" style={{ ['--c' as any]: cat?.color || 'var(--teal)' }}><div style={{ width: pct + '%' }} /></div>
                <b className="small ltr">{pct}%</b>
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{done}/{ts.length} {L('مهام', 'tasks')} · {ms}/{p.milestones.length} {L('مراحل', 'milestones')}{p.deadline ? ` · ${L('الموعد النهائي', 'deadline')} ${relDay(p.deadline)}` : ''}</div>
            </section>
          )
        })}
      </div>
      {open && <ProjectEditor project={open} tasks={tasks} onClose={() => setOpen(null)} />}
    </>
  )
}

function ProjectEditor({ project, tasks, onClose }: { project: Project; tasks: Task[]; onClose: () => void }) {
  const { quickAdd } = useApp()
  const cats = useCategories() || []
  const projects = useProjects() || []
  const [p, setP] = useState(project)
  const isNew = !project.updatedAt
  const ts = tasks.filter(t => t.projectId === p.id)
  const submit = async (close = true) => {
    if (!p.name.trim()) { toast(L('اكتب اسم المشروع', 'Enter a project name'), { err: true }); return false }
    await save('projects', { ...p, name: p.name.trim(), milestones: p.milestones.filter(m => m.title.trim()) })
    if (close) onClose()
    return true
  }
  const del = async () => {
    if (!(await confirmDialog({ title: L('حذف المشروع؟', 'Delete project?'), body: ts.length ? L(`ستبقى ${ts.length} مهام دون مشروع.`, `${ts.length} tasks will be unlinked.`) : p.name, ok: L('حذف', 'Delete'), danger: true }))) return
    for (const t of ts) await save('tasks', { ...t, projectId: null })
    await remove('projects', p.id)
    onClose()
  }
  return (
    <Modal wide title={isNew ? L('مشروع جديد', 'New project') : p.name || L('مشروع', 'Project')} icon={<FolderKanban size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={() => submit()}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      <span className="grow" />
      {!isNew && <button className="btn ghost icon sm danger" onClick={del} aria-label={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
    </>}>
      <div className="grid g2">
        <label className="field"><span>{L('الاسم', 'Name')} *</span><input className="input" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>{L('التصنيف', 'Category')}</span>
          <select className="input" value={p.categoryId || ''} onChange={e => setP({ ...p, categoryId: e.target.value || null })}>
            <option value="">{L('— بدون —', '— None —')}</option>{cats.map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
          </select>
        </label>
        <label className="field"><span>{L('الموعد النهائي', 'Deadline')}</span><input className="input" type="date" value={p.deadline || ''} onChange={e => setP({ ...p, deadline: e.target.value || null })} /></label>
        <label className="field"><span>{L('الحالة', 'Status')}</span>
          <select className="input" value={p.status} onChange={e => setP({ ...p, status: e.target.value as any })}>
            <option value="active">{L('نشط', 'Active')}</option><option value="done">{L('منجز', 'Done')}</option><option value="archived">{L('مؤرشف', 'Archived')}</option>
          </select>
        </label>
      </div>
      <label className="field"><span>{L('الوصف', 'Description')}</span><textarea className="input" value={p.desc || ''} onChange={e => setP({ ...p, desc: e.target.value })} /></label>
      <div className="field"><span className="row"><Flag size={15} />{L('المراحل', 'Milestones')}</span>
        {p.milestones.map((m, i) => (
          <div key={m.id} className="row">
            <input type="checkbox" className="check" style={{ width: 20, height: 20, accentColor: 'var(--teal)' }} checked={m.done} onChange={() => setP({ ...p, milestones: p.milestones.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} aria-label={L('منجزة', 'Done')} />
            <input className="input" value={m.title} onChange={e => setP({ ...p, milestones: p.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <input className="input" type="date" style={{ width: 160 }} value={m.date || ''} onChange={e => setP({ ...p, milestones: p.milestones.map((x, j) => (j === i ? { ...x, date: e.target.value || null } : x)) })} aria-label={L('التاريخ', 'Date')} />
            <button className="btn ghost icon sm" onClick={() => setP({ ...p, milestones: p.milestones.filter((_, j) => j !== i) })} aria-label={L('حذف', 'Remove')}><X size={15} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setP({ ...p, milestones: [...p.milestones, { id: uid(), title: '', date: null, done: false }] })}><Plus size={14} />{L('إضافة مرحلة', 'Add milestone')}</button>
      </div>
      <label className="field"><span>{L('ملاحظات', 'Notes')}</span><textarea className="input" value={p.notes || ''} onChange={e => setP({ ...p, notes: e.target.value })} /></label>
      <div className="field">
        <div className="row between"><span className="label">{L('مهام المشروع', 'Project tasks')} ({ts.length})</span>
          <button className="btn sm" onClick={async () => { if (await submit(false)) { onClose(); quickAdd({ kind: 'task', projectId: p.id, categoryId: p.categoryId || undefined, date: null }) } }}><Plus size={14} />{L('مهمة', 'Task')}</button></div>
        {ts.length === 0 ? <span className="small muted">{L('لا مهام مرتبطة بعد.', 'No linked tasks yet.')}</span> : ts.map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} />)}
      </div>
    </Modal>
  )
}

export { db }
