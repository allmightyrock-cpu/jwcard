// ?�?� 구역카드 Service Worker ?�?�
//
// ???�일 배포 ??반드??CACHE 버전???�려 주세????//   ?? 'jwcard-v10' ??'jwcard-v11'
//   버전??바뀌면 모든 모바??PWA???�데?�트 배너가 ?�니??
//
const CACHE = 'jwcard-v1.52'; // ??MINOR(+0.1): 기능추가·버그수정 / MAJOR(+1.0): 화면개편  (최근 업데이트: 2026-05-17)

// ?�프?�인 ?�비용?�로�?캐시 (?�제 ?�빙?� Network First)
const STATIC = [
  '/config.js',
  '/publisher.html',
  '/cart.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/css/admin.css',
  '/js/settings.js',
  '/js/s13.js'
];

// ?�?� Network First ?�???�턴 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
// ??목록???�당?�는 ?�일?� ??�� ?�버?�서 먼�? 받고, ?�패 ?�에�?캐시 ?�용
const NETWORK_FIRST_PATTERNS = [
  'publisher.html',
  'cart.html',
  'config.js',        // ???�정 ?�일 ????�� 최신 ?�요
  'js/settings.js',   // ???�정 JS  ????�� 최신 ?�요
  'js/s13.js',        // ??S13 JS   ????�� 최신 ?�요
  'version.json',     // ??버전 ?�일 ????�� 최신 ?�요
];

// ?�이지?�서 SKIP_WAITING 메시지 ?�신 ??즉시 ?�성??self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ?�치: ?�적 ?�일 캐시 (?�프?�인 ?�백??
// ??skipWaiting???�기???�출?��? ?�음 ???�용?��? '지�??�데?�트' 버튼???�러?�만 ?�성??//   (install?�서 즉시 skipWaiting?�면 reg.waiting??null???�어 배너가 ?��? ?�음)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(STATIC.map(url => c.add(url).catch(() => null)))
    )
  );
  // self.skipWaiting() ???�거: SKIP_WAITING 메시지로만 ?�성??});

// ?�성?? 구버??캐시 ?��? ??��
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ?�청 처리
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // admin ?�이지 �?관??JS/CSS ????�� ?�트?�크 (배포 즉시 반영)
  if (url.includes('/admin') ||
      url.includes('js/admin') ||
      url.includes('js/map-admin') ||
      url.includes('css/admin')) {
    return;
  }

  // Firebase / Google API / Naver ????�� ?�트?�크
  if (url.includes('firestore') ||
      url.includes('firebase') ||
      url.includes('googleapis') ||
      url.includes('gstatic') ||
      url.includes('naver') ||
      url.includes('fonts.google')) {
    return;
  }

  // Network First ?�??????�� ?�버 ?�선, ?�패 ??캐시 ?�백
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

  // ?�머지 ?�적 ?�산(?�이�? manifest ?? ??캐시 ?�선
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
