// Shared print / PDF path for the printable sheets (weekly planner, year calendar).
// Pages live in #pl-print-root as `.pl-page` sections; their CSS rules all use the `.pl-` prefix.
import { getLang, L } from './i18n'
import { toast } from '../components/ui'

export type Orient = 'portrait' | 'landscape'
export const pageMM = (o: Orient) => (o === 'landscape' ? { w: 297, h: 210 } : { w: 210, h: 297 })

/** Open the system print dialog for the pages in #pl-print-root */
export async function printPages(orient: Orient, onDone: () => void) {
  await document.fonts?.ready
  const style = document.createElement('style')
  style.textContent = `@page { size: A4 ${orient}; margin: 0 }`
  document.head.appendChild(style)
  document.body.classList.add('pl-printing')
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    document.body.classList.remove('pl-printing'); style.remove(); window.removeEventListener('afterprint', done); onDone()
  }
  window.addEventListener('afterprint', done)
  setTimeout(() => { window.print(); setTimeout(done, 1500) }, 60)
}

/** The CSS rules the printable sheets use (".pl-…"), skipping @media print blocks */
function sheetCss() {
  const out: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const r of Array.from(rules)) if (r instanceof CSSStyleRule && /\.pl-|#pl-print-root/.test(r.selectorText)) out.push(r.cssText)
  }
  return out.join('\n')
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 4000)
}

/** Vector PDF (real text) rendered by the server; image PDF only as an offline fallback */
export async function savePdf(root: HTMLElement | null, name: string, orient: Orient) {
  try {
    if (!navigator.onLine) throw new Error('offline')
    const r = await fetch('/api/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: root?.innerHTML || '', css: sheetCss(), lang: getLang(), name, orientation: orient }),
    })
    if (!r.ok || !(r.headers.get('content-type') || '').includes('pdf')) throw new Error('server ' + r.status)
    download(await r.blob(), name)
    toast(L('حُفظ ملف PDF', 'PDF saved'))
  } catch (e) {
    console.warn('server pdf failed, using image fallback', e)
    await imagePdf(root, name, orient)
  }
}

async function imagePdf(root: HTMLElement | null, name: string, orient: Orient) {
  try {
    await document.fonts?.ready
    const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas-pro')])
    const html2canvas = (h2c as any).default || h2c
    const { w, h } = pageMM(orient)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: orient, compress: true })
    const pages = [...(root?.querySelectorAll<HTMLElement>('.pl-page') || [])]
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false })
      if (i) pdf.addPage('a4', orient)
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, `p${i}`)
    }
    download(pdf.output('blob'), name)
    toast(L('حُفظ PDF كصورة (دون اتصال). للحصول على نص واضح أعد الحفظ عند الاتصال بالإنترنت.', 'Saved as an image PDF (offline). Save again when online for crisp text.'), { ms: 6000 })
  } catch (e) {
    console.error(e)
    toast(L('تعذّر إنشاء PDF — جرّب زر الطباعة ثم «حفظ كـ PDF»', 'Could not create PDF — use Print → Save as PDF'), { err: true })
  }
}
