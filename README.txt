전자 구역 카드 공개 배포본
================================

이 폴더는 여호와의 증인 회중에서 사용할 수 있는 전자 구역 카드 시스템의 공개용 템플릿입니다.
회중 고유 정보와 실제 Firebase 설정값은 포함하지 않습니다.

사용 범위
---------

이 소프트웨어는 한국의 여호와의 증인 회중에서 회중 봉사와 구역 관리를 돕기 위해 제공됩니다.
여호와의 증인 회중 이외의 개인, 단체, 기업이 별도 목적으로 사용, 복사, 수정, 배포하는 것은 허용하지 않습니다.


처음 설치할 때
--------------

1. install-guide.html 을 브라우저에서 여세요.
2. Firebase 프로젝트를 만들고 익명 로그인을 활성화하세요.
3. Firestore Database를 만들고 firestore.rules 내용을 검토 후 게시하세요.
4. setup.html 에 Firebase 설정값을 입력해 config.js 내용을 만드세요.
5. config.example.js 를 복사해서 config.js 로 이름을 바꾼 뒤 설정값을 넣으세요.
6. 폴더 전체를 Cloudflare Pages 등 정적 호스팅에 배포하세요.
7. diagnostics.html 로 설치 상태를 점검하세요.


주요 파일
---------

install-guide.html   설치 안내서
setup.html           config.js 생성 보조 도구
diagnostics.html     설치 점검 도구
faq.html             문제 해결 FAQ
start.html           설치 안내서로 연결되는 시작 페이지
config.example.js    공개용 설정 템플릿
firestore.rules      Firestore 보안 규칙 템플릿
admin.html           관리자 화면
publisher.html       전도인용 화면
cart.html            전시대봉사 화면
credits.html         아이콘 등 외부 자산 출처


중요 보안 주의
--------------

- config.js 는 실제 Firebase 설정값이 들어가는 파일입니다.
- config.js 를 GitHub, 카페, 메신저 등에 공개로 올리지 마세요.
- 공개 배포본에는 config.example.js 만 포함하는 것이 안전합니다.
- 주소 데이터에는 운영에 필요한 최소 정보만 넣으세요.
- 거주자 이름, 전화번호, 개인 사정 등 민감한 개인정보는 입력하지 않는 것을 권장합니다.
- 전화봉사 카드처럼 전화번호가 포함된 자료는 이 공개 템플릿이나 Firestore에 넣지 마세요.


업데이트할 때
------------

1. 새 배포본을 받습니다.
2. 기존 config.js 는 따로 보존합니다.
3. 새 파일을 덮어쓴 뒤 기존 config.js 를 다시 넣습니다.
4. 다시 배포하고 diagnostics.html 로 점검합니다.

자세한 내용은 install-guide.html 을 참고하세요.
