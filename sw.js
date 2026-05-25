// ══ 전자구역카드 Service Worker ══
//
// ⚠ 새 파일 배포 시 반드시 CACHE 버전을 올려 주세요.
//   예: 'jwcard-v1.73' → 'jwcard-v1.74'
//   버전이 바뀌면 모든 모바일 PWA에 업데이트 배너가 뜹니다.
//
const CACHE = 'jwcard-v1.74'; // MINOR(+0.1): 기능추가·버그수정 / MAJOR(+1.0): 화면개편

// 오프라인 대비용으로만 캐시 (실제 서빙은 Network First)
const STATIC = [
  '/config.js',
  '/publisher.html',
  '/cart.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/css/admin.css',
  '/js/settings.js',
  '/js/s13.js',
  '/js/config-check.js'
];

// 항상 Network First 패턴 — 서버 우선, 실패 시에만 캐시 사용
const NETWORK_FIRST_PATTERNS = [
  'publisher.html',
  'cart.html',
  'js/config-check.js', // 설정 감지 스크립트 — 항상 최신 필요
  'config.js',          // 설정 파일 → 항상 최신 필요
  'js/settings.js',     // 설정 JS  → 항상 최신 필요
  'js/s13.js',          // S13 JS   → 항상 최신 필요
  'version.json',       // 버전 파일 → 항상 최신 필요
];

// 페이지에서 SKIP_WAITING 메시지 수신 시 즉시 활성화
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 설치: 정적 파일 캐시 (오프라인 폴백)
// skipWaiting을 여기서 호출하지 않는 이유:
//   '지금 업데이트' 버튼을 눌러야만 활성화되도록 하기 위함
//   (install에서 즉시 skipWaiting하면 reg.waiting이 null이 되어 배너가 뜨지 않음)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(STATIC.map(url => c.add(url).catch(() => null)))
    )
  );
  // self.skipWaiting() 제거: SKIP_WAITING 메시지로만 활성화
});

// 활성화: 구버전 캐시 삭제 후 즉시 클레임
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 요청 처리
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // admin 페이지 및 관련 JS/CSS → 항상 네트워크 (배포 즉시 반영)
  if (url.includes('/admin') ||
      url.includes('js/admin') ||
      url.includes('js/map-admin') ||
      url.includes('css/admin')) {
    return;
  }

  // Firebase / Google API / Naver → 항상 네트워크
  if (url.includes('firestore') ||
      url.includes('firebase') ||
      url.includes('googleapis') ||
      url.includes('gstatic') ||
      url.includes('naver') ||
      url.includes('fonts.google')) {
    return;
  }

  // Network First: 서버 우선, 실패 시 캐시 폴백
  const isNetworkFirst =
    NETWORK_FIRST_PATTERNS.some(p => url.includes(p)) ||
    url.endsWith('/') ||
    url.endsWith('/publisher');

  if (isNetworkFirst) {
    const fallback = url.includes('cart.html') ? '/cart.html' : '/publisher.html';
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match(fallback)))
    );
    return;
  }

  // 나머지 정적 자산(이미지, manifest 등) → 캐시 우선
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
