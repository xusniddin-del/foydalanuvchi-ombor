// Vector ilovasi: sahifa va rasmlarni keshlaydi (internet sekin bo'lsa ham tez ochiladi). Server (Google) so'rovlari keshlanmaydi.
const V = 'vector-app-v2';
const SHELL = ['app.html', 'assets/js/config.js', 'assets/js/api.js', 'assets/css/app.css', 'assets/js/vector-i18n.js', 'assets/js/vector-i18n-dict.js',
  'assets/img/vector-logo.png', 'assets/img/app/ob1.jpg', 'assets/img/app/ob2.jpg', 'assets/img/app/ob3.jpg', 'assets/img/cat-happy.png', 'assets/img/cat-sad.png', 'assets/img/cat-empty.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // HTML va skriptlar: avval internet (yangilanishlar darhol keladi), bo'lmasa kesh
  if (/\.(html|js|css|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // rasmlar: avval kesh
  e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })));
});
