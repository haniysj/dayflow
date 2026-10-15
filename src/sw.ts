/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Offline: every navigation falls back to the cached app shell
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })

self.addEventListener('push', event => {
  let d: any = {}
  try { d = event.data?.json() ?? {} } catch { d = { title: event.data?.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'DayFlow', {
      body: d.body || '',
      tag: d.id || undefined, // same tag as the in-app notification → no duplicates
      data: { url: d.url || '/' },
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      dir: 'auto',
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) {
        await (w as WindowClient).focus()
        ;(w as WindowClient).postMessage({ type: 'OPEN_URL', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
