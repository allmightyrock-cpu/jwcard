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
  naverClientId: "YOUR_NAVER_CLIENT_ID",
  // └──────────────────────────────────────────────────────────────────────

  // ┌─ 카카오 JavaScript 키 (선택) ────────────────────────────────────────
  // │  전도인이 주소 수정 요청을 카카오톡으로 보내는 기능에 사용됩니다.
  // │  설정하지 않으면 클립보드 복사로 대체됩니다.
  // │  ① developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가
  // │  ② 앱 설정 → 플랫폼 → Web → 사이트 도메인에 배포 주소 등록
  // │  ③ 앱 키 → JavaScript 키 복사 후 아래에 입력
  kakaoJsKey: "YOUR_KAKAO_JAVASCRIPT_KEY"
  // └──────────────────────────────────────────────────────────────────────

};
