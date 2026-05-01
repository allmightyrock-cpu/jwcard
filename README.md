# 📋 전자구역카드 시스템

종이 구역카드를 완전히 대체하는 웹 기반 구역관리 시스템입니다.  
Firebase + Cloudflare Pages 기반 · 실시간 동기화 · **월 비용 0원**

---

## ✨ 주요 기능

- 구역 등록·배정·회수·자동 반납 (KST 기준)
- 요일별 봉사 일정 편성 및 인도자 배정 패널
- 전도인 권한 체계 (관리자 / 봉사감독자 / 구역의종 / 인도자 / 일반)
- 네이버 지도 연동 구역 지도 및 주소 편집
- 방문 기록 (코드 선택 방식 — 개인정보 최소 수집)
- S-13 기록 관리 및 엑셀 내보내기
- 전시대봉사(Cart Witnessing) 일정 관리
- PWA 지원 — 안드로이드 · iOS · iPad 홈 화면 설치
- 오프라인 캐시 (Service Worker)

---

## 📁 파일 구성

| 파일 | 설명 |
|------|------|
| `publisher.html` | 전도인용 구역카드 앱 (PWA) |
| `admin.html` | 관리자 앱 |
| `cart.html` | 전시대봉사 일정 앱 |
| `config.example.js` | 설정 파일 **템플릿** (→ `config.js`로 복사 후 수정) |
| `sw.js` | Service Worker (오프라인 지원) |
| `manifest.json` | PWA 설정 |
| `_headers` | Cloudflare Pages MIME 설정 |
| `install-guide.html` | 설치 안내서 (브라우저에서 열어 PDF 인쇄 가능) |
| `css/admin.css` | 관리자 스타일시트 |
| `js/admin.js` | 관리자 기능 스크립트 |
| `js/map-admin.js` | 지도 기능 스크립트 |
| `js/s13.js` | S-13 스크립트 |
| `js/settings.js` | 설정 스크립트 |

---

## 🚀 설치 방법

### 준비물
- [Google 계정](https://accounts.google.com) — Firebase 용
- [Cloudflare 계정](https://cloudflare.com) — 웹 호스팅 용
- [Naver Cloud 계정](https://ncloud.com) — 지도 API 용 (선택)

### STEP 1 — 최신 버전 다운로드

오른쪽 **Releases** 탭 → 최신 버전 → `Source code (zip)` 다운로드 후 압축 해제

### STEP 2 — config.js 만들기

```bash
# config.example.js 를 복사해서 config.js 로 이름 변경
```

`config.js` 파일을 열어 본인 Firebase 값과 네이버 Client ID 입력:

```js
window.APP_CONFIG = {
  firebase: {
    apiKey:            "여기에 본인 값 입력",
    authDomain:        "여기에 본인 값 입력",
    projectId:         "여기에 본인 값 입력",
    storageBucket:     "여기에 본인 값 입력",
    messagingSenderId: "여기에 본인 값 입력",
    appId:             "여기에 본인 값 입력"
  },
  naverClientId: "여기에 본인 값 입력"
};
```

### STEP 3 — Firebase 설정

1. [console.firebase.google.com](https://console.firebase.google.com) 접속
2. 프로젝트 생성 → Firestore Database 활성화 (프로덕션 모드)
3. 보안 규칙을 아래로 교체 후 게시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### STEP 4 — Cloudflare Pages 배포

1. [dash.cloudflare.com](https://dash.cloudflare.com) 접속
2. Workers & Pages → Pages → **파일 직접 업로드** 선택
3. 이 폴더 전체 (`config.js` 포함)를 드래그&드롭
4. 배포 완료 → 발급된 도메인으로 접속

### STEP 5 — 첫 로그인

- `admin.html` 접속 → 기본 비밀번호 **`1914`** 로그인
- 로그인 후 **[설정 → 비밀번호 변경]** 즉시 변경해 주세요

---

## 🔄 업데이트 방법

1. Releases 탭에서 최신 버전 ZIP 다운로드
2. 압축 해제 후 **본인 `config.js`는 그대로 유지**
3. 나머지 파일을 새 버전으로 교체
4. Cloudflare Pages에 다시 업로드

---

## 📖 상세 매뉴얼

설치 후 **`admin.html` → 메뉴얼 탭** 에서 전체 사용법을 확인할 수 있습니다.

---

## ⚠️ 주의사항

- `config.js` 는 본인 Firebase 키가 담겨 있으므로 **절대 GitHub에 업로드하지 마세요**
- 이 저장소의 `config.js` 는 `.gitignore` 로 자동 제외됩니다

---

## 📞 문의 / 지원

설치 중 문제가 생기거나 사용법이 궁금하면 아래로 연락해 주세요.

> **080-966-0404**  
> 같은 여호와의 증인 형제자매를 위해 피드백을 제공합니다.

---

## 📄 라이선스

비상업 · 회중 봉사 전용 · 개인정보 미수집 시스템
