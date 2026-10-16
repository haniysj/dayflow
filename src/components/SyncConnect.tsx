import { Cloud, KeyRound, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { L } from '../lib/i18n'
import { errCode, login, resetLocal, serverHasData, serverStatus, setupPassword, syncNow } from '../lib/sync'
import { confirmDialog, Modal, toast } from './ui'

const msg = (c: string) => ({
  DF_BADPASS: L('كلمة المرور غير صحيحة', 'Wrong password'),
  DF_SHORT: L('كلمة المرور قصيرة (6 أحرف على الأقل)', 'Password too short (min 6)'),
  DF_EXISTS: L('كلمة المرور معيّنة مسبقاً — سجّل الدخول', 'Password already set — sign in'),
  NETWORK: L('لا يوجد اتصال بالإنترنت — حاول عند عودة الاتصال', 'No internet connection — try again when online'),
} as Record<string, string>)[c] || c

/** After a device signs in: a fresh device takes the cloud copy; a device with its own data chooses merge or replace. */
async function afterLogin() {
  const pristine = !!localStorage.getItem('df-pristine')
  const remote = await serverHasData()
  if (remote && pristine) await resetLocal()
  else if (remote && !pristine) {
    const c = await confirmDialog({
      title: L('يوجد بيانات في السحابة', 'Cloud already has data'),
      body: L('هل تريد دمج بيانات هذا الجهاز مع السحابة، أم استبدالها ببيانات السحابة فقط؟', 'Merge this device’s data with the cloud, or replace it with the cloud data only?'),
      ok: '', choices: [{ v: 'merge', l: L('دمج', 'Merge') }, { v: 'replace', l: L('استبدال ببيانات السحابة', 'Use cloud data only'), danger: true }],
    })
    if (c === 'replace') await resetLocal()
  }
  localStorage.removeItem('df-pristine')
  await syncNow()
  toast(L('تم الربط والمزامنة', 'Connected and synced'))
}

/** Password form: creates the sync password on the very first device, signs in on the others. */
export function SyncConnectForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const [has, setHas] = useState<boolean | null>(null)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { serverStatus().then(r => setHas(r.has_password)).catch(e => { setErr(msg(errCode(e))); setHas(true) }) }, [])

  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true)
    try { await fn(); await afterLogin(); onDone?.() } catch (e) { setErr(msg(errCode(e))) }
    setBusy(false); setPass(''); setPass2('')
  }
  const doLogin = () => { if (pass && !busy) run(() => login(pass)) }
  const doSetup = () => {
    if (busy) return
    if (pass.length < 6) return setErr(msg('DF_SHORT'))
    if (pass !== pass2) return setErr(L('كلمتا المرور غير متطابقتين', 'Passwords do not match'))
    run(() => setupPassword(pass))
  }
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); fn() } }

  if (has === null) return <p className="muted small" style={{ margin: 0 }}>{L('جارٍ التحقق…', 'Checking…')}</p>
  return (
    <div className="col">
      {err && <div className="banner err small" role="alert">{err}</div>}
      {has ? <>
        <label className="field"><span>{L('كلمة مرور المزامنة', 'Sync password')}</span>
          <input className="input" type="password" autoComplete="current-password" autoFocus={autoFocus} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={enter(doLogin)} style={{ maxWidth: 320 }} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !pass} onClick={doLogin}><KeyRound size={16} />{busy ? L('جارٍ الربط…', 'Connecting…') : L('تسجيل الدخول والمزامنة', 'Sign in & sync')}</button>
      </> : <>
        <div className="banner info small">{L('أول جهاز: اختر كلمة مرور لحماية بياناتك في السحابة. ستستخدمها لربط أجهزتك الأخرى.', 'First device: choose a password to protect your cloud data. You’ll use it to link your other devices.')}</div>
        <label className="field"><span>{L('كلمة مرور جديدة', 'New password')}</span>
          <input className="input" type="password" autoComplete="new-password" autoFocus={autoFocus} value={pass} onChange={e => setPass(e.target.value)} style={{ maxWidth: 320 }} />
        </label>
        <label className="field"><span>{L('تأكيد كلمة المرور', 'Confirm password')}</span>
          <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={e => setPass2(e.target.value)} onKeyDown={enter(doSetup)} style={{ maxWidth: 320 }} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={doSetup}><ShieldCheck size={16} />{busy ? L('جارٍ الربط…', 'Connecting…') : L('إنشاء والمزامنة', 'Create & sync')}</button>
      </>}
    </div>
  )
}

/** Shown automatically when sync is on (the default) but this device is not connected yet. */
export function SyncConnectPrompt({ onClose, onDisable }: { onClose: () => void; onDisable: () => void }) {
  return (
    <Modal title={L('ربط هذا الجهاز بالسحابة', 'Connect this device to the cloud')} icon={<Cloud size={18} />} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{L('لاحقاً', 'Later')}</button>
        <span className="grow" />
        <button className="btn ghost sm" onClick={onDisable}>{L('استخدام دون مزامنة', 'Use without sync')}</button>
      </>}>
      <p className="small muted" style={{ margin: 0 }}>{L('المزامنة مفعّلة افتراضياً: تُحفظ مهامك ومواعيدك في السحابة وتظهر على كل أجهزتك، ويعمل التطبيق دون إنترنت ثم يزامن عند الاتصال.', 'Sync is on by default: your tasks and events are saved to the cloud and appear on all your devices. The app works offline and syncs when back online.')}</p>
      <SyncConnectForm onDone={onClose} autoFocus />
    </Modal>
  )
}
