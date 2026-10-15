import { Bell, BellOff, CheckCircle2, ExternalLink, Palmtree, Pencil, Plus, Trash2, Upload, X, Landmark, Info } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../app-context'
import { confirmDialog, DateBadge, Empty, FileIcon, Modal, Seg, Switch, toast } from '../components/ui'
import { addDays, diffDays, fmtMed, fmtShort, relDay, todayStr, hijri } from '../lib/dates'
import { remove, save, uid, useHolidays, useLeaves } from '../lib/db'
import { L, LEAVE_TYPE_LABEL } from '../lib/i18n'
import { exportHolidays, importHolidays } from '../lib/io'
import { countLeaveDays, leaveYearRange, newTask } from '../lib/logic'
import { scheduleSoon } from '../lib/notify'
import type { Holiday, Leave, LeaveType } from '../lib/types'

export function LeavePage() {
  const { settings } = useApp()
  const leaves = useLeaves() || []
  const holidays = useHolidays() || []
  const today = todayStr()
  const [edit, setEdit] = useState<Leave | null>(null)
  const yr = leaveYearRange(settings, today)
  const annual = leaves.filter(l => l.type === 'annual' && l.start <= yr.end && l.end >= yr.start)
  const used = annual.filter(l => l.end < today).reduce((a, l) => a + l.workingDays, 0)
  const booked = annual.filter(l => l.end >= today).reduce((a, l) => a + l.workingDays, 0)
  const allowance = settings.leaveAllowance != null ? settings.leaveAllowance + (settings.leaveCarryOver || 0) : null
  const remaining = allowance != null ? allowance - used - booked : null
  const upcoming = leaves.filter(l => l.end >= today)
  const past = leaves.filter(l => l.end < today).reverse()

  return (
    <div className="stack view-enter">
      <section className="card">
        <div className="card-h"><h2><Palmtree size={18} />{L('رصيد الإجازة الاعتيادية', 'Annual leave balance')}</h2><span className="spacer" /><span className="tiny muted ltr nowrap">{yr.start} → {yr.end}</span></div>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div className="kpi"><b>{allowance ?? '—'}</b><span>{L('الرصيد السنوي', 'Allowance')}{settings.leaveCarryOver ? ` (+${settings.leaveCarryOver} ${L('مرحّل', 'carried')})` : ''}</span></div>
          <div className="kpi"><b>{used}</b><span>{L('مستخدم', 'Used')}</span></div>
          <div className="kpi"><b>{booked}</b><span>{L('محجوز قادم', 'Booked')}</span></div>
          <div className="kpi"><b style={{ color: remaining != null && remaining < 0 ? 'var(--rose)' : 'var(--teal)' }}>{remaining ?? '—'}</b><span>{L('المتبقي', 'Remaining')}</span></div>
        </div>
        {allowance != null && <div className="hbar" style={{ marginTop: 12 }}><div style={{ width: `${Math.min(100, ((used + booked) / Math.max(1, allowance)) * 100)}%` }} /></div>}
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>{L(`يُحسب عدد الأيام حسب إعداداتك: ${settings.leaveCountWeekends ? 'تُحتسب' : 'لا تُحتسب'} عطلة نهاية الأسبوع، و${settings.leaveCountHolidays ? 'تُحتسب' : 'لا تُحتسب'} العطل الرسمية. عدّلها من الإعدادات وفق سياسة جهة عملك.`, `Days are counted per your settings: weekends ${settings.leaveCountWeekends ? 'count' : 'do not count'}, public holidays ${settings.leaveCountHolidays ? 'count' : 'do not count'}. Adjust in Settings to match your employer’s policy.`)}</p>
      </section>

      <section className="card">
        <div className="card-h"><h2>{L('الإجازات', 'Leave records')}</h2><span className="spacer" />
          <button className="btn primary sm" onClick={() => setEdit({ id: uid(), updatedAt: 0, type: 'annual', start: addDays(today, 7), end: addDays(today, 7), workingDays: 1, remindDaysBefore: 3, returnReminder: true })}><Plus size={15} />{L('إجازة', 'Leave')}</button></div>
        {leaves.length === 0 && <Empty icon={<Palmtree size={28} />} text={L('لم تُسجَّل إجازات بعد.', 'No leave recorded yet.')} />}
        {[...upcoming, ...past].map(l => {
          const status = l.start > today ? L(`بعد ${diffDays(l.start, today)} يوم`, `in ${diffDays(l.start, today)} days`) : l.end >= today ? L('جارية الآن', 'In progress') : L('منتهية', 'Past')
          return (
            <div key={l.id} className="list-item" style={{ opacity: l.end < today ? 0.7 : 1 }}>
              <DateBadge date={l.start} sm cream />
              <div className="grow">
                <b>{(LEAVE_TYPE_LABEL() as any)[l.type]}</b>
                <div className="row wrap" style={{ gap: 5 }}>
                  <span className="small ltr nowrap">{fmtShort(l.start)} – {fmtShort(l.end)}</span>
                  <span className="pill">{l.workingDays} {L('أيام عمل', 'working days')}</span>
                  <span className={`pill${l.start <= today && l.end >= today ? ' teal' : ''}`}>{status}</span>
                  {l.demo && <span className="pill outline">{L('تجريبي', 'Demo')}</span>}
                </div>
                {l.notes && <div className="tiny muted">{l.notes}</div>}
              </div>
              <button className="btn ghost icon sm" onClick={() => setEdit(l)} aria-label={L('تعديل', 'Edit')}><Pencil size={15} /></button>
            </div>
          )
        })}
      </section>

      <HolidaysSection holidays={holidays} />
      {edit && <LeaveEditor leave={edit} onClose={() => setEdit(null)} holidays={holidays} />}
    </div>
  )
}

