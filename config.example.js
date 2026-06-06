// 전자 구역 카드 설정 파일 템플릿
// 1) 이 파일을 config.js 로 복사합니다.
// 2) Firebase 콘솔의 웹 앱 SDK 설정값을 아래 firebase 항목에 입력합니다.
// 3) config.js 는 공개 GitHub 저장소나 카페 게시글에 올리지 마세요.
// 자세한 설치 절차는 install-guide.html 을 참고하세요.

window.APP_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  },

  // 선택: 네이버 지도 API Client ID
  // 관리자 화면의 설정 메뉴에서도 입력하거나 변경할 수 있습니다.
  naverClientId: "YOUR_NAVER_CLIENT_ID",

  // 선택: 카카오 JavaScript 키
  // 주소 수정 요청 알림, 전시대봉사 배정 공유 등 카카오 공유 기능에 사용됩니다.
  // 발급 방법은 install-guide.html 의 선택 설정 안내를 참고하세요.
  kakaoJsKey: "YOUR_KAKAO_JAVASCRIPT_KEY"
};
