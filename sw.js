const CACHE='osnit-shell-v39';
const ASSETS=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/assets/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||u.pathname.startsWith('/api/'))return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(e.request.method==='GET'&&r.ok){const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy))}return r}).catch(()=>caches.match('/index.html'))))});
