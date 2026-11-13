// Notificações push (aprovações do administrador). Carregado pelo service worker principal.
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Paggio', body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Paggio', {
      body: d.body || '',
      tag: d.tag || 'paggio',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: true,
      data: { url: d.url || '/' },
    })
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ('focus' in c) return c.focus()
      return self.clients.openWindow(url)
    })
  )
})
