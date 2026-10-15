import { Archive, CalendarDays, FolderKanban, ListTodo, Search, StickyNote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app-context'
import { Modal } from '../components/ui'
import { msToDate, relDay } from '../lib/dates'
import { useEvents, useNotes, useProjects, useTasks } from '../lib/db'
import { L, STATUS_LABEL } from '../lib/i18n'

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { editTask, editEvent, go } = useApp()
  const tasks = useTasks() || []
  const events = useEvents() || []
  const notes = useNotes() || []
  const projects = useProjects() || []
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(true)
  const res = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const hit = (...xs: (string | undefined | null)[]) => xs.some(x => x?.toLowerCase().includes(s))
    const out: { key: string; icon: any; title: string; sub: string; arch?: boolean; open: () => void }[] = []
    for (const t of tasks) if (hit(t.title, t.desc, t.notes, t.contact, ...(t.subtasks || []).map(x => x.title)))
      out.push({ key: 't' + t.id, icon: ListTodo, title: t.title, sub: `${(STATUS_LABEL() as any)[t.status]}${t.dueDate ? ' · ' + relDay(t.dueDate) : ''}`, arch: ['archived', 'cancelled', 'completed'].includes(t.status), open: () => editTask(t) })
    for (const e of events) if (hit(e.title, e.notes, e.location))
      out.push({ key: 'e' + e.id, icon: CalendarDays, title: e.title, sub: relDay(e.date) + (e.recurrence ? ' · ' + L('متكرر', 'repeats') : ''), open: () => editEvent(e) })
    for (const n of notes) if (hit(n.text))
      out.push({ key: 'n' + n.id, icon: StickyNote, title: n.text.slice(0, 90), sub: L('ملاحظة', 'Note') + ' · ' + relDay(msToDate(n.createdAt)), arch: n.archived, open: () => go('today') })
    for (const p of projects) if (hit(p.name, p.desc, p.notes, ...p.milestones.map(m => m.title)))
      out.push({ key: 'p' + p.id, icon: FolderKanban, title: p.name, sub: L('مشروع', 'Project'), arch: p.status !== 'active', open: () => go('categories', { tab: 'projects' }) })
    return out.filter(r => archived || !r.arch).slice(0, 60)
  }, [q, tasks, events, notes, projects, archived])
  return (
    <Modal title={L('بحث', 'Search')} icon={<Search size={18} />} onClose={onClose}>
      <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={L('ابحث في المهام والمواعيد والملاحظات والمشاريع…', 'Search tasks, events, notes, projects…')} aria-label={L('بحث', 'Search')} />
      <label className="check small"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />{L('تضمين المؤرشف والمكتمل', 'Include archived & completed')}</label>
      <div className="search-res" role="listbox">
        {q.trim().length >= 2 && res.length === 0 && <p className="muted small">{L('لا نتائج.', 'No results.')}</p>}
        {res.map(r => (
          <button key={r.key} role="option" aria-selected="false" onClick={() => { onClose(); setTimeout(r.open, 10) }}>
            <r.icon size={17} className="muted" />
            <span className="grow"><span style={{ display: 'block', fontWeight: 650 }}>{r.title}</span><span className="tiny muted">{r.sub}</span></span>
            {r.arch && <Archive size={14} className="muted" />}
          </button>
        ))}
      </div>
    </Modal>
  )
}
