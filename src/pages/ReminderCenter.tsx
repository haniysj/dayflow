import { Bell, BellRing, Check, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app-context'
import { Empty, Modal } from '../components/ui'
import { fmtTime, msToDate, msToHM, relDay } from '../lib/dates'
import { L } from '../lib/i18n'
import { centerItems, clearCenter, dismissCenter, onCenter, permission, snooze, upcoming, type ReminderItem } from '../lib/notify'

export function ReminderCenter({ onClose }: { onClose: () => void }) {
  const { go } = useApp()
  const [, force] = useState(0)
  useEffect(() => onCenter(() => force(x => x + 1)), [])
  const fired = centerItems().filter(i => !i.dismissed).reverse()
  const next = upcoming().filter(i => i.at > Date.now()).slice(0, 15)
  const perm = permission()
  const when = (ms: number) => `${relDay(msToDate(ms))} ${fmtTime(msToHM(ms))}`
  const openItem = (i: ReminderItem) => {
    onClose()
    const p = Object.fromEntries(new URL(i.url, location.origin).searchParams)
    if (p.view) go(p.view as any)
  }
  return (
    <Modal title={L('مركز التذكيرات', 'Reminder center')} icon={<Bell size={18} />} onClose={onClose} footer={<>
      {fired.length > 0 && <button className="btn" onClick={clearCenter}><Check size={15} />{L('تجاهل الكل', 'Dismiss all')}</button>}
      <span className="grow" />
      <button className="btn ghost sm" onClick={() => { onClose(); go('settings', { tab: 'notify' }) }}>{L('إعدادات التنبيهات', 'Notification settings')}</button>
    </>}>
      {perm !== 'granted' && <div className="banner warn small">{perm === 'unsupported' ? L('هذا المتصفح لا يدعم إشعارات النظام. ستظهر التذكيرات هنا وداخل التطبيق فقط.', 'This browser does not support system notifications. Reminders appear here and in-app only.') : L('إشعارات النظام غير مفعّلة — فعّلها من الإعدادات لتصلك التذكيرات خارج التطبيق.', 'System notifications are off — enable them in Settings to get reminders outside the app.')}</div>}
      <div>
        <div className="section-title">{L('حان وقتها', 'Due now')} ({fired.length})</div>
        {fired.length === 0 ? <Empty icon={<BellRing size={26} />} text={L('لا تذكيرات بانتظارك.', 'No reminders waiting.')} /> : fired.map(i => (
          <div key={i.id + i.firedAt} className="list-item" style={{ alignItems: 'flex-start' }}>
            <BellRing size={16} style={{ marginTop: 4, color: 'var(--accent)' }} />
            <div className="grow" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => openItem(i)}>
              <b>{i.title}</b>
              <div className="small muted">{i.body}</div>
              <div className="tiny muted">{when(i.at)}</div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn sm" onClick={() => snooze(i, 10)} title={L('غفوة 10 دقائق', 'Snooze 10 min')}><Clock size={13} /><span className="ltr">10m</span></button>
                <button className="btn sm" onClick={() => snooze(i, 60)}><span className="ltr">1h</span></button>
                <button className="btn sm" onClick={() => snooze(i, 'tomorrow')}>{L('غداً', 'Tmrw')}</button>
              </div>
              <button className="btn ghost sm" onClick={() => dismissCenter(i.id)}><Check size={14} />{L('تجاهل', 'Dismiss')}</button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="section-title">{L('القادمة', 'Upcoming')}</div>
        {next.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{L('لا تذكيرات مجدولة.', 'No scheduled reminders.')}</p> : next.map(i => (
          <div key={i.id} className="row small" style={{ padding: '4px 0' }}>
            <span className="ltr nowrap muted" style={{ minWidth: 110 }}>{when(i.at)}</span>
            <span className="grow ellipsis">{i.title}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
