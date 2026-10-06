// Service worker do 8 Ball Pool: a app (HTML, manifest e ícones) fica em cache e funciona offline.
// Estratégia: devolve logo o que está em cache e atualiza em segundo plano (a nova versão entra na visita seguinte).
// A chave da cache ignora a query (?debug, ?utm=...), por isso todas as entradas se atualizam da mesma forma.
// Muda CACHE quando publicares uma versão nova para forçar a limpeza da cache antiga.
const CACHE = 'pool8-v3';
const ASSETS = [
  './', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache:'reload' ignora a cache HTTP do navegador, para a instalação nunca guardar ficheiros velhos
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // anúncios e outros pedidos externos não passam pela cache
  const key = url.origin + url.pathname;
  e.respondWith(
    caches.match(key).then(hit => {
      // 'no-cache': revalida junto do servidor mesmo que o host mande Cache-Control: max-age (senão a atualização nunca chegava)
      const net = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {}); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
