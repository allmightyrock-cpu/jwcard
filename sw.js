// ══ 구역카드 Service Worker ══
//
// ⚠ 새 파일 배포 시 반드시 CACHE 버전을 올려 주세요.
//   예: 'jwcard-v1.73' → 'jwcard-v1.74'
//   버전이 바뀌면 모든 모바일 PWA에 업데이트 배너가 뜹니다.
//
const CACHE = 'jwcard-v1.74'; // MINOR(+0.1): 기능추가·버그수정 / MAJOR(+1.0): 화면개편

// 오프라인 대비 사전 캐시 (실제 서빙 규칙은 아래 fetch 핸들러를 따름)
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
  '/js/schedule-time.js'
];

// Network First 대상 — 항상 서버에서 먼저 받고, 실패 시에만 캐시 사용
const NETWORK_FIRST_PATTERNS = [
  'publisher.html',
  'cart.html',
  'js/schedule-time.js', // 전시대봉사 공유 모듈 — HTML과 항상 같은 최신본 유지
  'config.js',           // 설정 파일 — 항상 최신 필요
  'js/settings.js',      // 설정 JS  — 항상 최신 필요
  'js/s13.js',           // S13 JS   — 항상 최신 필요
  'version.json'         // 버전 파일 — 항상 최신 필요
];

// 페이지에서 SKIP_WAITING 메시지 수신 시 즉시 활성화
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 설치: 정적 파일 사전 캐시
// (여기서 skipWaiting을 호출하지 않음 — 사용자가 '지금 업데이트' 버튼을 눌러야
//  새 SW가 활성화되어 배너가 정상 표시됨. install에서 즉시 skipWaiting하면
//  reg.waiting이 null이 되어 배너가 뜨지 않음)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(STATIC.map(url => c.add(url).catch(() => null)))
    )
  );
});

// 활성화: 구버전 캐시 정리
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

  // admin 페이지 및 관련 JS/CSS는 항상 네트워크 (배포 즉시 반영)
  if (url.includes('/admin') ||
      url.includes('js/admin') ||
      url.includes('js/map-admin') ||
      url.includes('css/admin')) {
    return;
  }

  // Firebase / Google API / Naver 는 항상 네트워크
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

  // 나머지 정적 자산(아이콘, manifest 등)은 캐시 우선
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