function LeaveEditor({ leave, holidays, onClose }: { leave: Leave; holidays: Holiday[]; onClose: () => void }) {
  const { settings } = useApp()
  const [l, setL] = useState(leave)
  const [manual, setManual] = useState(!!leave.updatedAt && leave.workingDays !== countLeaveDays(leave.start, leave.end, settings, holidays))
  const [prep, setPrep] = useState<string[]>([])
  const isNew = !leave.updatedAt
  const auto = countLeaveDays(l.start, l.end, settings, holidays)
  const days = manual ? l.workingDays : auto
  const submit = async () => {
    if (!l.start || !l.end || l.end < l.start) return toast(L('تحقق من التواريخ', 'Check the dates'), { err: true })
    const prepIds: string[] = [...(l.prepTaskIds || [])]
    for (const title of prep.map(p => p.trim()).filter(Boolean)) {
      const t = newTask({ title, dueDate: addDays(l.start, -1), status: 'planned', reminders: [] })
      await save('tasks', t); prepIds.push(t.id)
    }
    await save('leaves', { ...l, demo: false, workingDays: days, prepTaskIds: prepIds })
    scheduleSoon()
    toast(L('حُفظت الإجازة', 'Leave saved'))
    onClose()
  }
  const del = async () => {
    if (!(await confirmDialog({ title: L('حذف الإجازة؟', 'Delete leave?'), ok: L('حذف', 'Delete'), danger: true }))) return
    await remove('leaves', l.id); scheduleSoon(); onClose()
  }
  return (
    <Modal title={isNew ? L('تسجيل إجازة', 'Record leave') : L('تعديل الإجازة', 'Edit leave')} icon={<Palmtree size={18} />} onClose={onClose} footer={<>
      <button className="btn primary" onClick={submit}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      <span className="grow" />
      {!isNew && <button className="btn ghost icon sm danger" onClick={del} aria-label={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
    </>}>
      <label className="field"><span>{L('نوع الإجازة', 'Leave type')}</span>
        <select className="input" value={l.type} onChange={e => setL({ ...l, type: e.target.value as LeaveType })}>{Object.entries(LEAVE_TYPE_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <div className="grid g2">
        <label className="field"><span>{L('من', 'From')}</span><input className="input" type="date" value={l.start} onChange={e => setL({ ...l, start: e.target.value, end: l.end < e.target.value ? e.target.value : l.end })} /></label>
        <label className="field"><span>{L('إلى', 'To')}</span><input className="input" type="date" value={l.end} min={l.start} onChange={e => setL({ ...l, end: e.target.value })} /></label>
      </div>
      <div className="banner info" style={{ alignItems: 'center' }}>
        <div className="grow"><b>{days}</b> {L('أيام عمل', 'working days')} <span className="tiny muted">({L('تلقائي:', 'auto:')} {auto})</span></div>
        <label className="check small"><input type="checkbox" checked={manual} onChange={e => { setManual(e.target.checked); setL({ ...l, workingDays: auto }) }} />{L('تعديل يدوي', 'Override')}</label>
        {manual && <input className="input" type="number" min={0} style={{ width: 80 }} value={l.workingDays} onChange={e => setL({ ...l, workingDays: Math.max(0, +e.target.value) })} aria-label={L('عدد الأيام', 'Days')} />}
      </div>
      <div className="grid g2">
        <label className="field"><span>{L('تذكير قبل البداية (أيام)', 'Remind before (days)')}</span>
          <input className="input" type="number" min={0} max={60} value={l.remindDaysBefore ?? ''} placeholder={L('بدون', 'None')} onChange={e => setL({ ...l, remindDaysBefore: e.target.value === '' ? null : +e.target.value })} />
        </label>
        <div className="field"><span>{L('تذكير بالعودة للعمل', 'Return-to-work reminder')}</span><div className="row" style={{ minHeight: 42 }}><Switch label={L('تذكير العودة', 'Return reminder')} checked={!!l.returnReminder} onChange={v => setL({ ...l, returnReminder: v })} /><span className="small muted">{L('مساء آخر يوم', 'Evening of the last day')}</span></div></div>
      </div>
      <div className="field"><span>{L('مهام تحضيرية قبل الإجازة (اختياري)', 'Preparation tasks (optional)')}</span>
        {prep.map((p, i) => <div key={i} className="row"><input className="input" value={p} autoFocus onChange={e => setPrep(prep.map((x, j) => (j === i ? e.target.value : x)))} /><button className="btn ghost icon sm" onClick={() => setPrep(prep.filter((_, j) => j !== i))} aria-label={L('حذف', 'Remove')}><X size={15} /></button></div>)}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPrep([...prep, ''])}><Plus size={14} />{L('مهمة تحضيرية', 'Prep task')}</button>
        {!!l.prepTaskIds?.length && <span className="tiny muted">{l.prepTaskIds.length} {L('مهام تحضيرية مرتبطة', 'linked prep tasks')}</span>}
        <span className="tiny muted">{L('تُنشأ كمهام مستحقة في اليوم السابق للإجازة.', 'Created as tasks due the day before your leave.')}</span>
      </div>
      <label className="field"><span>{L('ملاحظات', 'Notes')}</span><textarea className="input" value={l.notes || ''} onChange={e => setL({ ...l, notes: e.target.value })} /></label>
    </Modal>
  )
}

function HolidaysSection({ holidays }: { holidays: Holiday[] }) {
  const today = todayStr()
  const years = [...new Set(holidays.map(h => h.start.slice(0, 4)))].sort()
  const [year, setYear] = useState(years.includes(today.slice(0, 4)) ? today.slice(0, 4) : years[0] || today.slice(0, 4))
  const [edit, setEdit] = useState<Holiday | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const list = holidays.filter(h => h.start.startsWith(year) || h.end.startsWith(year))
  const lastVerified = holidays.filter(h => h.verifiedAt).map(h => h.verifiedAt!).sort().pop()

  const doImport = async (f: File) => {
    try { const r = await importHolidays(await f.text()); toast(L(`جديد ${r.added} · محدّث ${r.updated} · متجاهل ${r.skipped}`, `Added ${r.added} · updated ${r.updated} · skipped ${r.skipped}`)) }
    catch { toast(L('ملف غير صالح', 'Invalid file'), { err: true }) }
  }
  return (
    <section className="card">
      <div className="card-h">
        <h2><Landmark size={18} />{L('العطل الرسمية — سلطنة عُمان', 'Official holidays — Oman')}</h2>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setEdit({ id: uid(), updatedAt: 0, name: '', start: today, end: today, status: 'confirmed', official: true, source: '', verifiedAt: today })}><Plus size={15} /><span className="vh-m">{L('إضافة', 'Add')}</span></button>
      </div>
      <div className="banner info" style={{ marginBottom: 12 }}>
        <Info size={18} style={{ flexShrink: 0 }} />
        <div className="small">
          {L('المرجع الرسمي: البوابة الحكومية الموحدة ', 'Authoritative source: Oman government portal ')}
          <a href="https://gov.om/en/important-dates-and-holidays" target="_blank" rel="noopener noreferrer">gov.om <ExternalLink size={11} /></a>
          {L(' وقرارات مجلس الوزراء. لا توجد مزامنة آلية — تُحدَّث البيانات يدوياً أو باستيراد ملف. تواريخ الأعياد تتبع رؤية الهلال، والتواريخ «التقديرية» ليست رسمية حتى يُعلن عنها.', ' and Council of Ministers announcements. There is no live sync — update manually or import a file. Eid dates follow moon sighting; “estimated” dates are not official until announced.')}
          {lastVerified && <div className="tiny" style={{ marginTop: 4 }}>{L('آخر تحقق:', 'Last verified:')} <span className="ltr">{lastVerified}</span></div>}
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <Seg label={L('السنة', 'Year')} value={year} onChange={setYear} options={years.map(y => ({ v: y, l: <span className="ltr">{y}</span> }))} />
        <span className="grow" />
        <button className="btn sm" onClick={exportHolidays}><FileIcon kind="json" size={17} />{L('تصدير', 'Export')}</button>
        <button className="btn sm" onClick={() => file.current?.click()}><Upload size={15} />{L('استيراد', 'Import')}</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
      </div>
      {list.length === 0 && <Empty text={L('لا عطل مسجلة لهذه السنة.', 'No holidays recorded for this year.')} />}
      {list.map(h => (
        <div key={h.id} className="list-item" style={{ opacity: h.end < today ? 0.65 : 1 }}>
          <DateBadge date={h.start} sm cream />
          <div className="grow">
            <b>{h.name}</b>{h.nameEn && <span className="tiny muted hide-m"> · {h.nameEn}</span>}
            <div className="row wrap" style={{ gap: 5 }}>
              <span className="small ltr nowrap">{h.start === h.end ? fmtMed(h.start) : `${fmtShort(h.start)} – ${fmtShort(h.end)}`}</span>
              {h.start === h.end ? null : <span className="pill">{diffDays(h.end, h.start) + 1} {L('أيام', 'days')}</span>}
              {h.status === 'confirmed' ? <span className="pill teal"><CheckCircle2 size={11} />{L('مؤكد', 'Confirmed')}</span> : <span className="pill saffron" style={{ border: '1px dashed' }}>{L('تقديري — غير مؤكد', 'Estimated — unconfirmed')}</span>}
              {!h.official && <span className="pill outline">{L('مناسبة شخصية', 'Personal')}</span>}
              {h.start >= today && <span className="tiny muted">{relDay(h.start)}</span>}
            </div>
            <div className="tiny muted">{h.source}{h.sourceUrl && <> · <a href={h.sourceUrl} target="_blank" rel="noopener noreferrer">{L('المصدر', 'source')}</a></>}{h.verifiedAt ? ` · ${L('تحقق', 'verified')} ${h.verifiedAt}` : ''} · {hijri(h.start)}</div>
          </div>
          <button className="btn ghost icon sm" onClick={async () => { await save('holidays', { ...h, remind: !h.remind }); scheduleSoon(); toast(h.remind ? L('أُلغي التذكير', 'Reminder off') : L('سيُذكّرك قبلها بيوم', 'You’ll be reminded a day before')) }} aria-label={L('تذكير', 'Reminder')} aria-pressed={!!h.remind} title={L('تذكير قبل يوم', 'Remind a day before')}>{h.remind ? <Bell size={15} color="var(--accent)" /> : <BellOff size={15} />}</button>
          <button className="btn ghost icon sm" onClick={() => setEdit(h)} aria-label={L('تعديل', 'Edit')}><Pencil size={15} /></button>
        </div>
      ))}
      {edit && <HolidayEditor h={edit} onClose={() => setEdit(null)} />}
    </section>
  )
}

function HolidayEditor({ h: init, onClose }: { h: Holiday; onClose: () => void }) {
  const [h, setH] = useState(init)
  const isNew = !init.updatedAt
  const submit = async () => {
    if (!h.name.trim() || !h.start) return toast(L('أكمل الاسم والتاريخ', 'Fill in name and date'), { err: true })
    await save('holidays', { ...h, name: h.name.trim(), end: h.end && h.end >= h.start ? h.end : h.start })
    scheduleSoon(); onClose()
  }
  return (
    <Modal title={isNew ? L('إضافة عطلة / مناسبة', 'Add holiday / occasion') : L('تعديل', 'Edit')} onClose={onClose} footer={<>
      <button className="btn primary" onClick={submit}>{L('حفظ', 'Save')}</button>
      <button className="btn" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      <span className="grow" />
      {h.status === 'estimated' && <button className="btn sm accent" onClick={() => setH({ ...h, status: 'confirmed', verifiedAt: todayStr() })}><CheckCircle2 size={15} />{L('تأكيد بعد الإعلان', 'Confirm (announced)')}</button>}
      {!isNew && <button className="btn ghost icon sm danger" onClick={async () => { if (await confirmDialog({ title: L('حذف؟', 'Delete?'), ok: L('حذف', 'Delete'), danger: true })) { await remove('holidays', h.id); onClose() } }} aria-label={L('حذف', 'Delete')}><Trash2 size={16} /></button>}
    </>}>
      <div className="grid g2">
        <label className="field"><span>{L('الاسم', 'Name')}</span><input className="input" value={h.name} onChange={e => setH({ ...h, name: e.target.value })} /></label>
        <label className="field"><span>{L('الاسم بالإنجليزية', 'English name')}</span><input className="input" dir="ltr" value={h.nameEn || ''} onChange={e => setH({ ...h, nameEn: e.target.value })} /></label>
        <label className="field"><span>{L('من', 'From')}</span><input className="input" type="date" value={h.start} onChange={e => setH({ ...h, start: e.target.value, end: h.end < e.target.value ? e.target.value : h.end })} /></label>
        <label className="field"><span>{L('إلى', 'To')}</span><input className="input" type="date" value={h.end} min={h.start} onChange={e => setH({ ...h, end: e.target.value })} /></label>
      </div>
      <div className="row wrap">
        <Seg label={L('الحالة', 'Status')} value={h.status} onChange={v => setH({ ...h, status: v, verifiedAt: v === 'confirmed' ? h.verifiedAt || todayStr() : null })} options={[{ v: 'confirmed', l: L('مؤكد رسمياً', 'Officially confirmed') }, { v: 'estimated', l: L('تقديري', 'Estimated') }]} />
        <Seg label={L('النوع', 'Kind')} value={h.official ? 'o' : 'p'} onChange={v => setH({ ...h, official: v === 'o' })} options={[{ v: 'o', l: L('عطلة رسمية', 'Official holiday') }, { v: 'p', l: L('مناسبة شخصية', 'Personal occasion') }]} />
      </div>
      <div className="grid g2">
        <label className="field"><span>{L('المصدر', 'Source')}</span><input className="input" value={h.source || ''} onChange={e => setH({ ...h, source: e.target.value })} /></label>
        <label className="field"><span>{L('رابط المصدر', 'Source URL')}</span><input className="input" dir="ltr" type="url" value={h.sourceUrl || ''} onChange={e => setH({ ...h, sourceUrl: e.target.value })} /></label>
        <label className="field"><span>{L('تاريخ التحقق', 'Verified on')}</span><input className="input" type="date" value={h.verifiedAt || ''} onChange={e => setH({ ...h, verifiedAt: e.target.value || null })} /></label>
      </div>
    </Modal>
  )
}
