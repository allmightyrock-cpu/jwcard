// 전자구역카드 Service Worker 설정
//
// 새 버전 배포 시 반드시 CACHE 버전을 올려 주세요.
//   예: 'jwcard-v2.30' → 'jwcard-v2.31'
//   버전이 바뀌어야 모든 모바일 PWA가 업데이트를 받습니다.
//
const CACHE = 'jwcard-v2.84'; // MINOR(+0.1): 기능추가·버그수정 / MAJOR(+1.0): 화면개편

// 프리캐시 정적 리소스 (오프라인 대비, 기본은 Network First)
const STATIC = [
  '/config.js',
  '/publisher.html',
  '/cart.html',
  '/guide.html',
  '/install.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/css/admin.css',
  '/js/settings.js',
  '/js/s13.js',
  '/js/schedule-time.js',
  '/js/share-card.js'
];

// Network First 대상: 서버 우선, 실패 시 캐시 사용
// 자주 바뀌는 파일은 항상 최신본을 받도록 함
const NETWORK_FIRST_PATTERNS = [
  'publisher.html',
  'cart.html',
  'js/schedule-time.js',
  'js/share-card.js',
  'config.js',
  'js/settings.js',
  'js/s13.js',
  'version.json'
];

// 페이지에서 SKIP_WAITING 메시지를 받으면 새 워커 즉시 활성화
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 설치: 정적 리소스 프리캐시
// skipWaiting을 여기서 호출하지 않는 이유:
//   '지금 업데이트' 버튼을 눌렀을 때만 활성화되도록 하기 위함
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(STATIC.map(url => c.add(url).catch(() => null)))
    )
  );
  // self.skipWaiting() 제거: SKIP_WAITING 메시지로만 활성화
});

// 활성화: 이전 버전 캐시 정리
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

  // http(s) 외 요청(chrome-extension://, data: 등)·비GET 은 SW가 관여하지 않음
  // → cache.put('chrome-extension'…) TypeError 방지
  if (!url.startsWith('http')) return;
  if (e.request.method !== 'GET') return;

  // admin 페이지 및 admin JS/CSS는 캐시하지 않음 (배포 즉시 반영)
  if (url.includes('/admin') ||
      url.includes('js/admin') ||
      url.includes('js/map-admin') ||
      url.includes('js/territory-image') ||
      url.includes('css/admin')) {
    return;
  }

  // Firebase / Google API / Naver는 캐시하지 않음
  if (url.includes('firestore') ||
      url.includes('firebase') ||
      url.includes('googleapis') ||
      url.includes('gstatic') ||
      url.includes('naver') ||
      url.includes('fonts.google')) {
    return;
  }

  // Network First: 서버 우선, 실패 시 캐시
  const isNetworkFirst =
    NETWORK_FIRST_PATTERNS.some(p => url.includes(p)) ||
    url.endsWith('/') ||
    url.endsWith('/publisher') ||
    url.endsWith('/install') ||
    url.endsWith('/install.html');

  if (isNetworkFirst) {
    const fallback = url.includes('cart.html') ? '/cart.html'
      : (url.includes('install') ? '/install.html' : '/publisher.html');
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

  // 그 외 정적 리소스(이미지, manifest 등)는 캐시 우선
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
