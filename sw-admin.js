// Service worker do app do Anderson (admin). Rede primeiro: o app sempre abre a versão mais nova publicada.
const CACHE = 'ac-admin-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/admin/']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(Promise.all([self.clients.claim(), caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))])); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // dados do Supabase nunca ficam em cache
  if (e.request.mode === 'navigate' && u.pathname.startsWith('/admin')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/admin/', c)); return r; })
      .catch(() => caches.match('/admin/')));
    return;
  }
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/app/') || u.pathname.startsWith('/marca/')) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })));
  }
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Anderson Costa', {
    body: d.corpo || '', tag: d.tag, icon: '/app/icone-192.png', badge: '/app/icone-192.png', data: { url: d.url || '/admin/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || '/admin/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.includes('/admin'));
    if (w) { w.navigate(alvo).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(alvo);
  }));
});
