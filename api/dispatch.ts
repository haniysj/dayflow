// Web Push dispatcher (Vercel serverless, Node runtime).
// Triggered every minute by Supabase pg_cron (pg_net) and on demand by the app's "test push" button.
// Anyone may trigger it: it only delivers reminders that are already due, claimed atomically in the database
// with DISPATCH_SECRET (server-side only), so repeated calls never send duplicates.
import webpush from 'web-push'

export const config = { runtime: 'nodejs' }

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}

async function rpc(fn: string, body: Record<string, unknown>) {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_ANON_KEY')
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'method' })
  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
    const secret = env('DISPATCH_SECRET')
    const { items = [], subs = [] } = (await rpc('df_claim_due', { p_secret: secret })) || {}
    let sent = 0, failed = 0, dropped = 0, skipped = 0
    for (const it of items) {
      if (it.stale) { skipped++; continue } // more than 2h late (e.g. server outage): don't spam old reminders
      const payload = JSON.stringify({ id: it.id, title: it.title, body: it.body || '', url: it.url || '/' })
      await Promise.all(subs.map(async (sub: any) => {
        try {
          await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'high' })
          sent++
        } catch (e: any) {
          failed++
          if (e?.statusCode === 404 || e?.statusCode === 410) { dropped++; await rpc('df_drop_sub', { p_secret: secret, p_endpoint: sub.endpoint }).catch(() => {}) }
        }
      }))
    }
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ items: items.length, sent, failed, dropped, skipped })
  } catch (e: any) {
    console.error(e)
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
