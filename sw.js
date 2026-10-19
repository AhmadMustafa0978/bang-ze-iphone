const CACHE = 'bangze-shell-2.0.1';
const ROOT = new URL('./',self.location.href).pathname;
const SHELL = ["", "index.html", "interface.css?v=2.0.1", "app.js?v=2.0.1", "motion.js?v=2.0.1", "icon.svg", "grain.svg", "manifest.webmanifest", "icons/apple-touch-icon.png"].map(p=>ROOT+p);
const SHELL_PATHS = new Set(SHELL.map(path => new URL(path, self.location.origin).pathname));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(path => new Request(path, {cache:'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bangze-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache media, credentials, API responses, external thumbnails or runtime configuration.
  if(e.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r => { if(r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match(ROOT) : Response.error()))));
});
