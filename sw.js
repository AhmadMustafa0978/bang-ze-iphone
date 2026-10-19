const CACHE = 'bangze-shell-1.0.2';
const ROOT = new URL('./',self.location.href).pathname;
const SHELL = ["", "index.html", "interface.css", "app.js", "motion.js", "icon.svg", "manifest.webmanifest", "icons/apple-touch-icon.png"].map(p=>ROOT+p);
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bangze-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache media, credentials, API responses, external thumbnails or runtime configuration.
  if(e.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  e.respondWith(fetch(e.request).then(r => { if(r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match(ROOT) : Response.error()))));
});
