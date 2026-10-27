// Standalone on purpose: served straight from /public, never bundled, so it
// stays plain ES5-ish JS a service worker can run with no build step.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || 'Cơm Áo Gạo Tiền';
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      // iOS mostly ignores badge/vibrate/actions today, but they cost nothing
      // to pass and Android honours all three — worth it on any device that can.
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'cagt-notification',
      renotify: true,
      requireInteraction: true,
      vibrate: [120, 60, 120],
      data: { url: url },
    }),
  );
});

// Focuses a tab already open on the app rather than piling up new ones — the
// household only ever has one install per phone.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          return client.navigate(url).then((navigated) => (navigated || client).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
