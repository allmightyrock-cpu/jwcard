━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  전자구역카드 시스템 — 배포 패키지
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 이 패키지의 구성
  admin.html          관리자 페이지
  publisher.html      전도인용 구역카드 페이지 (PWA 홈화면 추가 가능)
  cart.html           전시대봉사 일정 페이지 (cartApproved 전도인만 링크 표시)
  manifest.json       PWA 설정
  sw.js               서비스 워커 (오프라인 지원)
  _headers            Cloudflare Pages MIME 설정
  install-guide.html  설치 안내서 (브라우저에서 열어 PDF로 인쇄 가능)
  css/admin.css       관리자 스타일시트
  js/admin.js         관리자 기능 스크립트
  js/publisher.html   전도인 화면 스크립트 (publisher.html 내부 포함)
  js/map-admin.js     지도 기능 스크립트
  js/s13.js           S-13 양식 스크립트
  js/settings.js      설정 기능 스크립트
  icon-192.png        앱 아이콘 (192×192)
  icon-512.png        앱 아이콘 (512×512)


■ 설치 전 반드시 수정해야 할 항목

  1. js/admin.js  — 5~13줄
     js/admin.js와 publisher.html(스크립트 부분) 두 곳의
     firebaseConfig 블록을 본인 Firebase 프로젝트 값으로 교체

     [교체 전]
       apiKey: "YOUR_API_KEY",
       projectId: "YOUR_PROJECT_ID",
       ...

     [교체 후]
       Firebase 콘솔 → ⚙ 프로젝트 설정 → 일반 → 내 앱 →
       SDK 설정 및 구성 → '구성' 에서 복사한 실제 값 붙여넣기

  2. admin.html — 9줄 (네이버 지도 스크립트)
     publisher.html — 611줄 (네이버 지도 스크립트)
     YOUR_NAVER_CLIENT_ID → 발급받은 네이버 클라우드 Client ID 로 교체

  3. js/map-admin.js — 49줄, 133줄
     var BASE = '';  → 본인 회중 지역 주소 앞부분으로 변경
     (예) var BASE = '경기도 OO시 ';
     → 지도 검색 정확도가 향상됩니다. 빈 값으로 둬도 동작은 합니다.


■ 기본 관리자 비밀번호

  ★ 1914

  최초 admin.html 접속 시 Firebase에 자동으로 설정됩니다.
  로그인 후 [설정 → 비밀번호 변경]에서 즉시 변경해 주세요.


■ 설치 순서 요약

  STEP 1. Firebase 프로젝트 생성 + Firestore 활성화 + 보안규칙 설정
  STEP 2. 네이버 클라우드 Client ID 발급
  STEP 3. 위 항목 1~3 코드 수정
  STEP 4. Cloudflare Pages 배포 (이 폴더를 통째로 업로드)
  STEP 5. admin.html 접속 → 기본 비밀번호 1914로 로그인 → 설정 완료

  ★ 자세한 설치 절차: install-guide.html 을 브라우저에서 열어 확인하세요.
     (또는 인쇄하여 PDF로 저장 가능)


■ 문의 / 지원

  시스템 제작: 동두천남부회중/수리삿대 080-966-0404
  상세 매뉴얼: admin.html → 우측 상단 [?] 메뉴얼 탭 참조

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
