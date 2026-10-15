import { BarChart3, CalendarRange, Info, Target } from 'lucide-react'
import { useMemo } from 'react'
import { useApp } from '../app-context'
import { TaskRow } from '../components/TaskRow'
import { catName, Empty, PrintIcon } from '../components/ui'
import { addDays, dow, fmtDuration, fmtShort, range, relDay, startOfWeek, todayStr, weekdayName, msToDate } from '../lib/dates'
import { useCategories, useDays, useEvents, useProjects, useTasks } from '../lib/db'
import { L } from '../lib/i18n'
import { expandEvents, isOpen, isOverdue } from '../lib/logic'
import { categoryLoad, dayStats, rate, weekBuckets } from '../lib/stats'

export function ReportsPage() {
  const { settings, go, params } = useApp()
  const tasks = useTasks() || []
  const days = useDays() || []
  const cats = useCategories() || []
  const projects = useProjects() || []
  const events = useEvents() || []
  const today = todayStr()
  const ws = startOfWeek(today, settings.weekStart)
  const we = addDays(ws, 6)
  const last7 = range(addDays(today, -6), today)
  const weekDates = range(ws, we)
  const stats7 = useMemo(() => dayStats(last7, tasks, days), [tasks, days, today])
  const statsWeek = useMemo(() => dayStats(weekDates, tasks, days), [tasks, days, ws])
  const todayS = stats7[stats7.length - 1]
  const sum = (arr: typeof stats7, k: keyof (typeof stats7)[0]) => arr.reduce((a, s) => a + (s[k] as number), 0)
  const weekDue = sum(statsWeek.filter(s => s.date <= today), 'due'), weekDone = sum(statsWeek.filter(s => s.date <= today), 'done')
  const planned = sum(statsWeek, 'planned'), plannedDone = sum(statsWeek, 'plannedDone')
  const prioSet = sum(statsWeek, 'prioSet'), prioDone = sum(statsWeek, 'prioDone')
  const workdaysSoFar = weekDates.filter(d => d <= today && settings.workdays.includes(dow(d)))
  const reviewed = statsWeek.filter(s => s.reviewed && workdaysSoFar.includes(s.date)).length
  const overdue = tasks.filter(t => isOverdue(t, today)).length
  const carried = tasks.filter(t => t.originalDueDate && t.originalDueDate >= ws && t.originalDueDate <= we && t.originalDueDate !== t.dueDate).length
  const weeks = weekBuckets(today, 6, settings.weekStart).map(w => {
    const s = dayStats(range(w.start, w.end > today ? today : w.end), tasks, days)
    const due = sum(s, 'due'), done = sum(s, 'done')
    return { ...w, due, done, r: rate(done, due) }
  })
  const monthStart = today.slice(0, 8) + '01'
  const load = categoryLoad(tasks, cats, monthStart, today)
  const maxLoad = Math.max(1, ...load.map(l => l.open + l.done))
  const tracked = tasks.filter(t => t.actualMin && t.completedAt && msToDate(t.completedAt) >= ws)
  const trackedSum = tracked.reduce((a, t) => a + (t.actualMin || 0), 0)
  const maxBar = Math.max(1, ...stats7.map(s => s.due))

  // weekly review
  const unfinished = tasks.filter(t => isOpen(t) && t.dueDate && t.dueDate >= ws && t.dueDate <= today)
  const nextWeek = [today, addDays(today, 7)] as const
  const deadlines = [
    ...tasks.filter(t => isOpen(t) && t.dueDate && t.dueDate > today && t.dueDate <= nextWeek[1] && (t.priority === 'high' || t.priority === 'urgent')).map(t => ({ d: t.dueDate!, title: t.title, kind: L('مهمة', 'Task') })),
    ...expandEvents(events.filter(e => e.type === 'deadline'), today, nextWeek[1]).map(e => ({ d: e.instanceDate, title: e.title, kind: L('موعد نهائي', 'Deadline') })),
    ...projects.filter(p => p.status === 'active' && p.deadline && p.deadline >= today && p.deadline <= addDays(today, 14)).map(p => ({ d: p.deadline!, title: p.name, kind: L('مشروع', 'Project') })),
    ...projects.flatMap(p => p.milestones.filter(m => !m.done && m.date && m.date >= today && m.date <= nextWeek[1]).map(m => ({ d: m.date!, title: `${p.name}: ${m.title}`, kind: L('مرحلة', 'Milestone') }))),
  ].sort((a, b) => a.d.localeCompare(b.d))
  const pctTxt = (n: number | null) => (n == null ? '—' : `${n}%`)

  return (
    <div className="stack view-enter">
      <div className="banner info no-print"><Info size={18} style={{ flexShrink: 0 }} /><span className="small">{L('هذه مؤشرات إنجاز للمهام فقط، ولا تقيس جودة العمل أو قيمته. لا تُعرض أوقات إلا ما سجّلته بنفسك.', 'These are task-completion indicators only — they do not measure the quality or value of your work. Only time you recorded yourself is shown.')}</span></div>
      <div className="print-only"><h2>{settings.appName} — {L('تقرير الأسبوع', 'Weekly report')} {fmtShort(ws)} – {fmtShort(we)}</h2></div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Kpi v={pctTxt(rate(todayS.done, todayS.due))} l={L('إنجاز اليوم', 'Today')} sub={`${todayS.done}/${todayS.due}`} />
        <Kpi v={pctTxt(rate(weekDone, weekDue))} l={L('إنجاز الأسبوع', 'This week')} sub={`${weekDone}/${weekDue}`} />
        <Kpi v={planned ? `${plannedDone}/${planned}` : '—'} l={L('المخطط مقابل المنجز', 'Planned vs done')} sub={planned ? pctTxt(rate(plannedDone, planned)) : L('من «خطّط للغد»', 'from “Plan Tomorrow”')} />
        <Kpi v={prioSet ? `${prioDone}/${prioSet}` : '—'} l={L('الأولويات الثلاث', 'Top-three done')} sub={L('هذا الأسبوع', 'this week')} />
        <Kpi v={String(overdue)} l={L('متأخرة الآن', 'Overdue now')} tone={overdue ? 'var(--overdue)' : undefined} />
        <Kpi v={String(carried)} l={L('مُرحّلة هذا الأسبوع', 'Carried forward')} sub={L('أُجّلت من موعدها', 'moved from due date')} />
        <Kpi v={`${reviewed}/${workdaysSoFar.length}`} l={L('انتظام المراجعة اليومية', 'Daily review consistency')} />
        <Kpi v={trackedSum ? fmtDuration(trackedSum) : '—'} l={L('وقت مسجّل', 'Tracked time')} sub={trackedSum ? `${tracked.length} ${L('مهام', 'tasks')}` : L('لا بيانات مسجّلة', 'nothing recorded')} />
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-h"><h2><BarChart3 size={18} />{L('آخر 7 أيام', 'Last 7 days')}</h2><span className="spacer" />
            <span className="row tiny muted"><span className="dot" style={{ ['--c' as any]: 'var(--line)' }} />{L('مستحقة', 'Due')} <span className="dot" style={{ ['--c' as any]: 'var(--teal)' }} />{L('منجزة', 'Done')}</span></div>
          <div className="bar-chart" role="img" aria-label={stats7.map(s => `${s.date}: ${s.done}/${s.due}`).join(', ')}>
            {stats7.map(s => (
              <div key={s.date} className="b">
                <span className="tiny ltr" style={{ fontWeight: 700 }}>{s.due ? `${s.done}/${s.due}` : ''}</span>
                <div className="bars">
                  <div className="bar" style={{ height: `${(s.due / maxBar) * 100}%` }} />
                  <div className="bar done" style={{ height: `${(s.done / maxBar) * 100}%` }} />
                </div>
                <span className="lbl">{weekdayName(s.date, 'short')}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2><CalendarRange size={18} />{L('الاتجاه الأسبوعي', 'Weekly trend')}</h2></div>
          <div className="bar-chart">
            {weeks.map(w => (
              <div key={w.start} className="b">
                <span className="tiny ltr" style={{ fontWeight: 700 }}>{w.r == null ? '—' : w.r + '%'}</span>
                <div className="bars"><div className="bar done" style={{ height: `${w.r ?? 0}%`, maxWidth: 34 }} /></div>
                <span className="lbl">{fmtShort(w.start)}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>{L('نسبة المهام المنجزة من المستحقة في كل أسبوع.', 'Share of due tasks completed each week.')}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>{L('العبء حسب التصنيف (هذا الشهر)', 'Workload by category (this month)')}</h2></div>
        {load.length === 0 ? <Empty text={L('لا بيانات بعد.', 'No data yet.')} /> : load.map(x => (
          <div key={x.cat.id} className="row" style={{ padding: '6px 0' }}>
            <span className="small ellipsis" style={{ width: 'min(42%, 220px)', fontWeight: 650 }}>{catName(x.cat)}</span>
            <div className="hbar grow" style={{ ['--c' as any]: x.cat.color }}><div style={{ width: `${((x.open + x.done) / maxLoad) * 100}%` }} /></div>
            <span className="tiny muted nowrap">{x.done} {L('منجزة', 'done')} · {x.open} {L('مفتوحة', 'open')}{x.est ? ` · ${fmtDuration(x.est)} ${L('مقدّر', 'est.')}` : ''}</span>
          </div>
        ))}
      </section>

      <section className="card" id="weekly-review" style={params.weekly ? { outline: '2px solid var(--accent)' } : undefined}>
        <div className="card-h">
          <h2><Target size={18} />{L('المراجعة الأسبوعية', 'Weekly review')}</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => window.print()}><PrintIcon size={16} />{L('طباعة', 'Print')}</button>
          <button className="btn primary sm no-print" onClick={() => go('tasks')}>{L('خطّط للأسبوع القادم', 'Plan next week')}</button>
        </div>
        <div className="grid g2">
          <div>
            <div className="section-title">{L('غير المنجز هذا الأسبوع', 'Unfinished this week')} ({unfinished.length})</div>
            {unfinished.length === 0 ? <p className="small muted">{L('لا شيء معلّق من هذا الأسبوع.', 'Nothing left over from this week.')}</p> : unfinished.slice(0, 12).map(t => <TaskRow key={t.id} t={t} cats={cats} projects={projects} />)}
          </div>
          <div>
            <div className="section-title">{L('مواعيد نهائية قادمة', 'Upcoming deadlines')} ({deadlines.length})</div>
            {deadlines.length === 0 ? <p className="small muted">{L('لا مواعيد نهائية خلال الأيام القادمة.', 'No deadlines coming up.')}</p> : deadlines.map((d, i) => (
              <div key={i} className="list-item"><span className="pill nowrap">{relDay(d.d)}</span><span className="grow small">{d.title}</span><span className="tiny muted">{d.kind}</span></div>
            ))}
          </div>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>{L('للأسبوع القادم: اختر من القائمة أعلاه ما يستحق أن يكون من أولوياتك، وانقله إلى أيامه من «تخطيط الأسبوع» في صفحة المهام.', 'For next week: pick what deserves priority from the lists above and place it on days via “Week plan” in Tasks.')}</p>
      </section>
    </div>
  )
}

function Kpi({ v, l, sub, tone }: { v: string; l: string; sub?: string; tone?: string }) {
  return <div className="card kpi" style={{ padding: 14 }}><b className="ltr" style={{ color: tone, alignSelf: 'flex-start' }}>{v}</b><span>{l}</span>{sub && <span className="tiny" style={{ fontWeight: 500 }}>{sub}</span>}</div>
}
