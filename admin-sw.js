/* admin-sw.js — 관리자 전용 서비스워커 (scope: /admin.html) */
const CACHE_NAME = 'jwcard-admin-v2';

// 설치: 관리자 페이지 자체만 캐싱
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.add('/admin.html?pwa=1')
    )
  );
  self.skipWaiting();
});

// 활성화: 이전 관리자 캐시 정리
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('jwcard-admin-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetch: admin.html → Network First, 오프라인 시 캐시 폴백
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname !== '/admin.html') return;

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return resp;
      })
      .catch(() => caches.match('/admin.html?pwa=1'))
  );
});
