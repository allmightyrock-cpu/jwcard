// ═══════════════════════════════════════════════════════════════════════════
//  전자구역카드 시스템 — 설정 파일 템플릿
// ───────────────────────────────────────────────────────────────────────────
//  ★ 이 파일을 복사하여 이름을 config.js 로 바꾼 뒤 아래 값을 채워주세요.
//  ★ config.js 는 절대 GitHub 에 올리지 마세요 (Firebase 키 포함).
// ═══════════════════════════════════════════════════════════════════════════

window.APP_CONFIG = {

  // ┌─ Firebase 프로젝트 설정 ─────────────────────────────────────────────
  // │  Firebase 콘솔(console.firebase.google.com)
  // │  → ⚙ 프로젝트 설정 → 일반 탭 → 내 앱 → SDK 설정 → '구성(Config)' 선택 → 복사
  // │
  // │  ⚠ 매우 중요 — 흔한 실수 주의!
  // │     콘솔의 "npm" 또는 코드 스니펫(아래 같은 코드)을 통째로 붙여넣지 마세요:
  // │        import { initializeApp } from "firebase/app";   ← 넣지 말 것
  // │        const firebaseConfig = { ... };                 ← 넣지 말 것
  // │        const app = initializeApp(firebaseConfig);      ← 넣지 말 것
  // │     이 코드를 넣으면 config.js가 깨져 앱이 전혀 작동하지 않습니다.
  // │     아래 firebase: { } 안에 "값 6개"만 채우면 됩니다 (앱이 알아서 초기화함).
  // │     config.js 에는 'window.APP_CONFIG = { ... };' 하나만 있어야 합니다.
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
  // │  설정하면 아래 기능들이 활성화됩니다:
  // │    • 전도인이 구역카드에서 주소 오류 발견 시 카카오톡으로 수정 요청 전송
  // │    • 전시대봉사 인도자가 팀 배정표 이미지를 카카오톡으로 공유
  // │  설정하지 않으면 클립보드 복사 방식으로 자동 대체됩니다.
  // │
  // │  발급 방법 (install-guide.html STEP 7 참고):
  // │  ① developers.kakao.com → 카카오 계정 로그인
  // │  ② 내 애플리케이션 → 애플리케이션 추가 → 이름 입력 → 저장
  // │  ③ 앱 설정 → 플랫폼 → Web 플랫폼 등록
  // │     → 사이트 도메인에 배포 주소 입력 (예: https://jwcard.pages.dev)
  // │     ※ 이 단계를 빠뜨리면 공유 버튼이 작동하지 않습니다!
  // │  ④ 앱 설정 → 앱 키 → [JavaScript 키] 복사 (32자리 영문+숫자)
  // │     ※ REST API 키·Admin 키가 아닌 JavaScript 키를 복사하세요.
  // │  ⑤ 아래에 붙여넣기 후 config.js 저장 → Cloudflare 재배포
  kakaoJsKey: "YOUR_KAKAO_JAVASCRIPT_KEY"
  // └──────────────────────────────────────────────────────────────────────

};
