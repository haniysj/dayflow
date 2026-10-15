import {
  BadgeCheck, Banknote, Book, BookOpen, Briefcase, Calendar, CalendarClock, Car, ClipboardList, Compass, Flag, GraduationCap,
  Heart, Home, Hourglass, Lightbulb, Mail, MessageSquare, Phone, Plane, Star, Target, Users, Wrench, X, Folder,
  Dumbbell, Stethoscope, ShoppingCart, Camera, Code, PenLine, type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getLang, L } from '../lib/i18n'
import { monthShort } from '../lib/dates'
import type { Category } from '../lib/types'

export const ICONS: Record<string, LucideIcon> = {
  compass: Compass, users: Users, 'calendar-clock': CalendarClock, mail: Mail, 'book-open': BookOpen, 'badge-check': BadgeCheck,
  'graduation-cap': GraduationCap, hourglass: Hourglass, 'clipboard-list': ClipboardList, heart: Heart, briefcase: Briefcase,
  folder: Folder, target: Target, star: Star, flag: Flag, home: Home, plane: Plane, car: Car, phone: Phone, lightbulb: Lightbulb,
  book: Book, wrench: Wrench, banknote: Banknote, message: MessageSquare, calendar: Calendar, dumbbell: Dumbbell,
  health: Stethoscope, cart: ShoppingCart, camera: Camera, code: Code, pen: PenLine,
}
export const CatIcon = ({ name, size = 16 }: { name?: string; size?: number }) => {
  const I = ICONS[name || 'folder'] || Folder
  return <I size={size} aria-hidden />
}

export function CatPill({ cat }: { cat?: Category | null }) {
  if (!cat) return null
  return (
    <span className="pill c" style={{ ['--c' as any]: cat.color }}>
      <CatIcon name={cat.icon} size={12} />
      <span className="ellipsis">{catName(cat)}</span>
    </span>
  )
}
export const catName = (c: Category) => (getLang() === 'en' && c.nameEn ? c.nameEn : c.name)

export function DateBadge({ date, cream, sm }: { date: string; cream?: boolean; sm?: boolean }) {
  return (
    <div className={`date-badge${cream ? ' cream' : ''}${sm ? ' sm' : ''}`} aria-hidden>
      <b>{+date.slice(8)}</b>
      <span>{monthShort(date)}</span>
    </div>
  )
}

export function Modal({ title, icon, onClose, children, footer, wide, labelledBy }: {
  title: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, button:not(.modal-x)')
    setTimeout(() => first?.focus(), 30)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.hasAttribute('disabled'))
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', key, true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', key, true)
      document.body.style.overflow = ''
      if (window.matchMedia?.('(pointer: fine)').matches) setTimeout(() => { if (document.activeElement === document.body) prev?.focus?.({ preventScroll: true }) }, 250)
      else (document.activeElement as HTMLElement | null)?.blur?.()
    }
  }, [])
  return createPortal(
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} aria-labelledby={labelledBy} ref={ref}>
        <div className="modal-h">
          <h2>{icon}{title}</h2>
          <button className="btn ghost icon sm modal-x" onClick={onClose} aria-label={L('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------- toasts ----------
interface Toast { id: number; text: string; action?: { label: string; fn: () => void }; err?: boolean }
let toasts: Toast[] = []
const tsubs = new Set<(t: Toast[]) => void>()
let tid = 0
export function toast(text: string, opts: { action?: Toast['action']; err?: boolean; ms?: number } = {}) {
  const t: Toast = { id: ++tid, text, action: opts.action, err: opts.err }
  toasts = [...toasts.slice(-2), t]
  tsubs.forEach(f => f(toasts))
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); tsubs.forEach(f => f(toasts)) }, opts.ms ?? (opts.action ? 6000 : 2600))
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => { tsubs.add(setList); return () => { tsubs.delete(setList) } }, [])
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.action!.fn(); toasts = toasts.filter(x => x.id !== t.id); tsubs.forEach(f => f(toasts)) }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- confirm ----------
type ConfirmReq = { title: string; body?: string; ok: string; danger?: boolean; input?: { label: string; type?: string; match?: string }; choices?: { v: string; l: string; danger?: boolean }[]; resolve: (v: string | false) => void }
let setConfirmReq: ((r: ConfirmReq | null) => void) | null = null
export function confirmDialog(o: Omit<ConfirmReq, 'resolve'>): Promise<string | false> {
  return new Promise(resolve => setConfirmReq?.({ ...o, resolve }))
}
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null)
  const [val, setVal] = useState('')
  useEffect(() => { setConfirmReq = r => { setVal(''); setReq(r) } }, [])
  if (!req) return null
  const close = (v: string | false) => { req.resolve(v); setReq(null) }
  const blocked = !!req.input?.match && val.trim() !== req.input.match
  return (
    <Modal title={req.title} onClose={() => close(false)} footer={<>
      {req.choices?.map(c => <button key={c.v} className={`btn ${c.danger ? 'danger solid' : 'primary'}`} onClick={() => close(c.v)}>{c.l}</button>)}
      {!req.choices && <button className={`btn ${req.danger ? 'danger solid' : 'primary'}`} disabled={blocked || (!!req.input && !val)} onClick={() => close(req.input ? val : 'ok')}>{req.ok}</button>}
      <button className="btn" onClick={() => close(false)}>{L('إلغاء', 'Cancel')}</button>
    </>}>
      {req.body && <p style={{ margin: 0 }}>{req.body}</p>}
      {req.input && (
        <label className="field"><span>{req.input.label}</span>
          <input className="input" type={req.input.type || 'text'} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !blocked && val) close(val) }} />
        </label>
      )}
    </Modal>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span />
    </span>
  )
}

export function Empty({ icon, text, action }: { icon?: ReactNode; text: string; action?: ReactNode }) {
  return <div className="empty">{icon}<div>{text}</div>{action}</div>
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="btn-group" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  )
}

/** Colored file-type icons (PDF red, Word blue, Excel/CSV green) + print */
export const FileIcon = ({ kind, size = 18 }: { kind: 'pdf' | 'csv' | 'json' | 'ics' | 'word'; size?: number }) => {
  const color = { pdf: '#D93025', word: '#2B579A', csv: '#1D6F42', json: '#7A5AF8', ics: '#1F7A6D' }[kind]
  const label = { pdf: 'PDF', word: 'DOC', csv: 'CSV', json: 'JSON', ics: 'ICS' }[kind]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={color} />
      <path d="M14 2v5h5" fill="#fff" opacity=".45" />
      <text x="11.5" y="17.6" textAnchor="middle" fontSize={label.length > 3 ? 5.2 : 6.2} fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">{label}</text>
    </svg>
  )
}
export const PrintIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
)

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="4" y="8" width="50" height="50" rx="13" fill="#102A43" />
      <rect x="4" y="8" width="50" height="14" rx="7" fill="#334E68" />
      <rect x="15" y="3" width="5" height="12" rx="2.5" fill="#102A43" />
      <rect x="38" y="3" width="5" height="12" rx="2.5" fill="#102A43" />
      <path d="M14 33h18M14 42h12" stroke="#EEF2F6" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="47" cy="45" r="14" fill="#1F7A6D" stroke="#fff" strokeWidth="4" />
      <path d="M40.5 45.5l4.5 4.5 8-9" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
