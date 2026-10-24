import { CheckCircle2, CircleDashed, MoonStar, Redo2 } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app-context'
import { Modal, toast } from '../components/ui'
import { addDays, fmtLong, msToDate } from '../lib/dates'
import { db, save, useDay, useTasks } from '../lib/db'
import { L } from '../lib/i18n'
import { emptySlots, isOpen, normSlots, rescheduleTask, setPriority } from '../lib/logic'
import type { DayReview as Review } from '../lib/types'

export function DayReview({ date, onClose }: { date: string; onClose: () => void }) {
  const { settings } = useApp()
  const tasks = useTasks() || []
  const day = useDay(date)
  const completed = tasks.filter(t => t.status === 'completed' && t.completedAt && msToDate(t.completedAt) === date)
  const incomplete = tasks.filter(t => isOpen(t) && t.dueDate === date)
  const postponed = tasks.filter(t => t.originalDueDate === date && t.dueDate !== date)
  const [r, setR] = useState<Review | null>(null)
  const rev: Review = r ?? day?.review ?? { answers: ['', '', ''], rating: null, reflection: '', tomorrowTaskId: null, tomorrowText: '' }
  const up = (c: Partial<Review>) => setR({ ...rev, ...c })
  const tomorrow = addDays(date, 1)
  const candidates = tasks.filter(t => isOpen(t) && (!t.dueDate || t.dueDate <= tomorrow))

  const submit = async () => {
    const d = (await db.days.get(date)) || { id: date, updatedAt: 0, priorities: emptySlots() }
    await save('days', { ...d, deleted: 0, review: { ...rev, doneAt: Date.now() } })
    if (rev.tomorrowTaskId) {
      const t = tasks.find(x => x.id === rev.tomorrowTaskId)
      if (t) {
        if (t.dueDate !== tomorrow) await rescheduleTask(t, tomorrow)
        const td = await db.days.get(tomorrow)
        const slots = td && !td.deleted ? normSlots(td.priorities) : emptySlots()
        if (!slots.some(s => s?.taskId === t.id)) {
          const idx = slots.findIndex(s => !s)
          if (idx >= 0) await setPriority(tomorrow, idx, { title: t.title, taskId: t.id, priority: t.priority, estMin: t.estMin, done: false })
        }
      }
    } else if (rev.tomorrowText?.trim()) {
      const td = await db.days.get(tomorrow)
      const slots = td && !td.deleted ? normSlots(td.priorities) : emptySlots()
      const idx = slots.findIndex(s => !s)
      if (idx >= 0) await setPriority(tomorrow, idx, { title: rev.tomorrowText.trim(), priority: 'high', done: false })
    }
    toast(L('حُفظت المراجعة. نهاية يوم طيبة.', 'Review saved. Have a good evening.'))
    onClose()
  }

  return (
    <Modal wide title={L('مراجعة نهاية اليوم', 'End-of-day review')} icon={<MoonStar size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={submit}>{L('حفظ المراجعة', 'Save review')}</button>
      <button className="btn" onClick={onClose}>{L('لاحقاً', 'Later')}</button>
    </>}>
      <div className="small muted">{fmtLong(date)}</div>
      <div className="grid g3" style={{ gap: 10 }}>
        <Block icon={<CheckCircle2 size={16} color="var(--teal)" />} title={L('أنجزت', 'Completed')} items={completed.map(t => t.title)} empty={L('—', '—')} />
        <Block icon={<CircleDashed size={16} />} title={L('لم تكتمل بعد', 'Still open')} items={incomplete.map(t => t.title)} empty={L('لا شيء', 'Nothing')} />
        <Block icon={<Redo2 size={16} />} title={L('أُجّلت لموعد آخر', 'Moved to another date')} items={postponed.map(t => t.title)} empty={L('لا شيء', 'Nothing')} />
      </div>
      {incomplete.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>{L('غير المكتمل جزء طبيعي من أي يوم؛ قرّر ما يستحق الغد من «خطّط للغد».', 'Unfinished items are a normal part of any day; decide what deserves tomorrow in “Plan Tomorrow”.')}</p>}
      {settings.reviewQuestions.map((q, i) => (
        <label key={i} className="field"><span>{q} <span className="muted tiny">({L('اختياري', 'optional')})</span></span>
          <input className="input" value={rev.answers[i] || ''} onChange={e => { const a = [...rev.answers]; a[i] = e.target.value; up({ answers: a }) }} />
        </label>
      ))}
      <div className="field"><span>{L('كيف تقيّم يومك؟', 'How was your day?')}</span>
        <div className="stars" role="radiogroup" aria-label={L('التقييم', 'Rating')}>
          {[1, 2, 3, 4, 5].map(n => <button key={n} role="radio" aria-checked={rev.rating === n} className={rev.rating === n ? 'on' : ''} onClick={() => up({ rating: rev.rating === n ? null : n })}>{n}</button>)}
        </div>
      </div>
      <label className="field"><span>{L('تأمل قصير', 'Short reflection')}</span>
        <textarea className="input" value={rev.reflection || ''} onChange={e => up({ reflection: e.target.value })} />
      </label>
      <label className="field"><span>{L('أهم مهمة للغد', 'Most important task for tomorrow')}</span>
        <select className="input" value={rev.tomorrowTaskId || ''} onChange={e => up({ tomorrowTaskId: e.target.value || null })}>
          <option value="">{L('— اكتبها بدلاً من الاختيار —', '— write it instead —')}</option>
          {candidates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      {!rev.tomorrowTaskId && <input className="input" value={rev.tomorrowText || ''} onChange={e => up({ tomorrowText: e.target.value })} placeholder={L('مثال: إنهاء مسودة التقرير', 'e.g. finish the report draft')} aria-label={L('أهم مهمة للغد', 'Most important task for tomorrow')} />}
      <span className="tiny muted">{L('ستُضاف إلى أولويات الغد إن كانت هناك خانة فارغة.', 'It will be added to tomorrow’s priorities if a slot is free.')}</span>
    </Modal>
  )
}

function Block({ icon, title, items, empty }: { icon: React.ReactNode; title: string; items: string[]; empty: string }) {
  return (
    <div className="card flat" style={{ padding: 12 }}>
      <div className="row small" style={{ fontWeight: 700 }}>{icon}{title} <span className="muted">({items.length})</span></div>
      <div className="col" style={{ gap: 2, marginTop: 6 }}>
        {items.length ? items.slice(0, 8).map((t, i) => <span key={i} className="small ellipsis">• {t}</span>) : <span className="small muted">{empty}</span>}
        {items.length > 8 && <span className="tiny muted">+{items.length - 8}</span>}
      </div>
    </div>
  )
}
