const CACHE = 'tolerate-v8';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};

  let url;
  if (e.action === 'calendar') {
    const thing = encodeURIComponent(data.thing || '');
    url = `${self.location.origin}${self.location.pathname}?calendar=${thing}&at=${data.nextAt || ''}`;
  } else {
    url = data.checkId
      ? `${self.location.origin}${self.location.pathname}?check=${data.checkId}`
      : self.location.origin;
  }

  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
