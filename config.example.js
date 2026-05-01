// ═══════════════════════════════════════════════════════════════════════════
//  전자구역카드 시스템 — 설정 파일 템플릿
// ───────────────────────────────────────────────────────────────────────────
//  ★ 이 파일을 복사하여 이름을 config.js 로 바꾼 뒤 아래 값을 채워주세요.
//  ★ config.js 는 절대 GitHub 에 올리지 마세요 (Firebase 키 포함).
// ═══════════════════════════════════════════════════════════════════════════

window.APP_CONFIG = {

  // ┌─ Firebase 프로젝트 설정 ─────────────────────────────────────────────
  // │  Firebase 콘솔(console.firebase.google.com)
  // │  → ⚙ 프로젝트 설정 → 일반 탭 → 내 앱 → SDK 설정 → '구성' 에서 복사
  firebase: {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId:             "YOUR_APP_ID"
  },
  // └──────────────────────────────────────────────────────────────────────

  // ┌─ 네이버 지도 Client ID ───────────────────────────────────────────────
  // │  네이버 클라우드(console.ncloud.com) → Application → Client ID 복사
  // │  ※ 관리자 페이지 [설정 → 네이버 지도 API]에서도 변경 가능합니다.
  naverClientId: "YOUR_NAVER_CLIENT_ID"
  // └──────────────────────────────────────────────────────────────────────

};
