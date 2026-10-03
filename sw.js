// Service worker: permite abrir o app sem internet.
// Arquivos do próprio site: tenta a rede primeiro (para pegar atualizações) e cai no cache se estiver offline.
// Os dados ficam a cargo do cache offline do Firestore, não daqui.
const CACHE = 'farmarotina-v1';
const EXTERNOS = ['https://cdn.jsdelivr.net/', 'https://www.gstatic.com/firebasejs/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'css/styles.css', 'manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const proprio = url.origin === self.location.origin;
  const externoFixo = EXTERNOS.some((p) => req.url.startsWith(p));
  if (!proprio && !externoFixo) return; // chamadas do Firebase passam direto

  if (externoFixo) {
    // Bibliotecas com versão fixa na URL: cache primeiro.
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
      return resp;
    })));
    return;
  }

  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
    }
    return resp;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
