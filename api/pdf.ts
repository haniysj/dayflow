// Vector A4 PDF renderer for the printable planner (real, selectable Arabic text in Cairo).
// The client posts the planner pages' HTML + their CSS; headless Chromium lays them out and prints to PDF.
// Hardening: JavaScript is disabled and every network request is blocked (only data: URLs load),
// so the page can't fetch anything; input size is capped. Nothing is stored.
import chromium from '@sparticuz/chromium'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

export const config = { runtime: 'nodejs', maxDuration: 60 }

const MAX_BYTES = 3_000_000
let fontCss: string | null = null

function fonts() {
  if (fontCss) return fontCss
  const dir = join(process.cwd(), 'node_modules/@fontsource-variable/cairo/files')
  const face = (file: string, range: string) =>
    `@font-face{font-family:'Cairo Variable';font-style:normal;font-display:block;font-weight:200 1000;src:url(data:font/woff2;base64,${readFileSync(join(dir, file)).toString('base64')}) format('woff2');unicode-range:${range}}`
  fontCss =
    face('cairo-arabic-wght-normal.woff2', 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC') +
    face('cairo-latin-wght-normal.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')
  return fontCss
}

let browserP: Promise<any> | null = null
async function browser() {
  if (!browserP) {
    const local = process.env.CHROME_PATH // local testing only
    browserP = puppeteer.launch({
      args: local ? ['--no-sandbox'] : await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: local || (await chromium.executablePath()),
      headless: 'shell',
    })
  }
  return browserP
}

const SAMPLE = `<section class="pl-page" dir="rtl" style="padding:20mm"><h1 style="font-family:'Cairo Variable'">اختبار المخطط — DayFlow ١٢٣ 123</h1></section>`

export default async function handler(req: any, res: any) {
  const selftest = req.method === 'GET' && req.query?.selftest === '1'
  if (req.method !== 'POST' && !selftest) return res.status(405).json({ error: 'method' })
  let html = SAMPLE, css = '', lang = 'ar', name = 'dayflow-planner.pdf'
  if (!selftest) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    if (typeof body.html !== 'string' || typeof body.css !== 'string') return res.status(400).json({ error: 'bad input' })
    if (body.html.length + body.css.length > MAX_BYTES) return res.status(413).json({ error: 'too large' })
    html = body.html.replace(/<script[\s\S]*?<\/script>/gi, '')
    css = body.css.replace(/@import[^;]*;/gi, '').replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, 'none')
    lang = body.lang === 'en' ? 'en' : 'ar'
    if (typeof body.name === 'string' && /^[\w.-]{1,80}\.pdf$/.test(body.name)) name = body.name
  }
  const doc = `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${fonts()}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#fff}
*{box-sizing:border-box}
${css}
#pl-print-root{position:static!important;left:auto!important;z-index:auto!important}
.pl-page{break-after:page;page-break-after:always}
.pl-page:last-child{break-after:auto;page-break-after:auto}
</style></head><body><div id="pl-print-root">${html}</div></body></html>`

  let page: any
  try {
    const b = await browser()
    page = await b.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (r: any) => {
      const u = r.url()
      if (u.startsWith('data:') || u === 'about:blank') r.continue()
      else r.abort()
    })
    await page.setContent(doc, { waitUntil: 'load', timeout: 20000 })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (e: any) {
    console.error(e)
    browserP = null
    return res.status(500).json({ error: String(e?.message || e) })
  } finally {
    await page?.close().catch(() => {})
  }
}
