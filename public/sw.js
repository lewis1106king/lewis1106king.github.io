const CACHE = 'suseak-live-v5';
const SHELL = ['/', '/index.html', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch('/index.html', { cache: 'reload' });
      const html = await response.clone().text();
      await cache.put('/index.html', response.clone());
      await cache.put('/', response.clone());
      const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]);
      await Promise.all([...new Set([...SHELL, ...assets])].map(async (path) => {
        try {
          await cache.add(path);
        } catch {
          // 일부 파일이 없어도 나머지 화면 저장은 계속한다.
        }
      }));
    } catch {
      await Promise.all(SHELL.map(async (path) => {
        try { await cache.add(path); } catch { /* 설치 실패가 화면을 막지 않게 한다. */ }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await cache.match('/') || await cache.match('/index.html');
        if (home) return home;
      }
      return new Response('오프라인 상태이며 이 주소의 저장된 화면이 없습니다. 네트워크에 연결해 한 번 연 뒤 다시 시도해 주세요.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
