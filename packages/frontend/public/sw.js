self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage({ type: 'SW_UPDATED', version: '2026-05-11-2' });
    }
  })());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Notifica', message: event.data.text() };
  }

  const title = payload.title || 'CRM Immobiliare';
  const message = payload.message || '';
  const data = payload.data || {};
  const targetUrl = data.url || '/dashboard';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: message,
      icon: '/Logo-cosmo-casa.webp',
      badge: '/Logo-cosmo-casa.webp',
      vibrate: [220, 120, 220],
      silent: false,
      renotify: true,
      requireInteraction: true,
      tag: data?.notificationId || `${Date.now()}`,
      data: { targetUrl, ...data }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.targetUrl || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existingClient = clientsArr.find((client) => 'focus' in client);
      if (existingClient) {
        if ('navigate' in existingClient) {
          return existingClient.navigate(targetUrl).then(() => existingClient.focus());
        }
        existingClient.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl });
        return existingClient.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
