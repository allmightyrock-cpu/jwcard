import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

// ── Firebase 초기화 (config.js 에서 로드) ──
// config.js 파일의 window.APP_CONFIG.firebase 값을 사용합니다.
const firebaseConfig = (window.APP_CONFIG && window.APP_CONFIG.firebase)
  ? window.APP_CONFIG.firebase
  : (console.error('⚠ config.js를 찾을 수 없습니다. Firebase가 작동하지 않습니다.'), {});
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── 카테고리 색상 상수 ──
const CAT_BG = {'아파트':'#DBEAFE','상가':'#FEF3C7','주택':'#DCFCE7','각지':'#F3E8FF','인터폰':'#FFE4E6','편지':'#FEF9C3'};
const CAT_CL = {'아파트':'#1D4ED8','상가':'#92400E','주택':'#166534','각지':'#7C3AED','인터폰':'#BE123C','편지':'#A16207'};

// ── 배정 전도인 표시 헬퍼 ──
function _pubLabel(arr) {
  if (!arr || !arr.length) return '미배정';
  const main = arr.slice(0, 2).join(', ');
  const sub  = arr.slice(2);
  return sub.length ? `${main} <span style="font-size:10px;color:#60A5FA">+${sub.length}명 동행</span>` : main;
}
function _pubLabelPlain(arr) {
  if (!arr || !arr.length) return '미배정';
  const main = arr.slice(0, 2).join(', ');
  const sub  = arr.slice(2);
  return sub.length ? `${main} +${sub.length}명 동행` : main;
}
window._pubLabel      = _pubLabel;
window._pubLabelPlain = _pubLabelPlain;

// ── 전역 상태 ──
window._publishers = [];
window._deleteTargetId = null;

// ── 세션 상수 ──
const SESSION_KEY     = 'jwcard_admin_session';
const SESSION_HOURS   = 4;  // 세션 유효 시간

function _saveAdminSession(name, permission) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name,
      permission: permission || '관리자',
      expiry: Date.now() + SESSION_HOURS * 60 * 60 * 1000
    }));
  } catch(e) {}
}
function _loadAdminSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiry) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch(e) { return null; }
}
function _clearAdminSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
}

// ── 이름 입력 시 힌트 업데이트 + 키패드 전환 ──
window.adminNameInput = function() {
  const name = (document.getElementById('login-name-input').value || '').trim();
  const hint = document.getElementById('login-hint');
  const label = document.getElementById('login-pw-label');
  const pwInput = document.getElementById('pw-input');
  if (!hint || !label) return;
  if (name) {
    label.textContent = '개인 PIN';
    hint.textContent  = '구역카드 앱에서 설정한 PIN을 입력하세요';
    hint.style.display = 'block';
    // 모바일에서 숫자 키패드로 전환
    if (pwInput) {
      pwInput.setAttribute('inputmode', 'numeric');
      pwInput.setAttribute('pattern', '[0-9]*');
      pwInput.placeholder = 'PIN 입력 (숫자)';
    }
  } else {
    label.textContent = '비밀번호 / PIN';
    hint.style.display = 'none';
    // 일반 비밀번호 키보드로 복원
    if (pwInput) {
      pwInput.removeAttribute('inputmode');
      pwInput.removeAttribute('pattern');
      pwInput.placeholder = '비밀번호 또는 PIN 입력';
    }
  }
};

// ── 통합 로그인: 이름 있으면 개인 PIN, 없으면 관리자 비밀번호 ──
window.handleLogin = async function() {
  const name = (document.getElementById('login-name-input').value || '').trim();
  const pw   = (document.getElementById('pw-input').value || '').trim();
  const pwConfirm = (document.getElementById('pw-confirm') ? document.getElementById('pw-confirm').value : '').trim();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!pw) { showError('비밀번호 또는 PIN을 입력해 주세요.'); return; }

  // ── 이름 있음: publishers 개인 PIN 인증 ──
  if (name) {
    try {
      const pubSnap = await getDocs(query(collection(db, 'publishers'), where('name','==',name)));
      if (pubSnap.empty) { showError('등록된 이름을 찾을 수 없습니다.'); return; }
      const pubData = pubSnap.docs[0].data();
      if (pubData.permission === '인도자') {
        showError('인도자는 구역카드 앱(publisher.html)을 이용해 주세요.'); return;
      }
      const allowedPerms = ['봉사감독자','관리자','구역의종'];
      if (!allowedPerms.includes(pubData.permission)) {
        showError('관리자·봉사감독자·구역의종 권한이 없습니다.'); return;
      }
      if (!pubData.pin || pubData.pin.length === 0) {
        showError('PIN 미설정 — 구역카드 앱에서 먼저 PIN을 설정하세요.'); return;
      }
      if (pubData.pin !== pw) { showError('PIN이 올바르지 않습니다.'); return; }
      window._adminLoginName = name;
      window._adminPermission = pubData.permission;
      _saveAdminSession(name, pubData.permission);
      enterAdmin();
    } catch(e) { showError('로그인 오류: ' + e.message); }
    return;
  }

  // ── 이름 없음: 기존 관리자 비밀번호 인증 ──
  try {
    const adminDoc = await getDoc(doc(db, 'admin', 'config'));
    if (!adminDoc.exists()) {
      const setupNotice = document.getElementById('setup-notice');
      const confirmGroup = document.getElementById('pw-confirm-group');
      const loginBtn = document.getElementById('login-btn');
      if (confirmGroup.style.display === 'none') {
        setupNotice.style.display = 'block';
        confirmGroup.style.display = 'block';
        loginBtn.textContent = '비밀번호 설정 및 로그인';
        return;
      }
      if (pw !== pwConfirm) { showError('비밀번호가 일치하지 않습니다.'); return; }
      if (pw.length < 4)    { showError('비밀번호는 4자리 이상이어야 합니다.'); return; }
      await setDoc(doc(db, 'admin', 'config'), {
        password: pw, createdAt: serverTimestamp(), congregation: ''
      });
      window._adminLoginName = 'admin';
      window._adminPermission = '관리자';
      _saveAdminSession('admin', '관리자');
      enterAdmin();
    } else {
      if (adminDoc.data().password !== pw) { showError('비밀번호가 올바르지 않습니다.'); return; }
      window._adminLoginName = 'admin';
      window._adminPermission = '관리자';
      _saveAdminSession('admin', '관리자');
      enterAdmin();
    }
  } catch(e) { showError('로그인 오류: ' + e.message); }
};

function showError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function enterAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  _applyRoleUI();
  loadPublishers();
  loadTerritories();
  startAdminPresenceWatch();
  loadAdminConfig();
}

// ── 권한에 따른 UI 제한 적용 ──
function _applyRoleUI() {
  const perm = window._adminPermission || '관리자';
  const isFullAdmin = (perm === '관리자');
  // 전도인관리·설정: 관리자만 접근
  const navPub = document.getElementById('nav-publisher');
  const navSet = document.getElementById('nav-settings');
  if (navPub) navPub.style.display = isFullAdmin ? '' : 'none';
  if (navSet) navSet.style.display = isFullAdmin ? '' : 'none';
  // 구역지도·방문내역·메모관리·S-13: 관리자·봉사감독자만 접근
  const isTerrOnly = (perm === '구역의종');
  ['nav-map','nav-visit','nav-memo','nav-s13'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isTerrOnly ? 'none' : '';
  });
  // 관리자 외 권한은 구역관리 탭으로 진입
  if (!isFullAdmin) {
    const terrNav = document.querySelector('.nav-item[onclick*="territory"]');
    if (terrNav) switchTab('territory', terrNav);
  }
}

// ── 페이지 로드 시 세션 자동 복원 ──
(function() {
  const s = _loadAdminSession();
  if (s) {
    window._adminLoginName = s.name;
    window._adminPermission = s.permission || '관리자';
    // DOM 준비 후 enterAdmin 호출
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enterAdmin);
    } else {
      setTimeout(enterAdmin, 0);
    }
  }
})();
async function loadAdminConfig() {
  try {
    const cfgDoc = await getDoc(doc(db, 'admin', 'config'));
    if (cfgDoc.exists()) {
      const d = cfgDoc.data();
      window._cycleLimit      = d.cycleLimit      || 6;
      window._visitMode       = d.visitMode        || '호별';
      window._territoryGroups = d.territoryGroups  || getDefaultGroups();
      // '개인 구역' 항목이 없으면 자동으로 추가 (기존 Firestore 데이터 마이그레이션)
      if (!window._territoryGroups.includes('개인 구역')) {
        window._territoryGroups = [...window._territoryGroups, '개인 구역'];
        updateDoc(doc(db, 'admin', 'config'), { territoryGroups: window._territoryGroups }).catch(()=>{});
      }
      window._congregation    = d.congregation     || '';
      // 회중명 DOM 동적 업데이트 (로그인 화면, 사이드바, 매뉴얼 표지, 브라우저 탭 제목)
      const _cn = window._congregation;
      ['login-cong-name', 'sidebar-cong-name', 'manual-cong-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = _cn;
      });
      if (_cn) document.title = '구역카드 관리자 — ' + _cn;
      // 네이버 지도 Client ID: Firestore 우선, 없으면 config.js 폴백
      const _nKey = d.naverClientId || (window.APP_CONFIG && window.APP_CONFIG.naverClientId) || '';
      window._naverClientId = _nKey;
      if (_nKey && typeof window._loadNaverMaps === 'function') window._loadNaverMaps(_nKey);
      // 지도 지역 (주소 검색 프리픽스)
      window._mapRegion = d.mapRegion || (window.APP_CONFIG && window.APP_CONFIG.mapRegion) || '경기도 동두천시';
    } else {
      window._territoryGroups = getDefaultGroups();
    }
    renderCatTabs();
    renderCategorySelects();
    if (typeof window.renderTerritoryTable === 'function') window.renderTerritoryTable();
  } catch(e) {
    window._territoryGroups = getDefaultGroups();
    renderCatTabs();
    renderCategorySelects();
    if (typeof window.renderTerritoryTable === 'function') window.renderTerritoryTable();
  }
}
function getDefaultGroups() {
  return ['주택구역','상가구역','격지 구역','동행필수 구역','아파트 구역','인터폰','편지 구역','개인 구역'];
}

// ── 관리자 Presence 실시간 감시 ──
function startAdminPresenceWatch() {
  onSnapshot(collection(db, 'presence'), (snap) => {
    const today = new Date().toISOString().slice(0, 10);
    const all = snap.docs.map(d => d.data());

    // 현재 활성
    const activeNow = all.filter(d => d.active === true);
    // 오늘 활동 (비활성 포함, 오늘 날짜)
    const todayAll = all.filter(d => d.date === today && d.active !== true);

    renderAdminActiveNow(activeNow);
    renderAdminTodayList(todayAll);
  });
}

function renderAdminActiveNow(list) {
  const el = document.getElementById('admin-active-now');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = '<span class="presence-empty">접속 중인 전도인 없음</span>';
    return;
  }
  el.innerHTML = list.map(d => {
    const timeStr = d.lastSeen ? _fmtTime(d.lastSeen.toDate()) : '';
    return `<div class="presence-item active-now">
      <span class="presence-item-dot green"></span>
      <div class="presence-item-info">
        <div class="presence-item-name">${d.name}</div>
        <div class="presence-item-terr">${d.territoryNo}번 · ${d.territoryName}</div>
      </div>
      <div class="presence-item-time">${timeStr}</div>
    </div>`;
  }).join('');
}

function renderAdminTodayList(list) {
  const el = document.getElementById('admin-today-list');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = '<span class="presence-empty">오늘 완료 기록 없음</span>';
    return;
  }
  // lastSeen 내림차순 정렬
  list.sort((a, b) => {
    const ta = a.lastSeen ? a.lastSeen.toMillis() : 0;
    const tb = b.lastSeen ? b.lastSeen.toMillis() : 0;
    return tb - ta;
  });
  el.innerHTML = list.map(d => {
    const timeStr = d.lastSeen ? _fmtTime(d.lastSeen.toDate()) : '';
    return `<div class="presence-item">
      <span class="presence-item-dot gray"></span>
      <div class="presence-item-info">
        <div class="presence-item-name">${d.name}</div>
        <div class="presence-item-terr">${d.territoryNo}번 · ${d.territoryName}</div>
      </div>
      <div class="presence-item-time">${timeStr}</div>
    </div>`;
  }).join('');
}

function _fmtTime(date) {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

// Enter 키 로그인
document.getElementById('pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// ── 로그아웃 ──
window.logout = function() {
  _clearAdminSession();
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  const nameEl = document.getElementById('login-name-input');
  const pwEl   = document.getElementById('pw-input');
  const hint   = document.getElementById('login-hint');
  const label  = document.getElementById('login-pw-label');
  if (nameEl) nameEl.value = '';
  if (pwEl)   pwEl.value   = '';
  if (hint)   hint.style.display = 'none';
  if (label)  label.textContent  = '비밀번호 / PIN';
  document.getElementById('setup-notice').style.display = 'none';
  document.getElementById('pw-confirm-group').style.display = 'none';
  document.getElementById('login-btn').textContent = '로그인';
};

// ── 탭 전환 ──
const TAB_TITLES = {
  territory: '구역관리',
  publisher: '전도인관리',
  schedule:  '봉사일정',
  map: '구역지도',
  visit: '방문내역',
  memo: '메모관리',
  settings: '설정',
  manual: '관리자 매뉴얼',
  s13: 'S-13 구역 배정 기록'
};
window.switchTab = function(name, el) {
  // 매뉴얼에서 다른 탭으로 이동 시 패딩 복원
  const prevManual = document.getElementById('tab-manual')?.classList.contains('active');
  if (prevManual && name !== 'manual') {
    const ce = document.querySelector('.content');
    if (ce) ce.style.padding = '';
  }

  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[name];
  if (name === 'territory') {
    const sv = (() => { try { return localStorage.getItem('terrView'); } catch(e) { return null; } })();
    window._terrView = sv || (window.innerWidth <= 768 ? 'card' : 'list');
    document.getElementById('btn-view-list')?.classList.toggle('active', window._terrView==='list');
    document.getElementById('btn-view-card')?.classList.toggle('active', window._terrView==='card');
  }
  if (name === 'map')      initAdminMap();
  if (name === 'settings') loadSettingsValues();
  renderCatTabs();
  renderCategorySelects();
  if (name === 's13')     initS13DateRange();
  if (name === 'visit')   initVisitTab();
  if (name === 'memo')    initMemoTab();
  if (name === 'schedule') initScheduleTab();
  if (name === 'manual')  setTimeout(initManualZoom, 0); // DOM 활성화 후 측정
  // 모바일: 탭 선택 시 사이드바 닫기
  if (window.innerWidth <= 768) closeSidebar();
};

// ── 매뉴얼 모바일 줌 ──
// 사이드바 너비를 포함한 실제 content 영역 크기로 계산
function initManualZoom() {
  const inner     = document.getElementById('man-inner');
  const outer     = document.getElementById('man-zoom-outer');
  const contentEl = document.querySelector('.content');
  if (!inner || !outer || !contentEl) return;

  const MANUAL_W = 760;
  const PADDING  = 24; // .content 기본 패딩(px)

  // 1) 스타일 초기화 후 실제 가용 너비 측정
  inner.style.zoom   = '';
  inner.style.width  = '';
  inner.style.margin = '0 auto';
  contentEl.style.padding = '';

  // requestAnimationFrame으로 리플로우 후 측정
  requestAnimationFrame(() => {
    const avail = contentEl.clientWidth; // 사이드바 제외한 실제 너비

    if (avail >= MANUAL_W) {
      // 충분한 공간 → 데스크탑 정상 표시
      outer.style.overflowX = 'hidden';
    } else {
      // 공간 부족 → 패딩 제거 후 재측정해 zoom 계산
      contentEl.style.padding = '0';
      requestAnimationFrame(() => {
        const fullAvail = contentEl.clientWidth;
        const scale     = fullAvail / MANUAL_W;
        inner.style.width  = MANUAL_W + 'px';
        inner.style.margin = '0';
        inner.style.zoom   = scale;
        outer.style.overflowX = 'hidden';
      });
    }
  });
}

window.addEventListener('resize', () => {
  if (document.getElementById('tab-manual')?.classList.contains('active')) {
    initManualZoom();
  }
});

// ════════════════════════════════════════════
// ════════════════════════════════════════════
// ══ 봉사일정 관리 ══
// ════════════════════════════════════════════
let _schedDay       = -1;
let _schedData          = {};   // {0:[id,...], 1:[...], ...}
let _schedDayActive     = {};   // {0:false, 1:true, ...}
let _schedDayAutoReturn = {};   // {0:true, 1:true, ...} — 자정 자동 반납 여부 (기본 true)
let _schedAllocatedDate = {};   // {0:'2026-04-27', ...} — 실제 배분된 날짜 (캘린더 표시용)
let _schedLastTerrIds   = {};   // {0:[id,...], ...} — 자동반납 후에도 보존되는 마지막 배분 기록 (캘린더 표시용)
let _adpUndoBackup = null;      // 마지막 자동 배분 직전 상태 백업 {days, data, allocatedDates}
let _schedWeekOffset = 0;       // 0=이번 주, -1=지난 주, +1=다음 주 (현황판 날짜 표시용)
let _schedAllTerr   = [];
let _schedInitDone  = false;
let _schedSnapUnsubs = []; // 실시간 리스너 해제 함수 목록
let _schedCatFilter    = '';            // '' | 동적 그룹명
let _schedStatusFilter = 'incomplete'; // 검색 기본: 완료 구역 제외
let _schedGalCatFilter    = '';
let _schedGalStatusFilter = 'incomplete'; // 갤러리 기본: 완료 구역 제외
let _schedMode = 'search'; // 'search' | 'gallery'
let _schedDayMgrOpen = false;
let _schedCalYear  = 0;
let _schedCalMonth = 0;
let _notices = [];

window.initScheduleTab = async function() {
  if (_schedInitDone) { _refreshSchedWeeklyBoard(); _renderSchedDayManager(); if (_isCalendarVisible()) renderSchedCalendar(); return; }
  _schedInitDone = true;

  // 전체 활성 구역 로드
  const snap = await getDocs(collection(db, 'territories'));
  _schedAllTerr = snap.docs.map(d => ({id: d.id, ...d.data()}))
                          .filter(t => t.active !== false)
                          .sort((a,b) => parseInt(a.no||0)-parseInt(b.no||0));

  // 요일별 일정 + 활성 여부 로드 (0~6) — 7개 쿼리 병렬 처리
  const daySnaps = await Promise.all(
    [0,1,2,3,4,5,6].map(i => getDoc(doc(db, 'weeklySchedule', String(i))))
  );
  daySnaps.forEach((ds, i) => {
    if (ds.exists()) {
      const d = ds.data();
      _schedData[i]           = d.terrIds || [];
      _schedDayActive[i]      = d.active === true;
      _schedDayAutoReturn[i]  = d.autoReturn !== false; // 기본 true (필드 없으면 true)
      _schedAllocatedDate[i]  = d.allocatedDate || '';
      // lastTerrIds 가 있으면 사용, 없고 terrIds 가 있으면 그 값을 그대로 캘린더 기록으로 사용
      _schedLastTerrIds[i]    = (d.lastTerrIds && d.lastTerrIds.length) ? d.lastTerrIds : (d.terrIds || []);
    } else {
      _schedData[i]           = [];
      _schedDayActive[i]      = false;
      _schedDayAutoReturn[i]  = true;
      _schedAllocatedDate[i]  = '';
      _schedLastTerrIds[i]    = [];
    }
  });

  // ── 자동 반납: autoReturn=true 이고 allocatedDate가 오늘 이전인 요일의 terrIds 초기화 ──
  // KST(UTC+9) 기준 오늘 날짜 — toISOString()은 UTC이므로 9시간 더해서 비교
  const _autoReturnToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const _autoReturnBatch = [];
  daySnaps.forEach((ds, i) => {
    if (ds.exists()) {
      const d = ds.data();
      const shouldAutoReturn = d.autoReturn !== false; // 기본 true
      if (shouldAutoReturn && d.allocatedDate && d.allocatedDate < _autoReturnToday && (_schedData[i] || []).length > 0) {
        // 캘린더 기록 보존을 위해 lastTerrIds 에 현재 terrIds 저장
        const preservedIds = [...(d.terrIds || [])];
        _schedData[i] = [];
        _schedLastTerrIds[i] = preservedIds;
        _autoReturnBatch.push(
          setDoc(doc(db, 'weeklySchedule', String(i)), {
            terrIds:       [],
            lastTerrIds:   preservedIds,
            active:        _schedDayActive[i],
            autoReturn:    true,
            allocatedDate: d.allocatedDate,
            updatedAt:     serverTimestamp()
          })
        );
      }
    }
  });
  if (_autoReturnBatch.length) await Promise.all(_autoReturnBatch);

  _renderSchedDayManager();
  _refreshSchedWeeklyBoard();
  _initSchedCatChips();

  // 오늘 요일 자동 선택 (활성 요일 우선)
  const today = new Date().getDay();
  const dayToSelect = _schedDayActive[today] ? today
    : [0,1,2,3,4,5,6].find(d => _schedDayActive[d]);
  if (dayToSelect !== undefined) selectSchedDay(dayToSelect);

  // 캘린더 초기화
  const now = new Date();
  _schedCalYear = now.getFullYear();
  _schedCalMonth = now.getMonth();
  renderSchedCalendar();

  // 공지 로드
  loadNotices();

  // 실시간 리스너 시작 (인도자 변경사항 즉시 반영)
  _startSchedRealtimeSync();
};

// ── weeklySchedule 실시간 리스너 ──
function _startSchedRealtimeSync() {
  // 기존 리스너 해제
  _schedSnapUnsubs.forEach(u => u());
  _schedSnapUnsubs = [];

  let _initFired = 0; // 초기 7번 발화는 무시 (이미 일괄 로드된 데이터와 동일)
  for (let i = 0; i <= 6; i++) {
    const day = i;
    const unsub = onSnapshot(doc(db, 'weeklySchedule', String(day)), snap => {
      // 초기 발화 skip (초기 로드 데이터와 동일하므로 re-render 불필요)
      if (_initFired < 7) { _initFired++; return; }

      // 원격 변경(인도자 등) → 로컬 상태 업데이트
      if (snap.exists()) {
        const d = snap.data();
        _schedData[day]          = d.terrIds || [];
        _schedDayActive[day]     = d.active === true;
        _schedDayAutoReturn[day] = d.autoReturn !== false;
        _schedAllocatedDate[day] = d.allocatedDate || '';
        _schedLastTerrIds[day]   = (d.lastTerrIds && d.lastTerrIds.length) ? d.lastTerrIds : (d.terrIds || []);
      } else {
        _schedData[day]          = [];
        _schedDayAutoReturn[day] = true;
        _schedAllocatedDate[day] = '';
        _schedLastTerrIds[day]   = [];
      }

      // 현재 선택된 요일이면 UI 갱신
      if (day === _schedDay) {
        const chk = document.getElementById('sched-auto-return-chk');
        if (chk) chk.checked = _schedDayAutoReturn[day];
        renderSchedTerrChips();
        if (_schedMode === 'search')  renderUnallocatedList();
        if (_schedMode === 'gallery') renderSchedGallery();
        if (_isCalendarVisible()) renderSchedCalendar();
      }
      _refreshSchedWeeklyBoard();
    });
    _schedSnapUnsubs.push(unsub);
  }
}

// ── 서브탭 전환 ──
window.switchSchedSubtab = function(name, el) {
  document.querySelectorAll('.sched-subtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.sched-subview').forEach(v => v.classList.remove('active'));
  document.getElementById('sched-' + name).classList.add('active');
  // 캘린더 탭으로 전환 시 최신 데이터로 재렌더
  if (name === 'calendar') renderSchedCalendar();
};

// ── 요일 관리 패널 토글 ──
window.toggleSchedDayManager = function() {
  _schedDayMgrOpen = !_schedDayMgrOpen;
  document.getElementById('sched-day-manager').style.display = _schedDayMgrOpen ? 'block' : 'none';
  const btn = document.getElementById('sched-day-mgr-btn');
  if (btn) { btn.style.background = _schedDayMgrOpen ? '#EFF6FF' : '#fff'; btn.style.borderColor = _schedDayMgrOpen ? '#93C5FD' : '#E2E8F0'; }
};

// ── 요일 활성/비활성 토글 ──
window.toggleSchedDayActive = async function(day) {
  _schedDayActive[day] = !_schedDayActive[day];
  await setDoc(doc(db, 'weeklySchedule', String(day)), {
    terrIds:   _schedData[day] || [],
    active:    _schedDayActive[day],
    updatedAt: serverTimestamp()
  });
  _renderSchedDayManager();
  _refreshSchedWeeklyBoard();
  renderSchedCalendar();
  // 비활성된 요일이 현재 선택된 요일이면 첫 활성 요일로 이동
  if (!_schedDayActive[day] && _schedDay === day) {
    const next = [0,1,2,3,4,5,6].find(d => _schedDayActive[d]);
    if (next !== undefined) selectSchedDay(next);
    else document.getElementById('sched-day-content').style.display = 'none';
  }
};

// ── 요일 토글 버튼 렌더 ──
function _renderSchedDayManager() {
  const DAY_NAMES = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const el = document.getElementById('sched-day-toggles');
  if (!el) return;
  el.innerHTML = DAY_NAMES.map((name, i) => {
    const on = _schedDayActive[i];
    return `<button class="sched-day-toggle${on ? ' active' : ''}" onclick="toggleSchedDayActive(${i})">${on ? '✓' : '○'} ${name}</button>`;
  }).join('');
}

// ── 카테고리 필터 칩 초기화 ──
function _initSchedCatChips() {
  const groups = window._territoryGroups || [];
  const make = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<button class="sched-filter-chip active" onclick="${fn}('',this)">전체</button>` +
      groups.map(g => `<button class="sched-filter-chip" onclick="${fn}('${g}',this)">${g}</button>`).join('');
  };
  make('sched-cat-chips', 'setSchedCatFilter');
  make('sched-gal-cat-chips', 'setSchedGalCatFilter');
}

// ── 주간 배정 현황판 렌더 ──
// ── 이번 주(오프셋 적용) 각 요일의 날짜 계산 ──
function _getWeekDates(offsetWeeks) {
  const now = new Date();
  const todayMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayDow = now.getDay(); // 0=일
  // 이번 주 일요일 기준
  const sunMs = todayMs - todayDow * 86400000 + offsetWeeks * 7 * 86400000;
  return Array.from({length: 7}, (_, i) => {
    const dt = new Date(sunMs + i * 86400000);
    return {
      date:    dt,
      dateStr: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`,
      label:   `${dt.getMonth()+1}.${dt.getDate()}`,
    };
  });
}

function _refreshSchedWeeklyBoard() {
  const DAY_NAMES = ['일','월','화','수','목','금','토'];
  const el = document.getElementById('sched-weekly-board');
  if (!el) return;

  const weekDates = _getWeekDates(_schedWeekOffset);
  const todayStr  = new Date().toISOString().slice(0, 10);

  // 주간 날짜 범위 레이블 업데이트
  const label = document.getElementById('sched-week-label');
  if (label) {
    const sun = weekDates[0], sat = weekDates[6];
    const offLabel = _schedWeekOffset === 0 ? '이번 주' : _schedWeekOffset === -1 ? '지난 주' : _schedWeekOffset === 1 ? '다음 주' : `${_schedWeekOffset > 0 ? '+' : ''}${_schedWeekOffset}주`;
    label.textContent = `📅 ${offLabel}  ${sun.label}(일) ~ ${sat.label}(토)`;
  }

  const weekStart = weekDates[0].dateStr;
  const weekEnd   = weekDates[6].dateStr;

  el.innerHTML = DAY_NAMES.map((name, i) => {
    const isActive   = _schedDayActive[i];
    const isSelected = _schedDay === i;
    const isToday    = weekDates[i].dateStr === todayStr;
    const todayDot   = isToday ? `<span class="brd-today-dot"></span>` : '';

    // allocatedDate 가 이번 보기 주간 안에 있을 때만 카드 수 표시
    const allocDate  = _schedAllocatedDate[i] || '';
    const inThisWeek = allocDate
      ? (allocDate >= weekStart && allocDate <= weekEnd)
      : (_schedWeekOffset === 0);   // 날짜 없으면 이번 주에만 보임
    const rawCount   = (_schedData[i] || []).length;
    const count      = (isActive && inThisWeek) ? rawCount : 0;

    const countHtml  = !isActive
      ? `<div class="sched-board-count brd-inactive">─</div>`
      : count === 0
      ? `<div class="sched-board-count brd-empty">─</div>`
      : `<div class="sched-board-count brd-has">${count}장</div>`;
    return `<div class="sched-board-cell${isActive?' brd-on':''}${isSelected?' brd-sel':''}${isToday?' brd-today':''}" onclick="selectSchedDay(${i})">
      <div class="sched-board-day">${name}${todayDot}</div>
      <div class="sched-board-date">${weekDates[i].label}</div>
      ${countHtml}
    </div>`;
  }).join('');
}

// ── 요일에 해당하는 가장 가까운 미래 날짜 (오늘 포함) 계산 ──
function _nextDateForDow(dow) {
  const now = new Date();
  const todayDow = now.getDay();
  const diff = (dow - todayDow + 7) % 7; // 0(오늘)~6(다음 주 같은 요일 직전)
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// ── 주간 이동 ──
window.schedWeekMove = function(dir) {
  if (dir === 0) {
    _schedWeekOffset = 0;
  } else {
    _schedWeekOffset += dir;
  }
  _refreshSchedWeeklyBoard();
};

// ── 모드 전환 (미할당 ↔ 전체 목록) ──
window.setSchedMode = function(mode) {
  _schedMode = mode;
  document.getElementById('sched-panel-search').style.display  = mode === 'search'  ? 'block' : 'none';
  document.getElementById('sched-panel-gallery').style.display = mode === 'gallery' ? 'block' : 'none';
  document.getElementById('sched-btn-search').classList.toggle('active',  mode === 'search');
  document.getElementById('sched-btn-gallery').classList.toggle('active', mode === 'gallery');
  if (mode === 'search')  renderUnallocatedList();
  if (mode === 'gallery') renderSchedGallery();
};

// ── 갤러리 필터 ──
window.setSchedGalCatFilter = function(cat, el) {
  _schedGalCatFilter = cat;
  document.querySelectorAll('#sched-gal-cat-chips .sched-filter-chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderSchedGallery();
};
window.setSchedGalStatusFilter = function(status) {
  _schedGalStatusFilter = status;
  renderSchedGallery();
};

window.selectSchedDay = function(day) {
  _schedDay = day;
  const DAY_NAMES = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  document.getElementById('sched-day-title').textContent = '📅 ' + DAY_NAMES[day] + ' 배분 현황';
  document.getElementById('sched-day-content').style.display = 'block';
  // 카드 배분 검색창 초기화
  const _si = document.getElementById('sched-search-input');
  const _gi = document.getElementById('sched-gal-search');
  if (_si) _si.value = '';
  if (_gi) _gi.value = '';
  // 자동 반납 체크박스 상태 동기화
  const chk = document.getElementById('sched-auto-return-chk');
  if (chk) chk.checked = _schedDayAutoReturn[day] !== false;
  _refreshSchedWeeklyBoard();
  renderSchedTerrChips();
  if (_schedMode === 'search')  renderUnallocatedList();
  if (_schedMode === 'gallery') renderSchedGallery();
};

// ── 자동 반납 토글 ──
window.toggleSchedAutoReturn = async function() {
  const chk = document.getElementById('sched-auto-return-chk');
  _schedDayAutoReturn[_schedDay] = chk ? chk.checked : true;
  await setDoc(doc(db, 'weeklySchedule', String(_schedDay)), {
    terrIds:       _schedData[_schedDay] || [],
    active:        _schedDayActive[_schedDay] !== false,
    autoReturn:    _schedDayAutoReturn[_schedDay],
    allocatedDate: new Date().toISOString().slice(0, 10),
    updatedAt:     serverTimestamp()
  });
  const msg = document.getElementById('sched-save-msg');
  if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 1500); }
};

// ── 필터 ──
window.setSchedCatFilter = function(cat, el) {
  _schedCatFilter = cat;
  document.querySelectorAll('#sched-cat-chips .sched-filter-chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderSchedTerrChips();
  renderUnallocatedList();
};

window.setSchedStatusFilter = function(status) {
  _schedStatusFilter = status;
  renderUnallocatedList();
};

// ── 구역 진행상태 판별 (3단계) ──
// 'done'       : 이번 회차 완료 (completionStatus === 'complete')
// 'active'     : 전도인 배정됨, 진행중
// 'unassigned' : 배정 전도인 없음
function _terrStatus(t) {
  if (t.completionStatus === 'complete') return 'done';
  if (t.assignedPublishers?.length > 0)  return 'active';
  return 'unassigned';
}

// ── 전체 요일 배분 ID 집합 (특정 요일 제외 가능) ──
function _getAllAllocatedSet(exceptDay) {
  const set = new Set();
  for (let d = 0; d <= 6; d++) {
    if (d === exceptDay) continue;
    (_schedData[d] || []).forEach(id => set.add(id));
  }
  return set;
}

// ── 색상 맵 사전 계산 — 카드 렌더마다 indexOf 대신 Map.get() 사용 ──
function _buildCatColorMap() {
  const grpList = window._territoryGroups || [];
  const BG = ['#DBEAFE','#DCFCE7','#FEF3C7','#FEE2E2','#F1F5F9','#EDE9FE','#ECFEFF'];
  const CL = ['#1D4ED8','#166534','#92400E','#991B1B','#475569','#5B21B6','#0E7490'];
  const bgMap = new Map(), clMap = new Map();
  grpList.forEach((g, i) => { bgMap.set(g, BG[i % BG.length]); clMap.set(g, CL[i % CL.length]); });
  return (cat) => ({ bg: bgMap.get(cat) || '#F1F5F9', cl: clMap.get(cat) || '#475569' });
}

// ── 캘린더 탭이 현재 화면에 표시 중인지 확인 ──
function _isCalendarVisible() {
  const el = document.getElementById('sched-calendar');
  return !!(el && el.classList.contains('active'));
}

function _terrMatchesFilter(t) {
  if (_schedCatFilter && (t.category || '') !== _schedCatFilter) return false;
  if (_schedStatusFilter) {
    const st = _terrStatus(t);
    if (_schedStatusFilter === 'incomplete' && st === 'done') return false;          // 기존 호환
    else if (_schedStatusFilter !== 'incomplete' && st !== _schedStatusFilter) return false;
  }
  return true;
}

// ════════════════════════════════════════════
// ══ ⚡ 자동 배분 ══
// ════════════════════════════════════════════
const _ADP_EXCLUDE_CATS = new Set(['편지구역','개인구역','편지','개인','편지 구역','개인 구역']);

// ── 되돌리기 버튼 상태 ──
function _setUndoBtn(enabled) {
  const btn = document.getElementById('sched-undo-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity      = enabled ? '1'   : '0.4';
  btn.style.cursor       = enabled ? 'pointer' : 'default';
  btn.style.borderColor  = enabled ? '#FCA5A5' : '#E2E8F0';
  btn.style.color        = enabled ? '#DC2626'  : '#64748B';
  btn.style.background   = enabled ? '#FFF5F5'  : '#fff';
}

// ── 되돌리기 ──
window.undoAutoDist = async function() {
  if (!_adpUndoBackup) return;
  if (!confirm('마지막 자동 배분 전 상태로 되돌리시겠습니까?')) return;
  const bk = _adpUndoBackup;
  try {
    await Promise.all(bk.days.map(d =>
      setDoc(doc(db, 'weeklySchedule', String(d)), {
        terrIds:       bk.data[d],
        lastTerrIds:   bk.data[d],
        active:        _schedDayActive[d] !== false,
        autoReturn:    _schedDayAutoReturn[d] !== false,
        allocatedDate: bk.allocatedDates[d] || '',
        updatedAt:     serverTimestamp()
      })
    ));
    bk.days.forEach(d => {
      _schedData[d]          = bk.data[d];
      _schedLastTerrIds[d]   = [...(bk.data[d] || [])];
      _schedAllocatedDate[d] = bk.allocatedDates[d] || '';
    });
    _adpUndoBackup = null;
    _setUndoBtn(false);
    _refreshSchedWeeklyBoard();
    renderSchedTerrChips();
    if (_schedMode === 'search')  renderUnallocatedList();
    if (_schedMode === 'gallery') renderSchedGallery();
    if (_isCalendarVisible()) renderSchedCalendar();
  } catch(e) { alert('되돌리기 오류: ' + e.message); }
};

// ── 전체 배분 초기화 ──
window.clearAllSchedDist = async function() {
  const activeDays = [0,1,2,3,4,5,6].filter(d => _schedDayActive[d] && (_schedData[d]||[]).length > 0);
  if (!activeDays.length) { alert('초기화할 배분 내용이 없습니다.'); return; }
  const DAY_NAMES = ['일','월','화','수','목','금','토'];
  const list = activeDays.map(d => `${DAY_NAMES[d]}요일 ${(_schedData[d]||[]).length}장`).join(', ');
  if (!confirm(`활성 요일의 배분을 모두 초기화하시겠습니까?\n\n${list}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
  try {
    await Promise.all(activeDays.map(d =>
      setDoc(doc(db, 'weeklySchedule', String(d)), {
        terrIds:       [],
        lastTerrIds:   [],
        active:        true,
        autoReturn:    _schedDayAutoReturn[d] !== false,
        allocatedDate: '',
        updatedAt:     serverTimestamp()
      })
    ));
    activeDays.forEach(d => {
      _schedData[d]          = [];
      _schedLastTerrIds[d]   = [];
      _schedAllocatedDate[d] = '';
    });
    _adpUndoBackup = null;
    _setUndoBtn(false);
    _refreshSchedWeeklyBoard();
    renderSchedTerrChips();
    if (_schedMode === 'search')  renderUnallocatedList();
    if (_schedMode === 'gallery') renderSchedGallery();
    if (_isCalendarVisible()) renderSchedCalendar();
  } catch(e) { alert('초기화 오류: ' + e.message); }
};

window.openAutoDistPanel = function() {
  document.getElementById('auto-dist-overlay').classList.add('open');
  // 미리보기 초기화
  const prev = document.getElementById('adp-preview');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  const btn = document.getElementById('adp-confirm-btn');
  if (btn) btn.disabled = true;
  // 모드 상태 동기화
  adpOnModeChange();
  // 대상 요일 상태 동기화 (pick이면 체크박스 렌더)
  const targetMode = document.querySelector('[name="adp-target"]:checked')?.value;
  if (targetMode === 'pick') {
    document.getElementById('adp-day-picks').style.display = 'block';
    _renderAdpDayPicks();
  } else {
    document.getElementById('adp-day-picks').style.display = 'none';
  }
};

// ── 배분 방식 전환 UI 토글 ──
window.adpOnModeChange = function() {
  const byNo = document.getElementById('adp-mode-byno')?.checked;
  document.querySelectorAll('.adp-smart-only').forEach(el => {
    el.style.opacity      = byNo ? '0.35' : '1';
    el.style.pointerEvents = byNo ? 'none' : '';
  });
  document.getElementById('adp-byno-notice').style.display = byNo ? 'block' : 'none';
  // 방식 바뀌면 미리보기 초기화
  const prev = document.getElementById('adp-preview');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  const btn = document.getElementById('adp-confirm-btn');
  if (btn) btn.disabled = true;
};

window.closeAutoDistPanel = function() {
  document.getElementById('auto-dist-overlay').classList.remove('open');
};

// ── 설정값 읽기 ──
function _getAdpOpts() {
  const targetMode = document.querySelector('[name="adp-target"]:checked')?.value || 'all';
  // 직접 선택 시 체크된 요일만, 아니면 기존 로직
  let pickedDays = null;
  if (targetMode === 'pick') {
    pickedDays = [0,1,2,3,4,5,6].filter(d => {
      const chk = document.getElementById(`adp-day-pick-${d}`);
      return chk && chk.checked;
    });
  }
  return {
    mode:          document.querySelector('[name="adp-mode"]:checked')?.value || 'smart',
    targetMode,
    pickedDays,
    targetAll:     targetMode === 'all',
    countAuto:     document.querySelector('[name="adp-count"]:checked')?.value !== 'manual',
    countVal:      Math.max(1, parseInt(document.getElementById('adp-count-val')?.value) || 5),
    priUnassigned: document.getElementById('adp-pri-unassigned')?.checked,
    priOldest:     document.getElementById('adp-pri-oldest')?.checked,
    priLowrate:    document.getElementById('adp-pri-lowrate')?.checked,
    catDist:       document.getElementById('adp-cat-dist')?.checked,
    resetExisting: document.querySelector('[name="adp-existing"]:checked')?.value === 'reset',
  };
}

// ── 대상 요일 라디오 변경 ──
window.adpOnTargetChange = function() {
  const mode = document.querySelector('[name="adp-target"]:checked')?.value;
  const picks = document.getElementById('adp-day-picks');
  if (mode === 'pick') {
    picks.style.display = 'block';
    _renderAdpDayPicks();
  } else {
    picks.style.display = 'none';
  }
  // 미리보기 초기화
  const prev = document.getElementById('adp-preview');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  const btn = document.getElementById('adp-confirm-btn');
  if (btn) btn.disabled = true;
};

// ── 직접 선택 체크박스 렌더 ──
function _renderAdpDayPicks() {
  const DAY_NAMES = ['일','월','화','수','목','금','토'];
  const DAY_COLORS = ['#EF4444','#475569','#475569','#475569','#475569','#475569','#2563EB'];
  const box = document.getElementById('adp-day-pick-boxes');
  if (!box) return;
  box.innerHTML = DAY_NAMES.map((name, d) => {
    const active = _schedDayActive[d];
    if (!active) return ''; // 비활성 요일은 표시 안 함
    return `<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;font-weight:600;color:${DAY_COLORS[d]};cursor:pointer;padding:4px 8px;border:1.5px solid #E2E8F0;border-radius:7px;background:#fff;user-select:none">
      <input type="checkbox" id="adp-day-pick-${d}" checked style="accent-color:#1D4ED8;width:14px;height:14px">
      ${name}
    </label>`;
  }).join('');
}

// ── 우선순위 정렬 ──
function _adpSort(cards, opts) {
  const getMs = d => d ? (d.toDate ? d.toDate().getTime() : new Date(d).getTime()) : 0;
  return [...cards].sort((a, b) => {
    if (opts.priUnassigned) {
      const aU = !(a.assignedPublishers?.length), bU = !(b.assignedPublishers?.length);
      if (aU !== bU) return aU ? -1 : 1;
    }
    if (opts.priOldest) {
      const diff = getMs(a.lastAssignedDate) - getMs(b.lastAssignedDate);
      if (diff !== 0) return diff;
    }
    if (opts.priLowrate) {
      const diff = (a.completionRate || 0) - (b.completionRate || 0);
      if (diff !== 0) return diff;
    }
    return parseInt(a.no || 0) - parseInt(b.no || 0);
  });
}

// ── 배분 계산 (저장 없음) ──
function _calcAutoDist() {
  const opts = _getAdpOpts();

  // 대상 요일
  let targetDays;
  if (opts.targetMode === 'pick') {
    targetDays = (opts.pickedDays || []).filter(d => _schedDayActive[d]);
    if (!targetDays.length) return { ok: false, reason: '배분할 요일을 하나 이상 선택해 주세요.' };
  } else if (opts.targetAll) {
    targetDays = [0,1,2,3,4,5,6].filter(d => _schedDayActive[d]);
  } else {
    targetDays = [_schedDay];
  }
  if (!targetDays.length) return { ok: false, reason: '활성 요일이 없습니다.' };

  // 결과 초기 상태 (초기화 or 유지)
  const result = {};
  targetDays.forEach(d => {
    result[d] = opts.resetExisting ? [] : [...(_schedData[d] || [])];
  });

  // 이미 배분된 ID 집합 (비대상 요일 + 현재 result에 이미 있는 카드)
  const allocatedSet = new Set();
  for (let d = 0; d <= 6; d++) {
    if (!targetDays.includes(d)) (_schedData[d] || []).forEach(id => allocatedSet.add(id));
  }
  targetDays.forEach(d => result[d].forEach(id => allocatedSet.add(id)));

  // 미할당 풀: 완료 제외, 제외 카테고리 제외, 개인구역 제외, 이미 배분된 것 제외
  const pool = _schedAllTerr.filter(t => {
    if (allocatedSet.has(t.id)) return false;
    if (t.completionStatus === 'complete') return false;
    if (_ADP_EXCLUDE_CATS.has(t.category || '')) return false;
    if (t.personalAssignee) return false;
    return true;
  });

  if (!pool.length) return { ok: false, reason: '배분 가능한 미할당 카드가 없습니다.' };

  // 요일당 배분 수 계산
  const perDay = opts.countAuto
    ? Math.floor(pool.length / targetDays.length)
    : opts.countVal;

  if (perDay <= 0) return { ok: false, reason: '미할당 카드 수가 요일 수보다 적습니다.' };

  const totalNeeded = perDay * targetDays.length;

  // 배분할 카드 선택
  let toDistribute;
  if (opts.mode === 'byno') {
    // 번호순 배분: 구역 번호 오름차순만 적용, 우선순위/카테고리 무시
    toDistribute = [...pool]
      .sort((a, b) => parseInt(a.no || 0) - parseInt(b.no || 0))
      .slice(0, totalNeeded);
  } else {
    // 스마트 배분: 우선순위 정렬 후 카테고리 인터리빙
    const sorted = _adpSort(pool, opts);
    if (opts.catDist) {
      const cats = [...new Set(sorted.map(t => t.category || '기타'))];
      const queues = cats.map(c => sorted.filter(t => (t.category || '기타') === c));
      toDistribute = [];
      let hasMore = true;
      while (hasMore && toDistribute.length < totalNeeded) {
        hasMore = false;
        for (const q of queues) {
          if (q.length && toDistribute.length < totalNeeded) {
            toDistribute.push(q.shift());
            hasMore = true;
          }
        }
      }
    } else {
      toDistribute = sorted.slice(0, totalNeeded);
    }
  }

  // 라운드-로빈으로 요일별 배분
  toDistribute.forEach((t, i) => {
    result[targetDays[i % targetDays.length]].push(t.id);
  });

  // 카테고리 통계 (미리보기용)
  const catStats = {};
  toDistribute.forEach(t => {
    const c = t.category || '기타';
    catStats[c] = (catStats[c] || 0) + 1;
  });

  return {
    ok: true,
    mode: opts.mode,
    days: targetDays,
    cards: result,
    perDay,
    poolSize: pool.length,
    added: toDistribute.length,
    ordered: toDistribute,   // 번호순 미리보기용
    catStats,
    resetExisting: opts.resetExisting,
  };
}

// ── 미리보기 렌더 ──
window.previewAutoDist = function() {
  const res = _calcAutoDist();
  const prevEl = document.getElementById('adp-preview');
  const confirmBtn = document.getElementById('adp-confirm-btn');
  prevEl.style.display = 'block';

  if (!res.ok) {
    prevEl.innerHTML = `<div class="adp-prev-warn">⚠️ ${res.reason}</div>`;
    confirmBtn.disabled = true;
    return;
  }

  const DAY_NAMES = ['일','월','화','수','목','금','토'];
  const ADP_CAT_BG = ['#DBEAFE','#DCFCE7','#FEF3C7','#FEE2E2','#F1F5F9','#EDE9FE','#ECFEFF'];
  const ADP_CAT_CL = ['#1D4ED8','#166534','#92400E','#991B1B','#475569','#5B21B6','#0E7490'];
  const catList = Object.keys(res.catStats);

  let rows = res.days.map(d => {
    const before = (_schedData[d] || []).length;
    const after  = res.cards[d].length;
    const added  = after - (res.resetExisting ? 0 : before);
    const afterTxt = res.resetExisting ? `${after}장` : `${before}→${after}장`;
    return `<div class="adp-prev-row">
      <span class="adp-prev-day">${DAY_NAMES[d]}요일</span>
      <span class="adp-prev-add">+${added}장</span>
      <span class="adp-prev-detail">${afterTxt}</span>
    </div>`;
  }).join('');

  const catChips = catList.map((c, i) =>
    `<span class="adp-prev-cat-chip" style="background:${ADP_CAT_BG[i%7]};color:${ADP_CAT_CL[i%7]}">${c} ${res.catStats[c]}장</span>`
  ).join('');

  // 번호순 배분: 배분 순서 미리보기 추가
  let bynoDetail = '';
  if (res.mode === 'byno') {
    const DAY_NAMES2 = ['일','월','화','수','목','금','토'];
    const sampleRows = res.ordered.slice(0, 30).map((t, i) => {
      const dayIdx = res.days[i % res.days.length];
      return `<tr><td style="padding:2px 8px;color:#64748B">${t.no}</td><td style="padding:2px 8px">${t.category||'기타'}</td><td style="padding:2px 8px;color:#1D4ED8;font-weight:600">${DAY_NAMES2[dayIdx]}요일</td></tr>`;
    }).join('');
    const moreCount = res.ordered.length > 30 ? `<tr><td colspan="3" style="padding:4px 8px;color:#94A3B8;font-size:11px">… 외 ${res.ordered.length - 30}장</td></tr>` : '';
    bynoDetail = `
      <div style="margin-top:10px;border:1px solid #E2E8F0;border-radius:7px;overflow:hidden;background:#FAFBFD">
        <div style="padding:6px 10px;background:#F1F5F9;font-size:11.5px;font-weight:700;color:#475569">📋 번호순 배분 순서 (앞 30장)</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#F8FAFC">
            <th style="padding:4px 8px;text-align:left;color:#94A3B8;font-weight:600">번호</th>
            <th style="padding:4px 8px;text-align:left;color:#94A3B8;font-weight:600">유형</th>
            <th style="padding:4px 8px;text-align:left;color:#94A3B8;font-weight:600">배분 요일</th>
          </tr></thead>
          <tbody>${sampleRows}${moreCount}</tbody>
        </table>
      </div>`;
    bynoDetail += `<div style="margin-top:8px;padding:7px 10px;background:#FEF3C7;border-radius:6px;font-size:11.5px;color:#92400E;line-height:1.5">⚠️ 번호순 배분입니다. 배분 결과가 적절한지 확인 후 확정하세요.</div>`;
  }

  prevEl.innerHTML = `
    <div class="adp-prev-list">${rows}</div>
    <div class="adp-prev-summary">
      총 <strong>${res.added}</strong>장 배분 예정 &nbsp;|&nbsp; 미할당 잔여 <strong>${res.poolSize - res.added}</strong>장
    </div>
    ${catList.length && res.mode !== 'byno' ? `<div class="adp-prev-cats" style="margin-top:8px">${catChips}</div>` : ''}
    ${bynoDetail}
  `;
  confirmBtn.disabled = false;
};

// ── 배분 확정 ──
window.confirmAutoDist = async function() {
  const res = _calcAutoDist();
  if (!res.ok || !res.added) return;

  const DAY_NAMES = ['일','월','화','수','목','금','토'];
  const summary = res.days.map(d => `${DAY_NAMES[d]}(${res.cards[d].length}장)`).join(', ');
  const modeLabel = res.mode === 'byno' ? '번호순 배분' : '스마트 배분';
  const bynoWarn  = res.mode === 'byno'
    ? '\n\n⚠️ 번호순 배분은 우선순위·유형 설정을 무시하고\n구역 번호 오름차순으로 배분하는 방식입니다.\n배분 결과를 미리보기에서 확인하셨나요?'
    : '';
  if (!confirm(`[${modeLabel}] 배분을 확정하시겠습니까?\n\n${summary}\n\n총 ${res.added}장${bynoWarn}`)) return;

  // ── 되돌리기용 백업 (확정 직전 상태) ──
  _adpUndoBackup = {
    days:           [...res.days],
    data:           Object.fromEntries(res.days.map(d => [d, [...(_schedData[d] || [])]])),
    allocatedDates: Object.fromEntries(res.days.map(d => [d, _schedAllocatedDate[d] || ''])),
  };
  _setUndoBtn(true);

  try {
    // 각 요일별 실제 봉사일(다가오는 그 요일 날짜)을 allocatedDate 로 저장 — 캘린더 정확 표시용
    const allocByDay = Object.fromEntries(res.days.map(d => [d, _nextDateForDow(d)]));
    await Promise.all(res.days.map(d =>
      setDoc(doc(db, 'weeklySchedule', String(d)), {
        terrIds:       res.cards[d],
        lastTerrIds:   res.cards[d],
        active:        _schedDayActive[d] !== false,
        autoReturn:    _schedDayAutoReturn[d] !== false,
        allocatedDate: allocByDay[d],
        updatedAt:     serverTimestamp()
      })
    ));
    // 로컬 상태 업데이트
    res.days.forEach(d => {
      _schedData[d] = res.cards[d];
      _schedLastTerrIds[d] = [...res.cards[d]];
      _schedAllocatedDate[d] = allocByDay[d];
    });
    closeAutoDistPanel();
    _refreshSchedWeeklyBoard();
    renderSchedTerrChips();
    if (_schedMode === 'search')  renderUnallocatedList();
    if (_schedMode === 'gallery') renderSchedGallery();
    if (_isCalendarVisible()) renderSchedCalendar();
  } catch(e) {
    _adpUndoBackup = null;
    _setUndoBtn(false);
    alert('배분 오류: ' + e.message);
  }
};

// ── 배정된 구역 칩 카드 목록 ──
function renderSchedTerrChips() {
  const ids = _schedData[_schedDay] || [];
  const badge = document.getElementById('sched-count-badge');
  if (badge) badge.textContent = ids.length ? ids.length + '개 배분됨' : '배분 없음';
  const catColor = _buildCatColorMap();
  const wrap = document.getElementById('sched-terr-chips');
  if (!wrap) return;
  const filtered = ids.filter(id => {
    const t = _schedAllTerr.find(t => t.id === id);
    if (!t) return false;
    if (_schedCatFilter && (t.category || '') !== _schedCatFilter) return false;
    return true;
  });
  if (!filtered.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px 16px;color:#94A3B8;font-size:13px;border:1.5px dashed #E2E8F0;border-radius:10px">${ids.length && _schedCatFilter ? '해당 구역 유형이 없습니다.' : '배분된 구역이 없습니다.<br>아래에서 구역을 추가하세요.'}</div>`;
    return;
  }
  wrap.innerHTML = '<div class="scc-list">'
    + filtered.map(id => {
      const t = _schedAllTerr.find(t => t.id === id);
      if (!t) return '';
      const { bg, cl } = catColor(t.category);
      return `<div class="sched-chip-card">
        <span class="scc-no" style="background:${bg};color:${cl}">${t.no}번</span>
        <span class="scc-name">${t.name}</span>
        <span class="scc-cat" style="color:${cl}">${t.category||''}</span>
        <button class="scc-del" onclick="removeSchedTerr('${id}')" title="제거">✕</button>
      </div>`;
    }).join('')
    + '</div>';
}

// ── 갤러리 모드 렌더 (가상 스크롤 — IntersectionObserver 배치 로드) ──
let _galIO = null;  // IntersectionObserver 인스턴스
const _GAL_BATCH = 40;

function renderSchedGallery() {
  const catColor = _buildCatColorMap();
  const existing = new Set(_schedData[_schedDay] || []);
  const otherAllocated = _getAllAllocatedSet(_schedDay); // 타 요일에 배분된 ID
  const gq = (document.getElementById('sched-gal-search')?.value || '').trim().toLowerCase();
  const gsort = document.getElementById('sched-gal-sort')?.value || 'no';
  const filtered = _schedAllTerr.filter(t => {
    // 타 요일에 이미 배분된 카드는 제외 (현재 요일 카드는 ✓ 표시로 유지)
    if (otherAllocated.has(t.id)) return false;
    if (_schedGalCatFilter && (t.category||'') !== _schedGalCatFilter) return false;
    // 완료 구역: 현재 요일 배분된 카드는 유지, 나머지는 필터 적용
    if (!existing.has(t.id) && _schedGalStatusFilter === 'incomplete' && t.completionStatus === 'complete') return false;
    if (gq) {
      const cycleStr = String(t.cycle || 1);
      if (!String(t.no).includes(gq) && !(t.name||'').toLowerCase().includes(gq) && !cycleStr.includes(gq)) return false;
    }
    return true;
  });
  const el = document.getElementById('sched-gallery-grid');
  if (!el) return;

  // 이전 Observer 해제
  if (_galIO) { _galIO.disconnect(); _galIO = null; }

  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:#94A3B8;font-size:13px">해당 조건의 구역이 없습니다</div>';
    return;
  }

  // 배정된 카드 맨 앞으로, 그 안에서 선택한 정렬 적용
  const getMs = t => {
    if (!t.lastAssignedDate) return 0;
    return t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
  };
  const cmp = (a, b) => {
    if (gsort === 'no')       return (parseInt(a.no)||0)-(parseInt(b.no)||0);
    if (gsort === 'old')      return getMs(a)-getMs(b);
    if (gsort === 'cycle')    return (b.cycle||1)-(a.cycle||1) || (parseInt(a.no)||0)-(parseInt(b.no)||0);
    if (gsort === 'progress') return (b.completionRate||0)-(a.completionRate||0);
    return 0;
  };
  filtered.sort((a,b) => {
    const aAssigned = existing.has(a.id) ? 0 : 1;
    const bAssigned = existing.has(b.id) ? 0 : 1;
    if (aAssigned !== bAssigned) return aAssigned - bAssigned; // 배분된 카드 먼저
    return cmp(a, b);
  });

  // 스크롤 컨테이너 생성
  const container = document.createElement('div');
  container.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:440px;overflow-y:auto;padding-bottom:4px';

  function _buildTileHTML(t) {
    const isAssigned = existing.has(t.id);
    const { bg, cl } = catColor(t.category);
    const st = _terrStatus(t);
    const stDot = isAssigned ? '' :
      st === 'active'
        ? '<span class="sgal-dot sgal-dot-active" title="진행중"></span>'
        : '<span class="sgal-dot sgal-dot-idle" title="미배정"></span>';
    return `<div class="sched-gal-tile${isAssigned?' sgal-assigned':''}" onclick="toggleSchedTerrGallery('${t.id}')">
      <div class="sgal-header">
        <span class="sgal-no" style="background:${bg};color:${cl}">${t.no}번</span>
        ${isAssigned ? '<span class="sgal-check">✓</span>' : stDot}
      </div>
      <div class="sgal-name">${t.name}</div>
      <div class="sgal-cat" style="color:${cl}">${t.category||''}</div>
    </div>`;
  }

  let rendered = 0;
  function _appendBatch() {
    const end = Math.min(rendered + _GAL_BATCH, filtered.length);
    // 기존 sentinel 제거
    const old = container.querySelector('#sgal-sentinel');
    if (old) old.remove();
    // 배치 HTML 생성 후 DocumentFragment로 삽입
    const frag = document.createRange().createContextualFragment(
      filtered.slice(rendered, end).map(_buildTileHTML).join('')
    );
    container.appendChild(frag);
    rendered = end;
    // 더 로드할 항목이 있으면 sentinel + Observer 등록
    if (rendered < filtered.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'sgal-sentinel';
      sentinel.style.height = '1px';
      container.appendChild(sentinel);
      _galIO = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          _galIO.disconnect(); _galIO = null;
          _appendBatch();
        }
      }, { root: container, threshold: 0 });
      _galIO.observe(sentinel);
    }
  }

  el.innerHTML = '';
  el.appendChild(container);
  _appendBatch();
}

// ── 갤러리에서 탭 → 즉시 추가/제거 ──
window.toggleSchedTerrGallery = async function(id) {
  if (!_schedData[_schedDay]) _schedData[_schedDay] = [];
  const idx = _schedData[_schedDay].indexOf(id);
  if (idx >= 0) _schedData[_schedDay].splice(idx, 1);
  else          _schedData[_schedDay].push(id);
  await _saveSchedDay();
  renderSchedTerrChips();
  renderSchedGallery();
  _refreshSchedWeeklyBoard();
  if (_isCalendarVisible()) renderSchedCalendar();
};

// ── 미할당 구역 목록 렌더 (검색 입력으로 필터링, 항상 표시) ──
function renderUnallocatedList() {
  const resultsEl = document.getElementById('sched-search-results');
  if (!resultsEl) return;
  const q = (document.getElementById('sched-search-input')?.value || '').trim().toLowerCase();
  const sort = document.getElementById('sched-search-sort')?.value || 'no';
  const existing = new Set(_schedData[_schedDay] || []);
  const allAllocated = _getAllAllocatedSet(-1); // 모든 요일 배분 집합 (예외 없음)
  const catColor = _buildCatColorMap();
  const filtered = _schedAllTerr.filter(t => {
    if (allAllocated.has(t.id)) return false;   // 어떤 요일에든 배분된 카드 제외
    if (_schedStatusFilter === 'incomplete' && t.completionStatus === 'complete') return false;
    if (_schedCatFilter && (t.category||'') !== _schedCatFilter) return false;
    if (q) {
      const cycleStr = String(t.cycle || 1);
      return String(t.no).includes(q) || (t.name||'').toLowerCase().includes(q) || cycleStr.includes(q);
    }
    return true;
  });
  const getMs = t => {
    if (!t.lastAssignedDate) return 0;
    return t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
  };
  if (sort === 'no')       filtered.sort((a,b) => (parseInt(a.no)||0)-(parseInt(b.no)||0));
  else if (sort === 'old') filtered.sort((a,b) => getMs(a)-getMs(b));
  else if (sort === 'cycle') filtered.sort((a,b) => (b.cycle||1)-(a.cycle||1)||(parseInt(a.no)||0)-(parseInt(b.no)||0));
  else if (sort === 'progress') filtered.sort((a,b) => (b.completionRate||0)-(a.completionRate||0));
  if (!filtered.length) {
    const msg = q ? '검색 결과가 없습니다' : '미할당 구역이 없습니다';
    resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:#94A3B8;font-size:13px">${msg}</div>`;
  } else {
    resultsEl.innerHTML = filtered.map(t => {
      const { bg, cl } = catColor(t.category);
      const st = _terrStatus(t);
      const stDot = st === 'active'
        ? '<span class="ssi-dot ssi-dot-active"></span>'
        : '<span class="ssi-dot ssi-dot-idle"></span>';
      return `<div class="sched-search-item" onclick="addSchedTerr('${t.id}')">
        ${stDot}
        <span class="ssi-no" style="background:${bg};color:${cl}">${t.no}번</span>
        <span class="ssi-name">${t.name}</span>
        <span class="ssi-cat" style="color:${cl}">${t.category||''}</span>
        <span class="ssi-add">배분</span>
      </div>`;
    }).join('');
  }
  resultsEl.style.display = 'block';
}

// ── searchSchedTerr: 입력 시 미할당 목록 필터 ──
window.searchSchedTerr = function() {
  renderUnallocatedList();
};

window.addSchedTerr = async function(id) {
  if (!_schedData[_schedDay]) _schedData[_schedDay] = [];
  if (_schedData[_schedDay].includes(id)) return;
  _schedData[_schedDay].push(id);
  await _saveSchedDay();
  const si = document.getElementById('sched-search-input');
  const sr = document.getElementById('sched-search-results');
  if (si) si.value = '';
  if (sr) sr.style.display = 'none';
  _refreshSchedWeeklyBoard();
  renderSchedTerrChips();
  if (_schedMode === 'gallery') renderSchedGallery();
  if (_isCalendarVisible()) renderSchedCalendar();
};

window.removeSchedTerr = async function(id) {
  _schedData[_schedDay] = (_schedData[_schedDay]||[]).filter(i => i !== id);
  await _saveSchedDay();
  _refreshSchedWeeklyBoard();
  renderSchedTerrChips();
  if (_schedMode === 'gallery') renderSchedGallery();
  if (_isCalendarVisible()) renderSchedCalendar();
};

async function _saveSchedDay() {
  const allocStr = _nextDateForDow(_schedDay); // 해당 요일의 다가오는 실제 날짜
  const ids = _schedData[_schedDay] || [];
  await setDoc(doc(db, 'weeklySchedule', String(_schedDay)), {
    terrIds:       ids,
    lastTerrIds:   ids,
    active:        _schedDayActive[_schedDay] !== false,
    autoReturn:    _schedDayAutoReturn[_schedDay] !== false,
    allocatedDate: allocStr,
    updatedAt:     serverTimestamp()
  });
  _schedAllocatedDate[_schedDay] = allocStr; // 로컬 상태 즉시 반영
  _schedLastTerrIds[_schedDay]   = [...ids];
  const msg = document.getElementById('sched-save-msg');
  if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
}

// ── 캘린더 날짜 상세 모달 ──
const _CAL_CAT_COLOR = {
  '주택구역':      {bg:'#DCFCE7',cl:'#166534'},
  '주택 구역':     {bg:'#DCFCE7',cl:'#166534'},
  '상가구역':      {bg:'#FEF3C7',cl:'#92400E'},
  '상가 구역':     {bg:'#FEF3C7',cl:'#92400E'},
  '아파트구역':    {bg:'#DBEAFE',cl:'#1D4ED8'},
  '아파트 구역':   {bg:'#DBEAFE',cl:'#1D4ED8'},
  '격지 구역':     {bg:'#F3E8FF',cl:'#7C3AED'},
  '각지':          {bg:'#F3E8FF',cl:'#7C3AED'},
  '동행필수 구역': {bg:'#FEE2E2',cl:'#991B1B'},
  '동행필수':      {bg:'#FEE2E2',cl:'#991B1B'},
  '인터폰':        {bg:'#FFE4E6',cl:'#BE123C'},
  '편지 구역':     {bg:'#FEF9C3',cl:'#A16207'},
  '편지구역':      {bg:'#FEF9C3',cl:'#A16207'},
  '개인 구역':     {bg:'#F1F5F9',cl:'#475569'},
  '개인구역':      {bg:'#F1F5F9',cl:'#475569'},
};

window.openCalModal = function(dateStr, dow) {
  const activeIds = _schedData[dow] || [];
  const histIds   = _schedLastTerrIds[dow] || [];
  const dayCards  = activeIds.length ? activeIds : histIds;
  const allocDate = _schedAllocatedDate[dow];
  const terrIds   = dayCards.length > 0 && (allocDate ? allocDate === dateStr : true) ? dayCards : [];
  if (!terrIds.length) return;

  const [y, m, d] = dateStr.split('-').map(Number);
  const DAY_KO = ['일','월','화','수','목','금','토'];
  const dateLabel = `${y}년 ${m}월 ${d}일 (${DAY_KO[dow]})`;

  document.getElementById('cal-modal-date').textContent  = dateLabel;
  document.getElementById('cal-modal-count').textContent = `${terrIds.length}개 구역`;

  const cards = terrIds.map(id => _schedAllTerr.find(t => t.id === id)).filter(Boolean);
  const body  = document.getElementById('cal-modal-body');

  if (!cards.length) {
    body.innerHTML = '<div class="cal-modal-empty">카드 정보를 불러올 수 없습니다.</div>';
  } else {
    body.innerHTML = cards.map(t => {
      const cat   = t.category || '기타';
      const color = _CAL_CAT_COLOR[cat] || {bg:'#F1F5F9', cl:'#475569'};
      const name  = t.name  ? `<div class="cal-modal-name">${t.name}</div>` : '';
      const addr  = t.address ? `<div class="cal-modal-addr">📍 ${t.address}</div>` : '';
      return `<div class="cal-modal-card">
        <div class="cal-modal-no">${t.no}</div>
        <span class="cal-modal-cat" style="background:${color.bg};color:${color.cl}">${cat}</span>
        <div style="flex:1;min-width:0">${name}${addr}</div>
      </div>`;
    }).join('');
  }

  document.getElementById('cal-modal-overlay').classList.add('open');
};

window.closeCalModal = function() {
  document.getElementById('cal-modal-overlay').classList.remove('open');
};

// ── 월간 캘린더 ──
window.schedGoToday = function() {
  const now = new Date();
  _schedCalYear  = now.getFullYear();
  _schedCalMonth = now.getMonth();
  renderSchedCalendar();
};

window.schedCalMove = function(dir) {
  _schedCalMonth += dir;
  if (_schedCalMonth < 0)  { _schedCalMonth = 11; _schedCalYear--; }
  if (_schedCalMonth > 11) { _schedCalMonth = 0;  _schedCalYear++; }
  renderSchedCalendar();
};

function renderSchedCalendar() {
  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('sched-cal-title').textContent = `${_schedCalYear}년 ${MONTH_NAMES[_schedCalMonth]}`;
  const catColor = _buildCatColorMap();

  const firstDow  = new Date(_schedCalYear, _schedCalMonth, 1).getDay();
  const totalDays = new Date(_schedCalYear, _schedCalMonth + 1, 0).getDate();
  const now = new Date();

  let html = '';
  // 앞 빈칸
  for (let i = 0; i < firstDow; i++) {
    html += '<div class="sched-cal-cell other-month"></div>';
  }
  // 이번 주 각 요일의 날짜 문자열 미리 계산 (폴백용)
  const _thisWeekDateStr = (() => {
    const map = {};
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayDow = now.getDay();
    for (let dw = 0; dw <= 6; dw++) {
      const dt = new Date(todayMs + (dw - todayDow) * 86400000);
      map[dw] = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
    return map;
  })();

  for (let d = 1; d <= totalDays; d++) {
    const dow       = (firstDow + d - 1) % 7;
    const dateStr   = `${_schedCalYear}-${String(_schedCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // 캘린더는 자동반납 후에도 보존된 lastTerrIds 를 사용하여 기록 표시
    const activeIds = _schedData[dow] || [];
    const histIds   = _schedLastTerrIds[dow] || [];
    const cards     = activeIds.length ? activeIds : histIds;
    const allocDate = _schedAllocatedDate[dow];
    // allocatedDate가 있으면 정확히 일치하는 날에만, 없으면 이번 주 해당 요일에 표시 (구 데이터 호환)
    const terrIds   = cards.length > 0 && (allocDate ? allocDate === dateStr : _thisWeekDateStr[dow] === dateStr)
                        ? cards : [];
    const isToday   = now.getFullYear() === _schedCalYear && now.getMonth() === _schedCalMonth && now.getDate() === d;
    const hasTerr   = terrIds.length > 0;
    const dateColor = dow === 0 ? 'color:#EF4444' : dow === 6 ? 'color:#2563EB' : '';

    const clickAttr = hasTerr ? ` onclick="openCalModal('${dateStr}',${dow})"` : '';
    html += `<div class="sched-cal-cell${isToday ? ' today' : ''}${hasTerr ? ' has-terr' : ''}"${clickAttr}>`;
    html += `<div class="sched-cal-date" style="${dateColor}">${d}</div>`;

    const allTerr = _schedAllTerr.length ? _schedAllTerr : (window._territories || []);
    terrIds.slice(0, 5).forEach(id => {
      const t = allTerr.find(t => t.id === id);
      if (!t) return;
      const cat   = t.category || '';
      const color = _CAL_CAT_COLOR[cat] || {bg:'#EFF6FF', cl:'#1D4ED8'};
      html += `<span class="sched-cal-terr-chip" style="background:${color.bg};color:${color.cl}">${t.no}</span>`;
    });
    if (terrIds.length > 5) {
      html += `<span class="sched-cal-more">+${terrIds.length - 5}</span>`;
    }
    html += '</div>';
  }

  document.getElementById('sched-cal-cells').innerHTML = html;
}

// ── 공지 관리 ──
async function loadNotices() {
  try {
    const snap = await getDocs(query(collection(db, 'adminNotices'), orderBy('createdAt', 'desc')));
    _notices = snap.docs.map(d => ({id: d.id, ...d.data()}));
    renderNoticeList();
  } catch(e) {
    console.warn('공지 로드 실패:', e);
  }
}

function renderNoticeList() {
  const wrap = document.getElementById('notice-list');
  if (!wrap) return;
  if (!_notices.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:28px;color:#94A3B8;font-size:13px;border:1.5px dashed #E2E8F0;border-radius:10px">저장된 공지가 없습니다</div>';
    return;
  }
  const targetLabel = { all:'📢 전체', publisher:'🗺 구역카드', cart:'🛒 전시대' };
  wrap.innerHTML = _notices.map(n => {
    const isActive = !!n.active;
    const dateStr  = n.createdAt ? n.createdAt.toDate().toLocaleDateString('ko-KR') : '';
    const expDate  = n.expiresAt ? (n.expiresAt.toDate ? n.expiresAt.toDate() : new Date(n.expiresAt)) : null;
    const expStr   = expDate ? expDate.toLocaleDateString('ko-KR') + ' 만료' : '';
    const bodyHtml = (n.body || '').replace(/</g,'&lt;').replace(/\n/g,'<br>');
    const tLabel   = targetLabel[n.target || 'all'] || '📢 전체';
    return `<div class="notice-item${isActive ? ' is-active' : ''}">
      <div class="notice-item-body">
        <div class="notice-item-header">
          <span class="${isActive ? 'notice-badge-active' : 'notice-badge-inactive'}">${isActive ? '🔴 활성' : '비활성'}</span>
          <span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:20px;padding:1px 8px;font-weight:600">${tLabel}</span>
          <span class="notice-item-title">${n.title || '(제목 없음)'}</span>
        </div>
        <div class="notice-item-text">${bodyHtml}</div>
        <div class="notice-item-meta">${dateStr}${expStr ? ' · ' + expStr : ''}</div>
      </div>
      <div class="notice-actions">
        <button class="btn btn-sm ${isActive ? 'btn-warn' : 'btn-navy'}" onclick="toggleNotice('${n.id}',${!isActive},'${n.target||'all'}')">${isActive ? '비활성화' : '활성화'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteNotice('${n.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

window.saveNotice = async function() {
  const title  = (document.getElementById('notice-title-input').value || '').trim();
  const body   = (document.getElementById('notice-body-input').value  || '').trim();
  const expStr = document.getElementById('notice-expire-input').value;
  const target = document.getElementById('notice-target-input')?.value || 'all';
  if (!body) { alert('공지 내용을 입력해 주세요.'); return; }

  // 같은 대상의 기존 활성 공지만 비활성화 (대상별 1개 유지)
  const sameTarget = _notices.filter(n => n.active && (n.target || 'all') === target);
  for (const n of sameTarget) {
    await setDoc(doc(db, 'adminNotices', n.id), {active: false}, {merge: true});
  }

  const data = {
    title,
    body,
    target,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: expStr ? new Date(expStr + 'T23:59:59') : null
  };
  await addDoc(collection(db, 'adminNotices'), data);

  document.getElementById('notice-title-input').value = '';
  document.getElementById('notice-body-input').value  = '';
  document.getElementById('notice-expire-input').value = '';
  if (document.getElementById('notice-target-input')) document.getElementById('notice-target-input').value = 'all';

  const targetNames = { all:'전체 앱', publisher:'구역카드 앱', cart:'전시대 봉사 앱' };
  await loadNotices();
  alert(`✅ 공지가 저장되어 ${targetNames[target] || ''}에 표시됩니다.`);
};

window.toggleNotice = async function(id, active, target = 'all') {
  if (active) {
    // 같은 대상의 기존 활성 공지만 비활성화
    for (const n of _notices.filter(n => n.active && n.id !== id && (n.target || 'all') === target)) {
      await setDoc(doc(db, 'adminNotices', n.id), {active: false}, {merge: true});
    }
  }
  await setDoc(doc(db, 'adminNotices', id), {active}, {merge: true});
  await loadNotices();
};

window.deleteNotice = async function(id) {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;
  await deleteDoc(doc(db, 'adminNotices', id));
  await loadNotices();
};

window.toggleSidebar = function() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const isOpen = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open', isOpen);
};
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('open');
}

// ── 전도인 불러오기 ──
async function loadPublishers() {
  try {
    const q = query(collection(db, 'publishers'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    window._publishers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPublisherTable();
    updateStats();
  } catch (e) {
    document.getElementById('pub-table-wrap').innerHTML =
      '<div class="loading" style="color:#EF4444">데이터를 불러오는 중 오류가 발생했습니다.</div>';
  }
}

function updateStats() {
  const pubs = window._publishers;
  document.getElementById('stat-total').textContent = pubs.length;
  document.getElementById('stat-approved').textContent = pubs.filter(p => p.approved).length;
  document.getElementById('stat-pending').textContent = pubs.filter(p => !p.approved).length;
  document.getElementById('stat-leader').textContent = pubs.filter(p => ['관리자','봉사감독자','구역의종','인도자'].includes(p.permission)).length;
}

// ── 전도인 테이블 렌더링 ──
// 정렬 상태 (전역)
if (!window._pubSort) window._pubSort = { col: 'name', dir: 'asc' };

window.setPubSort = function(col) {
  if (window._pubSort.col === col) {
    window._pubSort.dir = window._pubSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    window._pubSort.col = col;
    window._pubSort.dir = 'asc';
  }
  renderPublisherTable();
};

window.renderPublisherTable = function() {
  const keyword = document.getElementById('search-input').value.trim();
  let list = window._publishers.filter(p =>
    !keyword || p.name.includes(keyword)
  );

  // ── 정렬 순서 가중치 ──
  const permOrder  = { '관리자': 0, '봉사감독자': 1, '구역의종': 2, '인도자': 3, '일반': 4 };
  const orgOrder   = { '장로': 0, '봉사의 종': 1, '전도인': 2 };

  const { col, dir } = window._pubSort;
  list = [...list].sort((a, b) => {
    let va, vb;
    if (col === 'name') {
      va = (a.name || '').localeCompare(b.name || '', 'ko');
      return dir === 'asc' ? va : -va;
    }
    if (col === 'orgRole') {
      va = orgOrder[a.orgRole] ?? 2;
      vb = orgOrder[b.orgRole] ?? 2;
    } else if (col === 'permission') {
      va = permOrder[a.permission] ?? 3;
      vb = permOrder[b.permission] ?? 3;
    } else if (col === 'approved') {
      va = a.approved ? 0 : 1;
      vb = b.approved ? 0 : 1;
    } else if (col === 'consent') {
      va = a.consentGiven ? 0 : 1;
      vb = b.consentGiven ? 0 : 1;
    } else if (col === 'lastAccess') {
      va = a.lastAccess ? a.lastAccess.toDate().getTime() : 0;
      vb = b.lastAccess ? b.lastAccess.toDate().getTime() : 0;
    } else {
      va = 0; vb = 0;
    }
    if (va !== vb) return dir === 'asc' ? va - vb : vb - va;
    // 동점이면 이름 가나다 순
    return (a.name || '').localeCompare(b.name || '', 'ko');
  });

  if (!list.length) {
    document.getElementById('pub-table-wrap').innerHTML =
      '<div class="loading">등록된 전도인이 없습니다. 위 버튼으로 추가해 주세요.</div>';
    return;
  }

  const rows = list.map(p => {
    const orgRoleChip = p.orgRole === '장로'
      ? `<span class="chip chip-blue">${p.orgRole}</span>`
      : p.orgRole === '봉사의 종'
        ? `<span class="chip chip-purple">${p.orgRole}</span>`
        : `<span class="chip chip-gray">${p.orgRole || '전도인'}</span>`;

    const permChip = p.permission === '관리자'
      ? `<span class="chip chip-red">관리자</span>`
      : p.permission === '봉사감독자'
        ? `<span class="chip" style="background:#FEF3C7;color:#92400E;font-weight:600">봉사감독자</span>`
      : p.permission === '구역의종'
        ? `<span class="chip" style="background:#E0F2FE;color:#0369A1;font-weight:600">구역의종</span>`
      : p.permission === '인도자'
        ? `<span class="chip chip-purple">인도자</span>`
        : `<span class="chip chip-gray">일반</span>`;

    const statusChip = p.approved
      ? `<span class="chip chip-green">승인</span>`
      : `<span class="chip chip-amber">대기</span>`;

    const consentChip = p.consentGiven
      ? `<span class="chip chip-green">완료</span>`
      : `<span class="chip chip-gray">미완료</span>`;

    const actions = `<button class="btn btn-sm" onclick="openEditPublisher('${p.id}')">편집</button>`
      + (p.approved
        ? ` <button class="btn btn-sm btn-danger" onclick="removePublisher('${p.id}','${p.name}')">제거</button>`
        : ` <button class="btn btn-sm btn-success" onclick="approvePublisher('${p.id}')">승인</button>
            <button class="btn btn-sm btn-danger" onclick="removePublisher('${p.id}','${p.name}')">거부</button>`
      );

    const editAddrBtn = `<button class="btn btn-sm" style="${p.canEditAddress ? 'background:#DCFCE7;color:#166534;border:1.5px solid #BBF7D0' : 'background:#F1F5F9;color:#64748B;border:1.5px solid #CBD5E1'};font-size:10px;padding:2px 7px" onclick="toggleCanEditAddress('${p.id}')">${p.canEditAddress ? '✏️ ON' : '✏️ OFF'}</button>`;
    const _cr = p.cartRole || (p.cartApproved ? 'member' : '');
    const cartBtn = _cr === 'admin'
      ? `<button class="btn btn-sm" style="background:#5B21B6;color:#fff;border:1.5px solid #4C1D95;font-size:10px;padding:2px 7px;display:inline-flex;align-items:center;gap:2px" onclick="cycleCartRole('${p.id}')"><svg width="10" height="12" viewBox="0 0 80 90" fill="none" style="flex-shrink:0"><rect x="14" y="3" width="52" height="62" rx="2.5" fill="white"/><rect x="18.5" y="7.5" width="43" height="28" rx="2" fill="rgba(255,255,255,0.15)"/><ellipse cx="14" cy="76" rx="10" ry="14" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2.8"/><circle cx="14" cy="76" r="3.5" fill="white"/><ellipse cx="66" cy="76" rx="10" ry="14" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2.8"/><circle cx="66" cy="76" r="3.5" fill="white"/></svg> 인도자</button>`
      : _cr === 'member'
        ? `<button class="btn btn-sm" style="background:#EDE9FE;color:#5B21B6;border:1.5px solid #DDD6FE;font-size:10px;padding:2px 7px;display:inline-flex;align-items:center;gap:2px" onclick="cycleCartRole('${p.id}')"><svg width="10" height="12" viewBox="0 0 80 90" fill="none" style="flex-shrink:0"><rect x="14" y="3" width="52" height="62" rx="2.5" fill="#5B21B6"/><rect x="18.5" y="7.5" width="43" height="28" rx="2" fill="rgba(255,255,255,0.3)"/><ellipse cx="14" cy="76" rx="10" ry="14" fill="white" stroke="#5B21B6" stroke-width="2.8"/><circle cx="14" cy="76" r="3.5" fill="#5B21B6"/><ellipse cx="66" cy="76" rx="10" ry="14" fill="white" stroke="#5B21B6" stroke-width="2.8"/><circle cx="66" cy="76" r="3.5" fill="#5B21B6"/></svg> 인원</button>`
        : `<button class="btn btn-sm" style="background:#F1F5F9;color:#94A3B8;border:1.5px solid #E2E8F0;font-size:10px;padding:2px 7px;display:inline-flex;align-items:center;gap:2px" onclick="cycleCartRole('${p.id}')"><svg width="10" height="12" viewBox="0 0 80 90" fill="none" style="flex-shrink:0"><rect x="14" y="3" width="52" height="62" rx="2.5" fill="#94A3B8"/><rect x="18.5" y="7.5" width="43" height="28" rx="2" fill="rgba(255,255,255,0.3)"/><ellipse cx="14" cy="76" rx="10" ry="14" fill="white" stroke="#94A3B8" stroke-width="2.8"/><circle cx="14" cy="76" r="3.5" fill="#94A3B8"/><ellipse cx="66" cy="76" rx="10" ry="14" fill="white" stroke="#94A3B8" stroke-width="2.8"/><circle cx="66" cy="76" r="3.5" fill="#94A3B8"/></svg> –</button>`;

    return `<tr>
      <td style="font-weight:500">${p.name}</td>
      <td class="pub-col-hide">${permChip}</td>
      <td>${statusChip}</td>
      <td class="pub-col-hide">${consentChip}</td>
      <td>${editAddrBtn}</td>
      <td>${cartBtn}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
  }).join('');

  // ── 정렬 아이콘 헬퍼 ──
  const si = (c) => {
    const active = window._pubSort.col === c;
    const icon = active ? (window._pubSort.dir === 'asc' ? '▲' : '▼') : '⇅';
    return `<span class="sort-icon${active ? ' active' : ''}">${icon}</span>`;
  };

  document.getElementById('pub-table-wrap').innerHTML = `
    <div class="table-scroll-wrap"><table>
      <thead><tr>
        <th class="th-sort" onclick="setPubSort('name')">이름${si('name')}</th>
        <th class="th-sort pub-col-hide" onclick="setPubSort('permission')">시스템 권한${si('permission')}</th>
        <th class="th-sort" onclick="setPubSort('approved')">상태${si('approved')}</th>
        <th class="th-sort pub-col-hide" onclick="setPubSort('consent')">동의${si('consent')}</th>
        <th>주소편집</th>
        <th>전시대</th>
        <th>작업</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
};

// ── 전도인 추가 ──
window.openAddModal = function() {
  document.getElementById('new-name').value = '';
  document.getElementById('new-org-role').value = '전도인';
  document.getElementById('new-permission').value = '일반';
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-name').focus(), 100);
};

window.addPublisher = async function() {
  const name = document.getElementById('new-name').value.trim();
  const orgRole = document.getElementById('new-org-role').value;
  const permission = document.getElementById('new-permission').value;

  if (!name) { alert('이름을 입력해 주세요.'); return; }

  // 중복 확인
  const exists = window._publishers.find(p => p.name === name);
  if (exists) { alert(`'${name}'은 이미 등록된 이름입니다.`); return; }

  try {
    const docRef = await addDoc(collection(db, 'publishers'), {
      name,
      orgRole,
      permission,
      approved: true,
      consentGiven: false,
      consentDate: null,
      assignedTerritory: null,
      lastAccess: null,
      createdAt: serverTimestamp()
    });
    window._publishers.push({ id: docRef.id, name, orgRole, permission, approved: true, consentGiven: false });
    closeModal('add-modal');
    renderPublisherTable();
    updateStats();
  } catch (e) {
    alert('저장 중 오류가 발생했습니다.');
  }
};

// ── 전도인 승인 ──
// ── 전도인 편집 ──
window._editPubId = null;

window.openEditPublisher = function(id) {
  const p = window._publishers.find(p => p.id === id);
  if (!p) return;
  window._editPubId = id;
  document.getElementById('ep-name').value          = p.name || '';
  document.getElementById('ep-org-role').value      = p.orgRole || '전도인';
  document.getElementById('ep-permission').value    = p.permission || '일반';
  document.getElementById('ep-approved').value      = p.approved ? 'true' : 'false';
  document.getElementById('ep-cart-role').value = p.cartRole || (p.cartApproved ? 'member' : '');

  // PIN 섹션 — 인도자 이상만 표시
  const isLeaderPerm = ['인도자','구역의종','봉사감독자','관리자'].includes(p.permission);
  const pinSection   = document.getElementById('ep-pin-section');
  const pinStatus    = document.getElementById('ep-pin-status');
  if (pinSection) pinSection.style.display = isLeaderPerm ? 'block' : 'none';
  if (pinStatus)  pinStatus.textContent    = p.pin ? '✅ PIN 설정됨' : '⚠ PIN 미설정 (다음 로그인 시 자동 설정)';
  document.getElementById('edit-pub-modal').classList.add('open');
};

window.resetPublisherPin = async function() {
  const id = window._editPubId;
  if (!id) return;
  if (!confirm('이 전도인의 PIN을 초기화하시겠습니까?\n\n다음 로그인 시 본인이 새 PIN을 직접 설정하게 됩니다.')) return;
  try {
    // window._deleteDoc + 빈 pin 필드 삭제
    await window._updateDoc(window._doc(window._db, 'publishers', id), { pin: '' });
    document.getElementById('ep-pin-status').textContent = '⚠ PIN 초기화됨 (다음 로그인 시 자동 설정)';
    alert('PIN이 초기화되었습니다.');
    const p = window._publishers.find(p => p.id === id);
    if (p) p.pin = '';
  } catch(e) { alert('오류: ' + e.message); }
};

window.toggleCanEditAddress = async function(id) {
  const p = window._publishers.find(p => p.id === id);
  if (!p) return;
  const newVal = !p.canEditAddress;
  try {
    await updateDoc(doc(db, 'publishers', id), { canEditAddress: newVal });
    p.canEditAddress = newVal;
    renderPublisherTable();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

// cartRole 순환: 비허용 → 전시대인원 → 전시대인도자 → 비허용
window.cycleCartRole = async function(id) {
  const p = window._publishers.find(p => p.id === id);
  if (!p) return;
  const cur = p.cartRole || (p.cartApproved ? 'member' : '');
  const next = cur === '' ? 'member' : cur === 'member' ? 'admin' : '';
  try {
    await updateDoc(doc(db, 'publishers', id), { cartRole: next, cartApproved: next !== '' });
    p.cartRole = next; p.cartApproved = next !== '';
    renderPublisherTable();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.savePublisherEdit = async function() {
  const id = window._editPubId;
  if (!id) return;
  const p = window._publishers.find(p => p.id === id);
  if (!p) return;

  const name         = document.getElementById('ep-name').value.trim();
  const orgRole      = document.getElementById('ep-org-role').value;
  const permission   = document.getElementById('ep-permission').value;
  const approved     = document.getElementById('ep-approved').value === 'true';
  const cartRole     = document.getElementById('ep-cart-role').value;
  const cartApproved = cartRole !== '';

  if (!name) { alert('이름을 입력해 주세요.'); return; }

  // 이름 변경 시 중복 확인
  if (name !== p.name) {
    const dup = window._publishers.find(x => x.name === name && x.id !== id);
    if (dup) { alert(`'${name}'은 이미 등록된 이름입니다.`); return; }
  }

  try {
    await updateDoc(doc(db, 'publishers', id), { name, orgRole, permission, approved, cartRole, cartApproved });
    p.name = name; p.orgRole = orgRole; p.permission = permission; p.approved = approved; p.cartRole = cartRole; p.cartApproved = cartApproved;
    closeModal('edit-pub-modal');
    renderPublisherTable();
    updateStats();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.approvePublisher = async function(id) {
  try {
    await updateDoc(doc(db, 'publishers', id), { approved: true });
    const p = window._publishers.find(p => p.id === id);
    if (p) p.approved = true;
    renderPublisherTable();
    updateStats();
  } catch (e) {
    alert('승인 처리 중 오류가 발생했습니다.');
  }
};

// ── 전도인 제거 ──
window.removePublisher = function(id, name) {
  window._deleteTargetId = id;
  document.getElementById('delete-name-label').textContent = name;
  document.getElementById('delete-modal').classList.add('open');
};

window.confirmDelete = async function() {
  const id = window._deleteTargetId;
  if (!id) return;
  try {
    await deleteDoc(doc(db, 'publishers', id));
    window._publishers = window._publishers.filter(p => p.id !== id);
    closeModal('delete-modal');
    renderPublisherTable();
    updateStats();
  } catch (e) {
    alert('제거 중 오류가 발생했습니다.');
  }
};

// ── 모달 닫기 ──
// 편집/배정 모달이 닫힐 때 다시 열어야 할 구역 카드 팝업 ID
window._returnToCardId = null;
function _maybeReturnToCard(closedId) {
  if (!window._returnToCardId) return;
  if (closedId !== 'edit-modal' && closedId !== 'assign-modal') return;
  const id = window._returnToCardId;
  window._returnToCardId = null;
  // 약간의 딜레이로 모달 전환 자연스럽게
  setTimeout(() => { try { openTerritoryCard(id); } catch(e) {} }, 80);
}

window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
  _maybeReturnToCard(id);
};

// 모달 배경 클릭 시 닫기
document.querySelectorAll('.modal-wrap').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) { m.classList.remove('open'); _maybeReturnToCard(m.id); }
  });
});

// Enter 키 전도인 추가
document.getElementById('new-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.addPublisher();
});



// 전체 회차 리셋 (6회차 → 1회차)
async function resetAllTerritories() {
  try {
    const batch = [];
    for (const t of window._territories) {
      const historyEntry = {
        cycle: t.cycle || 1,
        completedAt: new Date().toISOString().slice(0,10),
        publishers: t.assignedPublishers || [],
        resetAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'territories', t.id), {
        cycle: 1,
        status: '미배정',
        completionRate: 0,
        assignedPublishers: [],
        lastCompletedDate: serverTimestamp(),
        lastAssignedDate: serverTimestamp(),
        cycleHistory: [...(t.cycleHistory || []), historyEntry]
      });
      t.cycle = 1;
      t.status = '미배정';
      t.completionRate = 0;
      t.assignedPublishers = [];
    }
    renderTerritoryTable();
    updateTerritoryStats();
    alert('✅ 모든 구역이 1회차로 리셋됐습니다. 새 순환을 시작합니다!');
  } catch(e) { alert('리셋 중 오류: ' + e.message); }
}

// 수동 전체 리셋 (관리자 버튼)
window.manualReset = async function() {
  // 1차 확인
  if (!confirm(
    '⚠️ 전체 리셋을 진행하려 합니다.\n\n' +
    '모든 구역이 1회차로 초기화됩니다.\n' +
    '현재 회차 기록은 완료 이력에 저장됩니다.\n\n' +
    '계속하시겠습니까?'
  )) return;

  // 2차 확인
  if (!confirm(
    '🔴 두 번째 확인입니다.\n\n' +
    '이 작업은 되돌릴 수 없습니다.\n' +
    '정말로 전체 리셋을 진행하시겠습니까?'
  )) return;

  // 3차 확인 — 직접 입력
  const answer = prompt(
    '⛔ 마지막 확인입니다.\n\n' +
    '전체 리셋을 실행하려면 아래 입력란에\n' +
    '  전체리셋  \n' +
    '을 정확히 입력하세요.'
  );
  if (!answer || answer.trim() !== '전체리셋') {
    alert('입력이 일치하지 않아 리셋이 취소되었습니다.');
    return;
  }

  await resetAllTerritories();
};
// 회차 필터
window.filterCycle = function(cyc, el) {
  window._currentCycle = cyc;
  document.querySelectorAll('.cycle-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTerritoryTable();
};

// ── 강제 회수 ──
let _frTerrId = null;

window.openForceReturnModal = function(id) {
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  _frTerrId = id;
  const pubs = (t.assignedPublishers || []).join(', ') || '—';
  document.getElementById('fr-terr-info').innerHTML =
    `<span style="font-size:16px">${t.no}번</span> ${t.name}<br><small style="font-weight:400;color:#78350F">배정: ${pubs}</small>`;
  document.querySelector('[name="fr-type"][value="incomplete"]').checked = true;
  document.getElementById('force-return-modal').classList.add('open');
};

window.confirmForceReturn = async function() {
  const t = window._territories.find(t => t.id === _frTerrId);
  if (!t) return;
  const type = document.querySelector('[name="fr-type"]:checked')?.value || 'incomplete';
  const updateData = {
    status: '미배정',
    assignedPublishers: [],
    completionStatus: null,
    forceRetrievedAt: serverTimestamp(),
    forceRetrievedBy: window._adminPermission || '관리자'
  };
  if (type === 'cancel') {
    updateData.completionRate = 0;
    updateData.visitMap = {};
  }
  try {
    await updateDoc(doc(db, 'territories', _frTerrId), updateData);
    Object.assign(t, { status: '미배정', assignedPublishers: [], completionStatus: null });
    if (type === 'cancel') { t.completionRate = 0; t.visitMap = {}; }
    closeModal('force-return-modal');
    renderTerritoryTable();
    updateTerritoryStats();
    renderOverdueList();
  } catch(e) { alert('회수 중 오류: ' + e.message); }
};

// ── 장기 미반납 패널 ──
let _overdueSelected = new Set();

window.toggleOverduePanel = function() {
  const panel = document.getElementById('overdue-panel');
  const btn = document.getElementById('btn-overdue');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  btn.classList.toggle('active', !visible);
  if (!visible) renderOverdueList();
};

window.renderOverdueList = function() {
  const days = parseInt(document.getElementById('overdue-threshold')?.value || '30');
  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;
  const overdue = (window._territories || []).filter(t => {
    if (!(t.assignedPublishers?.length > 0)) return false;
    if (days === 0) return true;
    if (!t.lastAssignedDate) return true;
    const ms = t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
    return (now - ms) >= threshold;
  });
  // 배지 업데이트
  const badge = document.getElementById('overdue-badge');
  if (badge) badge.textContent = overdue.length;
  // 패널이 숨겨진 경우 리스트만 배지 업데이트
  const listEl = document.getElementById('overdue-list');
  const countEl = document.getElementById('overdue-count');
  if (!listEl) return;
  if (countEl) countEl.textContent = overdue.length ? `총 ${overdue.length}개` : '없음';
  _overdueSelected = new Set([..._overdueSelected].filter(id => overdue.some(t => t.id === id)));
  if (!overdue.length) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">장기 미반납 구역이 없습니다 🎉</div>';
    return;
  }
  listEl.innerHTML = overdue.map(t => {
    const pubs = (t.assignedPublishers || []).join(', ');
    let dayStr = '—';
    if (t.lastAssignedDate) {
      const ms = t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
      dayStr = Math.floor((now - ms) / (24*60*60*1000)) + '일 경과';
    }
    const chk = _overdueSelected.has(t.id);
    return `<div class="overdue-item${chk?' overdue-sel':''}" id="oi-${t.id}">
      <input type="checkbox" class="overdue-chk" ${chk?'checked':''} onchange="toggleOverdueSelect('${t.id}',this)">
      <span class="overdue-no">${t.no}번</span>
      <div class="overdue-body">
        <div class="overdue-name">${t.name}</div>
        <div class="overdue-meta">${pubs} · <span style="color:#DC2626">${dayStr}</span></div>
      </div>
      <button class="tl-retrieve-btn" onclick="openForceReturnModal('${t.id}')">🔙 회수</button>
    </div>`;
  }).join('');
};

window.toggleOverdueSelect = function(id, el) {
  if (el.checked) _overdueSelected.add(id);
  else _overdueSelected.delete(id);
  const item = document.getElementById('oi-' + id);
  if (item) item.classList.toggle('overdue-sel', el.checked);
};

window.selectAllOverdue = function() {
  document.querySelectorAll('.overdue-chk').forEach(chk => {
    const id = chk.closest('[id^="oi-"]')?.id?.replace('oi-','');
    if (id) { _overdueSelected.add(id); chk.checked = true; }
    chk.closest('.overdue-item')?.classList.add('overdue-sel');
  });
};

window.bulkForceReturn = async function() {
  if (!_overdueSelected.size) { alert('선택된 구역이 없습니다.'); return; }
  if (!confirm(`선택한 ${_overdueSelected.size}개 구역을 일괄 회수합니다.\n(미완료 처리 후 배정 해제)\n계속하시겠습니까?`)) return;
  const ids = [..._overdueSelected];
  for (const id of ids) {
    const t = window._territories.find(t => t.id === id);
    if (!t) continue;
    try {
      await updateDoc(doc(db, 'territories', id), {
        status: '미배정', assignedPublishers: [], completionStatus: null,
        forceRetrievedAt: serverTimestamp(), forceRetrievedBy: window._adminPermission || '관리자'
      });
      Object.assign(t, { status: '미배정', assignedPublishers: [], completionStatus: null });
    } catch(e) { console.error('회수 오류', id, e); }
  }
  _overdueSelected.clear();
  renderTerritoryTable();
  updateTerritoryStats();
  renderOverdueList();
  alert(`✅ ${ids.length}개 구역을 회수했습니다.`);
};

// 완료 처리
window.completeTerritory = async function(id, name) {
  if (!confirm(`"${name}" 구역을 완료 처리하시겠습니까?
회차가 1 증가하고 완료일이 기록됩니다.`)) return;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const newCycle = (t.cycle || 1) + 1;
  // 배정일 추출 (S-13 기록용)
  let _assignedAtStr = '';
  if (t.lastAssignedDate) {
    try {
      const _ad = t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate() : new Date(t.lastAssignedDate);
      if (!isNaN(_ad)) _assignedAtStr = _ad.getFullYear() + '-' + String(_ad.getMonth()+1).padStart(2,'0') + '-' + String(_ad.getDate()).padStart(2,'0');
    } catch(e) {}
  }
  // 개인구역: 배정된 전도인이 없으면 personalAssignee를 기록, 배정일도 personalAssignedDate 사용
  const _assigned = (t.assignedPublishers && t.assignedPublishers.length > 0)
    ? t.assignedPublishers
    : (t.personalAssignee ? [t.personalAssignee] : []);
  if (!_assignedAtStr && t.personalAssignedDate) {
    _assignedAtStr = t.personalAssignedDate;
  }

  // visitMap에서 실제 방문한 전도인 이름 수집 → publishers에 병합 (S-13 정확도 향상)
  const _visitMap = t.visitMap || {};
  const _visitedPubs = [...new Set(
    Object.values(_visitMap).map(v => v?.by).filter(Boolean)
  )];
  const _publishers = [...new Set([..._assigned, ..._visitedPubs])];

  const historyEntry = {
    cycle:       t.cycle || 1,
    completedAt: new Date().toISOString().slice(0, 10),
    publishers:  _publishers,
    visitMode:   window._visitMode || '호별',
    assignedAt:  _assignedAtStr,
    unitVisits:  _visitMap   // 세대별 방문 스냅샷 저장
  };
  try {
    await updateDoc(doc(db, 'territories', id), {
      cycle:              newCycle,
      status:             '미배정',
      completionRate:     0,
      assignedPublishers: [],
      visitMap:           {},           // 다음 회차를 위해 초기화
      lastCompletedDate:  serverTimestamp(),
      lastAssignedDate:   serverTimestamp(),
      cycleHistory:       [...(t.cycleHistory || []), historyEntry]
    });
    t.cycle = newCycle;
    t.status = '미배정';
    t.completionRate = 0;
    t.assignedPublishers = [];
    t.visitMap = {};
    t.cycleHistory = [...(t.cycleHistory || []), historyEntry];
    renderTerritoryTable();
    updateTerritoryStats();
const limit=window._cycleLimit||6;
    if(newCycle>=limit){alert(`🔒 "${name}" 구역이 ${limit}회차에 도달하여 자동 비활성화됩니다.`);}else{alert(`완료! 이제 ${newCycle}회차가 시작됩니다.`);}
  } catch(e) { alert('처리 중 오류: ' + e.message); }
};

// 미완료 처리
window.incompleteTerritory = async function(id) {
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const newStatus = (t.assignedPublishers && t.assignedPublishers.length > 0) ? '진행중' : '미배정';
  try {
    await updateDoc(doc(db, 'territories', id), { status: newStatus, completionRate: 0 });
    t.status = newStatus;
    t.completionRate = 0;
    renderTerritoryTable();
    updateTerritoryStats();
  } catch(e) { alert('처리 중 오류: ' + e.message); }
};

// 미리보기 — 실제 publisher.html을 새 창으로 열기
window.previewTerritory = function(id) {
  try { sessionStorage.setItem('jwcard_admin_preview', id); } catch(e) {}
  window.open('publisher.html?preview=1&id=' + encodeURIComponent(id) + '&_t=' + Date.now(), '_blank', 'width=480,height=860,resizable=yes');
};


// ════════════════════════════════
// 구역 편집
// ════════════════════════════════
let _editTargetId = null;
let _editUnits = [];
let _replaceExcelData = null;
let _editChangedRows = new Set();
let _editNewRows = new Set();
let _uDragSrc = null;

function _escH(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.switchEditTab = function(tab, el) {
  document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.edit-tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('edit-tab-' + tab).classList.add('active');
  // 호수 목록 탭 → 자동 확장 / 다른 탭 → 기본 크기로 복원
  const modal = document.querySelector('#edit-modal .edit-modal');
  const wrap  = document.getElementById('edit-modal');
  if (tab === 'units') {
    if (!modal.classList.contains('fullscreen')) modal.classList.add('expanded');
  } else {
    modal.classList.remove('expanded');
    if (modal.classList.contains('fullscreen')) _exitFullscreen(modal, wrap);
  }
};

// 전체화면 토글
let _editFsActive = false;
window.toggleEditFullscreen = function() {
  const modal = document.querySelector('#edit-modal .edit-modal');
  const wrap  = document.getElementById('edit-modal');
  const btn   = document.getElementById('btn-fs');
  if (!_editFsActive) {
    modal.classList.add('fullscreen');
    modal.classList.remove('expanded');
    wrap.classList.add('fs-mode');
    btn.textContent = '⊡';
    btn.title = '전체화면 해제';
    _editFsActive = true;
  } else {
    _exitFullscreen(modal, wrap);
  }
};
function _exitFullscreen(modal, wrap) {
  const btn = document.getElementById('btn-fs');
  modal.classList.remove('fullscreen');
  wrap.classList.remove('fs-mode');
  // 호수 탭이 열려있으면 expanded 유지
  if (document.getElementById('edit-tab-units')?.classList.contains('active')) {
    modal.classList.add('expanded');
  }
  if (btn) { btn.textContent = '⛶'; btn.title = '전체화면'; }
  _editFsActive = false;
}

// 모달 닫을 때 상태 초기화
const _origCloseModal = window.closeModal;
window.closeModal = function(id) {
  if (id === 'edit-modal') {
    const modal = document.querySelector('#edit-modal .edit-modal');
    const wrap  = document.getElementById('edit-modal');
    if (modal) { modal.classList.remove('expanded','fullscreen'); }
    if (wrap)  { wrap.classList.remove('fs-mode'); }
    _editFsActive = false;
  }
  if (_origCloseModal) _origCloseModal(id);
};

window.openEditModal = function(id) {
  _editTargetId = id;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;

  document.getElementById('edit-modal-title').textContent = `편집 — ${t.name}`;
  document.getElementById('edit-no').value = t.no || '';
  document.getElementById('edit-name').value = t.name || '';
  // 유형 select 세팅 (동적 그룹)
  const _catEl = document.getElementById('edit-category');
  if (_catEl) {
    const _groups = window._territoryGroups || [];
    const _catVal = t.category || _groups[0] || '';
    // options가 아직 없으면 renderCategorySelects 먼저
    if (_catEl.options.length <= 1) renderCategorySelects();
    _catEl.value = _catVal;
    if (!_catEl.value && _catEl.options.length) _catEl.selectedIndex = 0;
  }

  // 호수 목록 로드
  _editUnits = JSON.parse(JSON.stringify(t.units || []));
  _editChangedRows = new Set();
  _editNewRows = new Set();
  renderUnitEditList();
  updateAddrChangeBar();

  // 엑셀 교체 초기화
  _replaceExcelData = null;
  document.getElementById('replace-upload-label').textContent = '클릭하여 새 엑셀 파일 선택';
  document.getElementById('replace-preview-wrap').style.display = 'none';
  document.getElementById('replace-btn').disabled = true;
  document.getElementById('replace-file-input').value = '';

  // 첫 탭 활성화
  document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.edit-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.edit-tab').classList.add('active');
  document.getElementById('edit-tab-info').classList.add('active');

  document.getElementById('edit-modal').classList.add('open');
};

function renderUnitEditList() {
  const html = _editUnits.map((u, i) => {
    const prev    = _editUnits[i-1];
    const sameAddr = prev && prev.road === u.road && prev.jibun === u.jibun;
    const sameBld  = sameAddr && prev.building === u.building;
    const changed  = _editChangedRows.has(i);
    const isNew    = _editNewRows.has(i);
    return `
    <div class="addr-tbl-row${isNew?' row-new':changed?' row-changed':''}" id="unit-row-${i}"
         ondragover="uDragOver(event,${i})" ondrop="uDrop(event,${i})" ondragend="uDragEnd(event)">
      <div class="addr-drag" draggable="true" ondragstart="uDragStart(event,${i})" title="드래그로 순서 변경">≡</div>
      <div class="addr-row-no">${i+1}</div>
      <div class="addr-cell${sameAddr?' inh':''}"><input type="text" value="${_escH(u.road)}" oninput="editUField(${i},'road',this.value)" placeholder="도로명"></div>
      <div class="addr-cell${sameAddr?' inh':''}"><input type="text" value="${_escH(u.jibun)}" oninput="editUField(${i},'jibun',this.value)" placeholder="번지"></div>
      <div class="addr-cell${sameBld?' inh':''}"><input type="text" value="${_escH(u.building)}" oninput="editUField(${i},'building',this.value)" placeholder="건물명"></div>
      <div class="addr-cell unit-cell"><input type="text" value="${_escH(u.unit)}" oninput="editUField(${i},'unit',this.value)" placeholder="세부주소"></div>
      <div class="addr-cell-chk"><input type="checkbox" title="동행필수"${u.escortRequired?' checked':''} onchange="editUField(${i},'escortRequired',this.checked)"></div>
      <div class="addr-row-acts">
        <button class="addr-act-btn ins" title="위에 행 삽입" onclick="insertUnitRowAt(${i})">+</button>
        <button class="addr-act-btn del" title="행 삭제" onclick="removeUnit(${i})">×</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('unit-edit-list').innerHTML = html || '<div style="color:#94A3B8;font-size:13px;text-align:center;padding:20px">호수가 없습니다 — 아래 버튼으로 추가하세요</div>';
}

// 필드 인라인 수정 (재렌더 없이 클래스만 업데이트)
window.editUField = function(i, field, value) {
  _editUnits[i][field] = value;
  if (!_editNewRows.has(i)) {
    _editChangedRows.add(i);
    const row = document.getElementById('unit-row-' + i);
    if (row) row.classList.add('row-changed');
  }
  updateAddrChangeBar();
};

// 변경 알림 바 업데이트
function updateAddrChangeBar() {
  const n = _editChangedRows.size + _editNewRows.size;
  const bar = document.getElementById('addr-change-bar');
  if (!bar) return;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const cnt = document.getElementById('addr-change-count');
  if (cnt) cnt.textContent = n;
}

// 행 삭제
window.removeUnit = function(idx) {
  const label = _editUnits[idx]?.unit || `${idx+1}번 행`;
  if (!confirm(`"${label}"을 삭제할까요?`)) return;
  _editUnits.splice(idx, 1);
  // 인덱스 shift
  const shiftSet = s => { const ns = new Set(); s.forEach(v => { if (v !== idx) ns.add(v > idx ? v-1 : v); }); return ns; };
  _editChangedRows = shiftSet(_editChangedRows);
  _editNewRows = shiftSet(_editNewRows);
  renderUnitEditList();
  updateAddrChangeBar();
};

// 특정 위치 위에 빈 행 삽입
window.insertUnitRowAt = function(i) {
  const ref = _editUnits[i] || _editUnits[i-1] || {};
  _editUnits.splice(i, 0, { idx: i, road: ref.road||'', jibun: ref.jibun||'', building: ref.building||'', unit: '', visitCode: null, visitedBy: null, visitedAt: null, escortRequired: false });
  // 인덱스 shift
  const shiftUp = s => { const ns = new Set(); s.forEach(v => ns.add(v >= i ? v+1 : v)); return ns; };
  _editChangedRows = shiftUp(_editChangedRows);
  _editNewRows = shiftUp(_editNewRows);
  _editNewRows.add(i);
  renderUnitEditList();
  updateAddrChangeBar();
  setTimeout(() => { const row = document.getElementById('unit-row-'+i); row?.querySelector('.unit-cell input')?.focus(); }, 40);
};

// 맨 아래 새 행 추가
window.appendUnitRow = function() {
  const last = _editUnits[_editUnits.length-1] || {};
  const i = _editUnits.length;
  _editUnits.push({ idx: i, road: last.road||'', jibun: last.jibun||'', building: last.building||'', unit: '', visitCode: null, visitedBy: null, visitedAt: null, escortRequired: false });
  _editNewRows.add(i);
  renderUnitEditList();
  updateAddrChangeBar();
  setTimeout(() => { const el = document.getElementById('unit-edit-list'); el.scrollTop = el.scrollHeight; document.getElementById('unit-row-'+i)?.querySelector('.unit-cell input')?.focus(); }, 40);
};

// 변경 되돌리기
window.revertUnitChanges = function() {
  if (!confirm('저장하지 않은 변경 사항을 모두 되돌릴까요?')) return;
  const t = window._territories.find(t => t.id === _editTargetId);
  if (t) _editUnits = JSON.parse(JSON.stringify(t.units || []));
  _editChangedRows = new Set(); _editNewRows = new Set();
  renderUnitEditList(); updateAddrChangeBar();
};

// 드래그 & 드롭 (행 순서 변경)
window.uDragStart = function(e, i) {
  _uDragSrc = i;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const r = document.getElementById('unit-row-'+i); if (r) r.style.opacity = '0.4'; }, 0);
};
window.uDragOver = function(e, i) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.addr-tbl-row').forEach((r, idx) => {
    r.style.borderTop = (idx === i && idx !== _uDragSrc) ? '2px solid #3B82F6' : '';
  });
};
window.uDrop = function(e, i) {
  e.preventDefault();
  if (_uDragSrc === null || _uDragSrc === i) { uDragEnd(e); return; }
  const moved = _editUnits.splice(_uDragSrc, 1)[0];
  const tgt = i > _uDragSrc ? i-1 : i;
  _editUnits.splice(tgt, 0, moved);
  _editChangedRows.add(tgt);
  _uDragSrc = null;
  renderUnitEditList(); updateAddrChangeBar();
};
window.uDragEnd = function() {
  _uDragSrc = null;
  document.querySelectorAll('.addr-tbl-row').forEach(r => { r.style.opacity=''; r.style.borderTop=''; });
};

window.saveUnits = async function() {
  const t = window._territories.find(t => t.id === _editTargetId);
  if (!t) return;
  _editUnits = _editUnits.map((u, i) => ({ ...u, idx: i }));
  try {
    await updateDoc(doc(db, 'territories', _editTargetId), {
      units: _editUnits, totalUnits: _editUnits.length
    });
    t.units = _editUnits; t.totalUnits = _editUnits.length;
    _editChangedRows = new Set(); _editNewRows = new Set();
    updateAddrChangeBar();
    closeModal('edit-modal');
    renderTerritoryTable(); updateTerritoryStats();
    alert(`저장 완료! (총 ${_editUnits.length}세대)`);
  } catch(e) { alert('저장 오류: ' + e.message); }
};

// Ctrl+S 저장 / Enter 다음 행 이동
document.addEventListener('keydown', function(e) {
  const modal = document.getElementById('edit-modal');
  if (!modal?.classList.contains('open')) return;
  if (!document.getElementById('edit-tab-units')?.classList.contains('active')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault(); saveUnits(); return;
  }
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') {
    e.preventDefault();
    const rows = [...document.querySelectorAll('#unit-edit-list .addr-tbl-row')];
    const row  = e.target.closest('.addr-tbl-row');
    const ri   = rows.indexOf(row);
    const cells = [...row.querySelectorAll('.addr-cell input[type=text]')];
    const ci   = cells.indexOf(e.target);
    const nextRow = rows[ri + 1];
    if (nextRow) { const ni = nextRow.querySelectorAll('.addr-cell input[type=text]'); if (ni[ci]) ni[ci].focus(); }
  }
});

window.saveBasicInfo = async function() {
  const no = document.getElementById('edit-no').value.trim().replace(/^0+/,'') || '0';
  const name = document.getElementById('edit-name').value.trim();
  const category = document.getElementById('edit-category').value;
  if (!no || !name) { alert('번호와 이름을 입력해 주세요.'); return; }
  try {
    await updateDoc(doc(db, 'territories', _editTargetId), { no, name, category });
    const t = window._territories.find(t => t.id === _editTargetId);
    if (t) { t.no = no; t.name = name; t.category = category; }
    closeModal('edit-modal');
    renderTerritoryTable();
    alert('기본정보 저장 완료!');
  } catch(e) { alert('저장 오류: ' + e.message); }
};

// 엑셀 교체
window.handleReplaceFile = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) { alert('데이터가 없습니다.'); return; }
      const rawRows = data.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
      let lastRoad='', lastJibun='', lastBuilding='';
      const rows = rawRows.map(r => {
        const rawRoad = String(r[0]||'').trim();
        const rawJibun = String(r[1]||'').trim();
        const rawBuilding = String(r[2]||'').trim();
        const road = rawRoad || lastRoad;
        const jibun = rawJibun || lastJibun;
        // 도로명 또는 번지가 바뀌면 이전 건물명 승계 금지
        const addrChanged = rawRoad !== '' || rawJibun !== '';
        const building = rawBuilding || (addrChanged ? '' : lastBuilding);
        const unit = String(r[3]||'').trim();
        lastRoad=road; lastJibun=jibun; lastBuilding=building;
        return [road, jibun, building, unit];
      }).filter(r => r[1] !== '' || r[3] !== '');

      _replaceExcelData = rows;
      document.getElementById('replace-upload-label').textContent = `${file.name} (${rows.length}세대)`;
      document.getElementById('replace-count').textContent = `총 ${rows.length}세대 감지됨`;

      const preview = rows.slice(0,5).map(r => `<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
      document.getElementById('replace-preview').innerHTML = `<table><tr><th>도로명</th><th>번지</th><th>건물명</th><th>호수</th></tr>${preview}</table>`;
      document.getElementById('replace-preview-wrap').style.display = 'block';
      document.getElementById('replace-btn').disabled = false;
    } catch(err) { alert('파일 읽기 오류: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
};

window.replaceWithExcel = async function() {
  if (!_replaceExcelData) return;
  const t = window._territories.find(t => t.id === _editTargetId);
  if (!confirm(`기존 ${t.totalUnits||0}세대를 새 데이터 ${_replaceExcelData.length}세대로 교체합니다.\n방문 기록은 유지됩니다. 계속하시겠습니까?`)) return;

  const newUnits = _replaceExcelData.map((r, i) => ({
    idx: i, road: r[0], jibun: r[1], building: r[2], unit: r[3],
    visitCode: null, visitedBy: null, visitedAt: null, escortRequired: false
  }));

  try {
    document.getElementById('replace-btn').textContent = '교체 중...';
    document.getElementById('replace-btn').disabled = true;
    await updateDoc(doc(db, 'territories', _editTargetId), {
      units: newUnits, totalUnits: newUnits.length
    });
    if (t) { t.units = newUnits; t.totalUnits = newUnits.length; }
    closeModal('edit-modal');
    renderTerritoryTable();
    updateTerritoryStats();
    alert(`✅ 교체 완료! 총 ${newUnits.length}세대로 업데이트됐습니다.`);
    document.getElementById('replace-btn').textContent = '엑셀로 전체 교체';
  } catch(e) {
    alert('교체 오류: ' + e.message);
    document.getElementById('replace-btn').textContent = '엑셀로 전체 교체';
    document.getElementById('replace-btn').disabled = false;
  }
};

// ════════════════════════════════
// 구역관리
// ════════════════════════════════
window._territories = [];
window._currentCategory = '전체';

// S-13 기록관리에서 사용하는 Firestore 업데이트 헬퍼
window._db_updateTerritory = async function(terId, data) {
  await updateDoc(doc(db, 'territories', terId), data);
};
window._currentCycle = '전체';
window._currentCompletionFilter = '전체';
window._currentSort = 'no'; // 정렬: no | old | recent | cycle | progress
window._assignTargetId = null;
window._excelData = null;

async function loadTerritories() {
  try {
    const q = query(collection(db, 'territories'), orderBy('lastAssignedDate', 'asc'));
    const snap = await getDocs(q);
    window._territories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTerritoryTable();
    updateTerritoryStats();
    renderOverdueList();
  } catch(e) {
    // 인덱스 없을 경우 기본 조회
    try {
      const snap2 = await getDocs(collection(db, 'territories'));
      window._territories = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTerritoryTable();
      updateTerritoryStats();
      renderOverdueList();
    } catch(e2) {
      document.getElementById('territory-table-wrap').innerHTML =
        '<div class="loading" style="color:#EF4444">데이터를 불러오는 중 오류가 발생했습니다.</div>';
    }
  }
}

function updateTerritoryStats() {
  const t = window._territories;
  document.getElementById('t-stat-total').textContent = t.length;
  document.getElementById('t-stat-active').textContent = t.filter(x => x.status === '진행중').length;
  document.getElementById('t-stat-done').textContent = t.filter(x => x.status === '완료').length;
  document.getElementById('t-stat-unassigned').textContent = t.filter(x => !x.assignedPublishers || x.assignedPublishers.length === 0).length;
}

window.filterTerritory = function(cat, el) {
  window._currentCategory = cat;
  document.querySelectorAll('#cat-tabs .terr-type-tab, #cat-tabs .cat-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  window.renderTerritoryTable();
};

window.filterCompletionStatus = function(status, el) {
  if (window._currentCompletionFilter === status) {
    window._currentCompletionFilter = '전체';
  } else {
    window._currentCompletionFilter = status;
  }
  window.renderTerritoryTable();
};

window.setTerrSort = function(v) {
  window._currentSort = v || 'no';
  window.renderTerritoryTable();
};

// ── 날짜 포맷 헬퍼 ──
function _fmtDT(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const yy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  const h=d.getHours(), ampm=h<12?'오전':'오후', h12=h===0?12:h>12?h-12:h;
  return `${yy}-${mm}-${dd} ${ampm} ${h12}시`;
}

// ── 뷰 전환 ──
window.setTerrView = function(view) {
  window._terrView = view;
  try { localStorage.setItem('terrView', view); } catch(e) {}
  document.getElementById('btn-view-list')?.classList.toggle('active', view==='list');
  document.getElementById('btn-view-card')?.classList.toggle('active', view==='card');
  window.renderTerritoryTable();
};

// ── 미니 카드 그리드 뷰 렌더 ──
function _renderTerrCardsNew(list, now) {
  const vMode = window._visitMode || '호별';
  const cards = list.map(t => {
    const isInactive = t.active === false;
    const cycle = t.cycle || 1;
    const cc = Math.min(cycle, 6);
    const numCls = isInactive ? 'nc-inactive' : `nc-${cc}`;
    const pct = t.completionRate || 0;
    const dtStr = _fmtDT(t.lastAssignedDate);
    const lastH = (t.cycleHistory || []).slice(-1)[0];
    const vm = (lastH && lastH.visitMode) ? lastH.visitMode : vMode;

    let badgeHtml = '';
    if (isInactive) {
      badgeHtml = `<div class="tc-mini-badge b-off">비활성</div>`;
    } else if (t.completionStatus === 'complete') {
      badgeHtml = `<div class="tc-mini-badge b-done">완료신청</div>`;
    } else if (t.completionStatus === 'incomplete') {
      badgeHtml = `<div class="tc-mini-badge b-inc">미완료</div>`;
    } else if (pct > 0) {
      badgeHtml = `<div class="tc-mini-badge b-pct">${pct}% 완료</div>`;
    }

    return `<div class="tc-mini" onclick="openTerritoryCard('${t.id}')">
  <div class="tc-mini-hd"><div class="tl-num ${numCls}" style="width:30px;height:30px;font-size:12px">${t.no}</div></div>
  <div class="tc-mini-body">
    <div class="tc-mini-type">${cycle}회차 ${vm}</div>
    <div class="tc-mini-dt">${dtStr}</div>
    ${badgeHtml}
  </div>
  <button class="tc-mini-dot" onclick="event.stopPropagation();openTerritoryCard('${t.id}')">•••</button>
</div>`;
  }).join('');
  return `<div class="tc-mini-grid">${cards}</div>`;
}

// ── 리스트 뷰 렌더 (⋮ → 카드 팝업) ──
function _renderTerrListNew(list, now) {
  const items = list.map(t => {
    const isInactive = t.active === false;
    let isOld = false;
    if (t.lastAssignedDate) {
      const lms = t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
      isOld = (now - lms) > 180*24*60*60*1000;
    } else { isOld = true; }
    const cycle = t.cycle || 1;
    const cc = Math.min(cycle, 6);
    const numCls = isInactive ? 'nc-inactive' : `nc-${cc}`;
    const rowCls = isInactive ? 'tl-inactive' : (isOld ? 'tl-old' : '');
    const pct = t.completionRate || 0;
    const dtStr = _fmtDT(t.lastAssignedDate);
    const cat = t.category || '';
    let badge = '';
    if (isInactive) {
      badge = `<span class="tl-badge-off">🔒 비활성</span>`;
    } else if (t.completionStatus === 'complete') {
      badge = `<span class="tl-badge-ok">🔔 완료신청</span>`;
    } else if (t.completionStatus === 'incomplete') {
      badge = `<span class="tl-badge-inc">⏸ 미완료</span>`;
    } else if (isOld) {
      badge = `<span class="tl-badge-old">⏰ 오래됨</span>`;
    } else if (pct > 0) {
      badge = `<span class="tl-badge-pct">${pct}%</span>`;
    }
    const metaSeq = cat
      ? `<span class="cycle-dot cd-${cc}"></span><span>${cycle}회차 · ${cat}</span>`
      : `<span class="cycle-dot cd-${cc}"></span><span>${cycle}회차</span>`;
    const groups = window._territoryGroups || [];
    const grpChips = groups.map(g => {
      const esc = g.replace(/'/g, '\\\'');
      return `<button class="tl-group-tag${g===cat?' active':''}" onclick="setTerritoryGroup('${t.id}','${esc}',this)">${g}</button>`;
    }).join('');
    return `<li class="tl-item ${rowCls}" id="tl-${t.id}">
  <div class="tl-num ${numCls}">${t.no}</div>
  <div class="tl-body">
    <div class="tl-name${isInactive?' inactive':''}">${t.name}</div>
    <div class="tl-meta">${metaSeq}<span>${dtStr}</span>${badge}</div>
  </div>
  <div class="tl-groups">${grpChips}</div>
  <div class="tl-right">
    <span class="tl-units">${t.totalUnits||'—'}</span>
    ${(t.assignedPublishers?.length > 0) && ['관리자','봉사감독자','구역의종'].includes(window._adminPermission||'') ? `<button class="tl-retrieve-btn" onclick="event.stopPropagation();openForceReturnModal('${t.id}')" title="강제 회수">🔙 회수</button>` : ''}
    <button class="tl-dot-btn" onclick="openTerritoryCard('${t.id}')">⋮</button>
  </div>
</li>`;
  }).join('');
  return `<ul class="tl-list">${items}</ul>`;
}

// ── 메인 렌더 함수 ──
window.renderTerritoryTable = function() {
  const cat    = window._currentCategory;
  const cmplt  = window._currentCompletionFilter || '전체';
  const sort   = window._currentSort || 'no';
  const rawKw  = (document.getElementById('terr-search')?.value || '').trim();
  const statusF= window._currentStatusFilter || 'all';
  const now    = Date.now();

  const allT = window._territories || [];
  const cReq = allT.filter(t => t.completionStatus === 'complete').length;
  const iReq = allT.filter(t => t.completionStatus === 'incomplete').length;
  const cEl  = document.getElementById('complete-req-count');
  const iEl  = document.getElementById('incomplete-req-count');
  if (cEl) cEl.textContent = cReq;
  if (iEl) iEl.textContent = iReq;
  const cBtn = document.getElementById('filter-complete-req');
  const iBtn = document.getElementById('filter-incomplete-req');
  if (cBtn) cBtn.classList.toggle('active', cmplt==='complete');
  if (iBtn) iBtn.classList.toggle('active', cmplt==='incomplete');

  let parsedCycle = null, kwRest = rawKw.toLowerCase();
  if (rawKw) {
    const mCyc = rawKw.match(/([1-6])\s*회\s*차?/);
    if (mCyc) { parsedCycle = parseInt(mCyc[1]); kwRest = kwRest.replace(mCyc[0].toLowerCase(),'').trim(); }
  }

  const list = allT.filter(t => {
    if (cat !== '전체' && t.category !== cat) return false;
    if (cmplt==='complete'   && t.completionStatus!=='complete')   return false;
    if (cmplt==='incomplete' && t.completionStatus!=='incomplete') return false;
    if (statusF==='active'   && t.active===false)  return false;
    if (statusF==='inactive' && t.active!==false)  return false;
    if (statusF==='진행중'   && t.status!=='진행중') return false;
    if (statusF==='완료'     && t.status!=='완료')   return false;
    if (statusF==='미배정'   && t.status!=='미배정') return false;
    if (parsedCycle!==null && (t.cycle||1)!==parsedCycle) return false;
    if (kwRest) {
      const noS = String(t.no||'').toLowerCase(), nmS = (t.name||'').toLowerCase();
      if (!noS.includes(kwRest) && !nmS.includes(kwRest)) return false;
    }
    return true;
  });

  const getMs = t => {
    if (!t.lastAssignedDate) return 0;
    return t.lastAssignedDate.toDate ? t.lastAssignedDate.toDate().getTime() : new Date(t.lastAssignedDate).getTime();
  };
  if (sort==='no')       list.sort((a,b) => (parseInt(a.no)||0)-(parseInt(b.no)||0));
  else if (sort==='old') list.sort((a,b) => getMs(a)-getMs(b));
  else if (sort==='recent') list.sort((a,b) => getMs(b)-getMs(a));
  else if (sort==='cycle')  list.sort((a,b) => (b.cycle||1)-(a.cycle||1)||(parseInt(a.no)||0)-(parseInt(b.no)||0));
  else if (sort==='progress') list.sort((a,b) => (b.completionRate||0)-(a.completionRate||0));

  const wrap = document.getElementById('territory-table-wrap');
  if (!wrap) return;
  if (!list.length) { wrap.innerHTML='<div class="loading">조건에 맞는 구역이 없습니다.</div>'; return; }

  const view = window._terrView || 'list';
  wrap.innerHTML = view === 'card' ? _renderTerrCardsNew(list, now) : _renderTerrListNew(list, now);
};

// ── 세대별 × 회차별 전도인 그리드 렌더링 ──
function _renderUnitVisitGrid(t) {
  const history = (t.cycleHistory || []).filter(h => h.unitVisits && Object.keys(h.unitVisits).length > 0);
  if (!history.length) return '';

  // 세대 코드 전체 수집 (순서 유지)
  const unitSet = new Set();
  history.forEach(h => Object.keys(h.unitVisits || {}).forEach(k => unitSet.add(k)));
  const units = [...unitSet].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  if (!units.length) return '';

  // 회차 헤더 (오래된 순)
  const cols = history.slice().sort((a, b) => (a.cycle||0) - (b.cycle||0));

  const thStyle = 'padding:5px 6px;text-align:center;border-bottom:1px solid #E2E8F0;border-right:1px solid #E2E8F0;font-weight:600;color:#475569;white-space:nowrap;font-size:11px;background:#F8FAFC';
  const tdStyle = 'padding:4px 5px;text-align:center;border-bottom:1px solid #F1F5F9;border-right:1px solid #F1F5F9;font-size:11px;color:#334155';
  const unitThStyle = 'padding:5px 6px;text-align:left;border-bottom:1px solid #E2E8F0;border-right:1px solid #E2E8F0;font-weight:600;color:#475569;white-space:nowrap;font-size:11px;background:#F8FAFC;position:sticky;left:0;z-index:1';
  const unitTdStyle = 'padding:4px 6px;text-align:left;border-bottom:1px solid #F1F5F9;border-right:1px solid #E2E8F0;font-size:11px;color:#64748B;white-space:nowrap;background:#FAFAFA;position:sticky;left:0;z-index:1';

  const headers = cols.map(h => `<th style="${thStyle}">${h.cycle}회차<br><span style="font-weight:400;color:#94A3B8">${(h.completedAt||'').slice(0,10)}</span></th>`).join('');

  const rows = units.map(code => {
    const cells = cols.map(h => {
      const v = (h.unitVisits || {})[code];
      const who = v?.by || '';
      const bg  = who ? '#EFF6FF' : '';
      const cl  = who ? '#1D4ED8' : '#CBD5E1';
      return `<td style="${tdStyle}background:${bg};color:${cl}">${who || '—'}</td>`;
    }).join('');
    return `<tr><td style="${unitTdStyle}">${code}</td>${cells}</tr>`;
  }).join('');

  return `
    <div style="border-top:1px solid #E2E8F0;padding-top:12px;margin-top:4px">
      <div style="font-size:12px;font-weight:600;color:#64748B;margin-bottom:8px">세대별 방문 기록</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;max-height:260px;overflow-y:auto">
        <table style="border-collapse:collapse;font-size:12px;min-width:100%">
          <thead><tr>
            <th style="${unitThStyle}">세대</th>
            ${headers}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── 구역 카드 팝업 ──
window._tcTargetId = null;

window.openTerritoryCard = function(id) {
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  window._tcTargetId = id;

  document.getElementById('tc-no-badge').textContent = t.no;
  document.getElementById('tc-no').value = t.no || '';
  document.getElementById('tc-name').value = t.name || '';
  // 개인구역 전도인 선택 목록 구성
  const pubSel = document.getElementById('tc-personal');
  const pubList = (window._publishers || [])
    .filter(p => p.approved)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  pubSel.innerHTML = '<option value="">— 전도인 선택 —</option>'
    + pubList.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  pubSel.value = t.personalAssignee || '';
  document.getElementById('tc-notice').value = t.territoryNotice || '';
  document.getElementById('tc-memo').value = t.memo || '';

  const groups = window._territoryGroups || [];
  const selected = t.category || '';
  document.getElementById('tc-groups').innerHTML = groups.map(g =>
    `<button class="tc-group-chip${g===selected?' selected':''}" onclick="selectTcGroup(this)" data-val="${g}">${g}</button>`
  ).join('');

  // ── 요약 방문 이력 (모든 회차)
  const history = t.cycleHistory || [];
  const tbody = document.getElementById('tc-history');
  if (history.length) {
    tbody.innerHTML = history.slice().reverse().map(h => {
      const vm = h.visitMode || '호별';
      const vmLabel = vm==='부재1' ? '호별+부재1' : vm==='부재2' ? '호별+부재2' : '호별';
      return `<tr>
        <td style="padding:5px 8px">${h.cycle}회차</td>
        <td style="padding:5px 8px">${vmLabel}</td>
        <td style="padding:5px 8px">${(h.assignedAt||'—').slice(0,10)}&nbsp;→&nbsp;${h.completedAt||'—'}</td>
        <td style="padding:5px 8px">${(h.publishers||[]).join(', ')||'—'}</td>
      </tr>`;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:10px;text-align:center;color:#94A3B8">방문 기록 없음</td></tr>';
  }

  // ── 세대별 × 회차별 전도인 그리드
  const gridEl = document.getElementById('tc-unit-grid');
  if (gridEl) gridEl.innerHTML = _renderUnitVisitGrid(t);

  const activeBtn = document.getElementById('tc-active-status');
  if (activeBtn) {
    const isInact = t.active === false;
    activeBtn.textContent = isInact ? '🔒 비활성화' : '✅ 활성화';
    activeBtn.style.background = isInact ? '#FEE2E2' : '#DCFCE7';
    activeBtn.style.color      = isInact ? '#991B1B' : '#166534';
    activeBtn.style.borderColor= isInact ? '#FECACA' : '#BBF7D0';
  }

  document.getElementById('terr-card-modal').classList.add('open');
};

window.setTerritoryGroup = async function(id, group, el) {
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const row = el.closest('.tl-item');
  if (row) {
    row.querySelectorAll('.tl-group-tag').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }
  try {
    await updateDoc(doc(db, 'territories', id), { category: group });
    t.category = group;
  } catch(e) {
    alert('저장 오류: ' + e.message);
    window.renderTerritoryTable();
  }
};

window.selectTcGroup = function(el) {
  document.querySelectorAll('#tc-groups .tc-group-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
};

window.saveTerritoryCard = async function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const name = document.getElementById('tc-name').value.trim();
  if (!name) { alert('구역이름을 입력해주세요.'); return; }
  const category = document.querySelector('#tc-groups .tc-group-chip.selected')?.dataset.val || t.category || '';
  const personalAssignee = document.getElementById('tc-personal').value.trim();
  const territoryNotice  = document.getElementById('tc-notice').value.trim();
  const memo             = document.getElementById('tc-memo').value.trim();

  // 개인구역 담당자가 새로 지정되거나 변경된 경우 배정일 자동 기록
  const prevAssignee = t.personalAssignee || '';
  let personalAssignedDate = t.personalAssignedDate || '';
  if (personalAssignee && personalAssignee !== prevAssignee) {
    personalAssignedDate = new Date().toISOString().slice(0, 10);
  } else if (!personalAssignee) {
    personalAssignedDate = '';
  }

  // 담당자가 지정되면 카테고리를 '개인 구역'으로 자동 설정
  const finalCategory = personalAssignee ? '개인 구역' : category;
  // 카드 UI 그룹 칩도 동기화
  if (personalAssignee) {
    document.querySelectorAll('#tc-groups .tc-group-chip').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.val === '개인 구역');
    });
  }

  try {
    await updateDoc(doc(db, 'territories', id), { name, category: finalCategory, personalAssignee, personalAssignedDate, territoryNotice, memo });
    t.name = name; t.category = finalCategory;
    t.personalAssignee = personalAssignee;
    t.personalAssignedDate = personalAssignedDate;
    t.territoryNotice = territoryNotice;
    t.memo = memo;
    closeModal('terr-card-modal');
    window.renderTerritoryTable();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.saveTerritoryCardNo = async function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const no = document.getElementById('tc-no').value.trim().replace(/^0+/,'') || '0';
  if (window._territories.find(x => x.no === no && x.id !== id)) {
    alert(`구역번호 ${no}는 이미 존재합니다.`); return;
  }
  try {
    await updateDoc(doc(db, 'territories', id), { no });
    t.no = no;
    document.getElementById('tc-no-badge').textContent = no;
    window.renderTerritoryTable();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.deleteTerritoryFromCard = function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  closeModal('terr-card-modal');
  deleteTerritory(id, t.name);
};

window.completeTerritoryFromCard = function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  closeModal('terr-card-modal');
  completeTerritory(id, t.name);
};

window.incompleteTerritoryFromCard = function() {
  const id = window._tcTargetId;
  closeModal('terr-card-modal');
  incompleteTerritory(id);
};

window.previewTerritoryFromCard = function() {
  const id = window._tcTargetId;
  // 미리보기는 새 탭에서 열리므로 구역 카드 팝업은 그대로 둠 → 돌아왔을 때 어떤 카드였는지 바로 보임
  previewTerritory(id);
};

window.openAssignModalFromCard = function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  window._returnToCardId = id;  // 닫힐 때 자동 복귀
  closeModal('terr-card-modal');
  openAssignModal(id, t.name, t.no);
};

window.openEditModalFromCard = function() {
  const id = window._tcTargetId;
  if (!id) return;
  window._returnToCardId = id;  // 닫힐 때 자동 복귀
  closeModal('terr-card-modal');
  openEditModal(id);
};

window.deleteLastVisitFromCard = async function() {
  const id = window._tcTargetId;
  const t = window._territories.find(t => t.id === id);
  if (!t) return;
  const hist = t.cycleHistory || [];
  if (!hist.length) { alert('삭제할 방문 기록이 없습니다.'); return; }
  if (!confirm('가장 최근 방문 기록 1건을 삭제하시겠습니까?')) return;
  const newHist = hist.slice(0, -1);
  try {
    await updateDoc(doc(db, 'territories', id), { cycleHistory: newHist });
    t.cycleHistory = newHist;
    openTerritoryCard(id);
  } catch(e) { alert('삭제 오류: ' + e.message); }
};

// 구역 추가 모달
window.openTerritoryModal = function() {
  document.getElementById('t-no').value = '';
  document.getElementById('t-name').value = '';
  document.getElementById('t-units').value = '';
  document.getElementById('territory-modal').classList.add('open');
  setTimeout(() => document.getElementById('t-no').focus(), 100);
};

window.addTerritory = async function() {
  const no = document.getElementById('t-no').value.trim().replace(/^0+/,'') || '0'; // 앞 0 제거, 순수 숫자
  const name = document.getElementById('t-name').value.trim();
  const category = document.getElementById('t-category').value;
  const units = parseInt(document.getElementById('t-units').value) || 0;
  if (!no || !name) { alert('구역 번호와 이름을 입력해 주세요.'); return; }
  if (window._territories.find(t => t.no === no)) { alert(`구역 번호 ${no}는 이미 존재합니다.`); return; }
  try {
    const docRef = await addDoc(collection(db, 'territories'), {
      no, name, category, totalUnits: units,
      assignedPublishers: [], status: '미배정',
      completionRate: 0, cycle: 1,
      lastAssignedDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      units: []
    });
    window._territories.push({ id: docRef.id, no, name, category, totalUnits: units, assignedPublishers: [], status: '미배정', completionRate: 0, cycle: 1, units: [] });
    closeModal('territory-modal');
    renderTerritoryTable();
    updateTerritoryStats();
  } catch(e) { alert('저장 중 오류가 발생했습니다: ' + e.message); }
};

// 엑셀 업로드
window.openUploadModal = function() {
  const $ = id => document.getElementById(id);
  $('u-no').value = '';
  $('u-name').value = '';
  $('excel-preview-wrap').style.display = 'none';
  $('upload-label').textContent = '클릭하여 엑셀 파일 선택';
  $('upload-btn').disabled = true;
  $('excel-count').textContent = '';
  $('file-input').value = '';
  const autoBox = $('auto-extract-box'); if (autoBox) autoBox.style.display = 'none';
  window._excelData = null;

  // 카테고리 select가 비어있거나 '로딩 중...'이면 강제로 다시 채움
  // (window.renderCategorySelects로 접근해야 module 스코프에서 일반 script 함수 호출 가능)
  const sel = $('u-category');
  const needsReload = sel && (sel.options.length === 0
                      || (sel.options.length === 1 && /로딩/.test(sel.options[0].text)));
  if (needsReload) {
    try {
      if (typeof window.renderCategorySelects === 'function') window.renderCategorySelects();
      else {
        // 전역 함수 직접 호출 (module 밖)
        const grps = window._territoryGroups || [];
        if (grps.length) {
          sel.innerHTML = grps.map(g => `<option value="${g}">${g}</option>`).join('');
        } else {
          sel.innerHTML = '<option value="">그룹 없음 - 설정에서 추가 필요</option>';
        }
      }
    } catch(e) { console.warn('[category 재로드 실패]', e); }
  }

  $('upload-modal').classList.add('open');
};

// 파일명에서 구역번호/이름 자동 추출
//   "636번구역.xlsx"        → {no:"636", name:""}
//   "636_에이스5단지.xlsx"   → {no:"636", name:"에이스5단지"}
//   "636 에이스단지.xlsx"    → {no:"636", name:"에이스단지"}
//   "636번 에이스5,4단지.xlsx"→ {no:"636", name:"에이스5,4단지"}
//   "에이스단지.xlsx"         → {no:"", name:"에이스단지"}
function _parseFilename(fname) {
  const base = String(fname || '').replace(/\.(xlsx|xlsm|xls)$/i, '').trim();
  // 숫자+"번구역"+나머지
  let m = base.match(/^(\d+)\s*번\s*구역\s*[_\-·]*\s*(.*)$/);
  if (m) return { no: m[1], name: (m[2] || '').trim() };
  // 숫자+"번"+나머지
  m = base.match(/^(\d+)\s*번\s*[_\-·]*\s*(.*)$/);
  if (m) return { no: m[1], name: (m[2] || '').trim() };
  // 숫자+구분자+나머지  (예: "636_에이스", "636 에이스", "636-에이스")
  m = base.match(/^(\d+)\s*[_\-·\s]+\s*(.+)$/);
  if (m) return { no: m[1], name: m[2].trim() };
  // 숫자만
  m = base.match(/^(\d+)$/);
  if (m) return { no: m[1], name: '' };
  return { no: '', name: base };
}

// 엑셀 시트에서 메타 영역(구역번호/구역이름) + 헤더 행 위치 자동 탐지
function _parseSheetMeta(all2D) {
  let meta = { no: '', name: '' };
  let headerRow = -1;
  const limit = Math.min(all2D.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = all2D[i] || [];
    const c0 = String(row[0] || '').trim();
    const c1 = String(row[1] || '').trim();
    // 헤더 행: "도로명"이 포함된 셀이 있는 행
    if (row.some(c => /도로명/.test(String(c || '')))) { headerRow = i; break; }
    // 메타: "구역번호" / "번호" / "NO"
    if (!meta.no && c1 && /^(구역\s*)?(번호|no)\s*[:：]?$/i.test(c0)) {
      meta.no = c1.replace(/[^0-9]/g, '');
    }
    // 메타: "구역이름" / "이름" / "NAME" / "구역명"
    if (!meta.name && c1 && /^(구역\s*)?(이름|명|name)\s*[:：]?$/i.test(c0)) {
      meta.name = c1;
    }
  }
  return { meta, headerRow };
}

window.handleExcelFile = function(input) {
  const file = input.files[0];
  if (!file) return;
  console.log('[엑셀 선택]', file.name, file.size, 'bytes');

  // 파일 크기 방어
  if (file.size > 10 * 1024 * 1024) {
    alert('파일이 너무 큽니다 (10MB 초과). 더 작은 파일로 시도해 주세요.');
    input.value = ''; return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      if (typeof XLSX === 'undefined') {
        throw new Error('엑셀 파서(XLSX)가 로드되지 않았습니다. 페이지를 새로고침해 주세요.');
      }
      const wb = XLSX.read(e.target.result, { type: 'array' });
      if (!wb.SheetNames.length) throw new Error('시트가 없습니다.');
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      console.log('[엑셀 원본 파싱]', all2D.length, '행');

      if (!all2D.length) throw new Error('빈 시트입니다.');

      // 1) 메타 영역과 헤더 행 탐지
      const { meta, headerRow } = _parseSheetMeta(all2D);
      console.log('[메타 감지]', meta, 'headerRow=', headerRow);

      // 헤더 행을 못 찾으면 첫 행이 헤더라고 가정
      const hRow = (headerRow >= 0) ? headerRow : 0;
      const dataStart = hRow + 1;

      // 2) 헤더 분석: 각 컬럼이 무엇인지 인덱스로 매핑
      const headerCells = (all2D[hRow] || []).map(c => String(c || '').trim());
      const findCol = (patterns) => {
        for (let i = 0; i < headerCells.length; i++) {
          if (patterns.some(p => p.test(headerCells[i]))) return i;
        }
        return -1;
      };
      const colMap = {
        road:     findCol([/도로명/]),
        jibun:    findCol([/번지/]),
        building: findCol([/건물명|단지/]),
        unit:     findCol([/세부주소|호수|호$/]),
        ban:      findCol([/금지|방문금지|거절/]),
        memo:     findCol([/메모|비고/])
      };
      // 열 인덱스가 하나도 없으면 기본 0~5 가정
      if (colMap.road === -1 && colMap.unit === -1) {
        colMap.road = 0; colMap.jibun = 1; colMap.building = 2;
        colMap.unit = 3; colMap.ban = 4; colMap.memo = 5;
      }
      console.log('[헤더 컬럼 매핑]', colMap);

      // 3) 데이터 행 추출 및 상속 처리
      const rawRows = all2D.slice(dataStart).filter(r => r.some(c => String(c || '').trim() !== ''));
      let lastRoad = '', lastJibun = '', lastBuilding = '';
      const rows = rawRows.map(r => {
        const g = (idx) => (idx >= 0 && idx < r.length) ? String(r[idx] || '').trim() : '';
        const rawRoad    = g(colMap.road);
        const rawJibun   = g(colMap.jibun);
        const rawBuilding = g(colMap.building);
        const road    = rawRoad    || lastRoad;
        const jibun   = rawJibun   || lastJibun;
        // 도로명 또는 번지가 바뀌면 이전 건물명 승계 금지
        const addrChanged = rawRoad !== '' || rawJibun !== '';
        const building = rawBuilding || (addrChanged ? '' : lastBuilding);
        const unit    = g(colMap.unit);
        const banRaw  = g(colMap.ban).toUpperCase();
        const ban     = (banRaw === 'Y' || banRaw === 'YES' || banRaw === '1' || banRaw === 'TRUE' || banRaw === 'O' || banRaw === '금지' || banRaw === '거절');
        const memo    = g(colMap.memo);
        lastRoad = road; lastJibun = jibun; lastBuilding = building;
        return [road, jibun, building, unit, ban, memo];
      }).filter(r => r[1] !== '' || r[3] !== '');  // 번지 또는 세부주소 중 하나만 있어도 유효 (격지 단독주택 지원)

      if (!rows.length) {
        throw new Error('유효한 세대 데이터를 찾지 못했습니다. 도로명/번지 또는 호수가 있는지 헤더와 데이터를 확인해 주세요.');
      }
      console.log('[최종 파싱된 세대 수]', rows.length);

      // 4) 파일명에서도 번호/이름 추출 (메타가 없을 때 보조)
      const fromFile = _parseFilename(file.name);
      const finalNo   = meta.no   || fromFile.no   || '';
      const finalName = meta.name || fromFile.name || '';
      console.log('[구역정보 최종]', { finalNo, finalName, fromFile, fromMeta: meta });

      // 5) 상태 저장
      window._excelData = { rows, source: { filename: file.name, meta, fromFile } };

      // 6) UI 자동 채움
      const $ = id => document.getElementById(id);
      const nEl = $('u-no'); const nmEl = $('u-name');
      if (finalNo && !nEl.value) nEl.value = finalNo;
      if (finalName && !nmEl.value) nmEl.value = finalName;

      // 7) 미리보기 + 자동추출 박스
      const banCnt  = rows.filter(r => r[4]).length;
      const memoCnt = rows.filter(r => r[5]).length;
      $('upload-label').textContent = `✓ ${file.name} (${rows.length}세대)`;
      $('excel-count').textContent =
        `총 ${rows.length}세대 · 거절 자동체크 ${banCnt}건 · 관리자 메모 ${memoCnt}건`;

      const autoBox = $('auto-extract-box');
      const autoDetail = $('auto-extract-detail');
      if (autoBox && autoDetail) {
        const parts = [];
        if (finalNo)   parts.push(`<strong>구역번호:</strong> ${finalNo}`);
        if (finalName) parts.push(`<strong>구역이름:</strong> ${finalName}`);
        if (parts.length) {
          autoDetail.innerHTML = parts.join(' · ') +
            `<div style="font-size:11px;color:#64748B;margin-top:2px">${meta.no||meta.name ? '엑셀 내부 메타에서 추출' : '파일명에서 추출'}</div>`;
          autoBox.style.display = 'block';
        } else {
          autoBox.style.display = 'none';
        }
      }

      // 미리보기 테이블
      const H = ['도로명','번지','건물명','세부주소','금지','메모'];
      const escHtml = v => String(v||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      const preview = rows.slice(0, 5).map(r => {
        const cells = [
          escHtml(r[0]), escHtml(r[1]), escHtml(r[2]), escHtml(r[3]),
          r[4] ? '<span style="color:#991B1B;font-weight:600">Y</span>' : '',
          r[5] ? `<span style="color:#64748B" title="${escHtml(r[5])}">${escHtml(String(r[5]).slice(0,18))}${r[5].length>18?'…':''}</span>` : ''
        ];
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      }).join('');
      $('excel-preview').innerHTML = `
        <table>
          <tr>${H.map(h => `<th>${h}</th>`).join('')}</tr>
          ${preview}
        </table>`;
      $('excel-preview-wrap').style.display = 'block';
      $('upload-btn').disabled = false;
    } catch(err) {
      console.error('[엑셀 파싱 오류]', err);
      alert('엑셀 파싱 중 오류가 발생했습니다.\n\n' + (err.message || err) +
            '\n\n• 파일 형식이 .xlsx인지 확인해 주세요.\n' +
            '• 헤더에 "도로명/번지/건물명/세부주소/금지/메모" 열이 있는지 확인해 주세요.\n' +
            '• F12 콘솔에서 상세 로그 확인 가능합니다.');
      document.getElementById('upload-btn').disabled = true;
    }
  };
  reader.onerror = function(e) {
    console.error('[파일 읽기 실패]', e);
    alert('파일을 읽을 수 없습니다. 다른 파일로 시도해 주세요.');
  };
  reader.readAsArrayBuffer(file);
};

window.uploadTerritory = async function() {
  const $ = id => document.getElementById(id);
  const btn = $('upload-btn');
  const noRaw = ($('u-no')?.value || '').trim();
  const no    = noRaw.replace(/^0+/,'') || '0';
  const name  = ($('u-name')?.value || '').trim();

  // 카테고리 fallback: '로딩 중...' 이거나 빈 값이면 첫 번째 그룹 자동 사용
  let category = ($('u-category')?.value || '').trim();
  if (!category || category === '로딩 중...') {
    const grps = window._territoryGroups || [];
    if (grps.length) {
      category = grps[0];
      console.warn('[카테고리 fallback]', category);
    }
  }

  console.log('[업로드 시작]', { no, name, category, rows: window._excelData?.rows?.length });

  // 입력값 검증
  if (!noRaw) { alert('구역 번호를 입력해 주세요.'); return; }
  if (!name)  { alert('구역 이름을 입력해 주세요.'); return; }
  if (!category) {
    alert('유형(그룹)이 설정되지 않았습니다.\n\n설정 탭에서 구역 그룹을 먼저 추가해 주세요.');
    return;
  }
  if (!window._excelData || !window._excelData.rows?.length) {
    alert('엑셀 파일을 먼저 선택해 주세요.'); return;
  }
  if ((window._territories || []).find(t => String(t.no) === String(no))) {
    alert(`구역 번호 ${no}는 이미 존재합니다.\n다른 번호를 사용하거나 기존 구역을 먼저 삭제해 주세요.`);
    return;
  }

  // Firestore 연결 확인
  if (typeof db === 'undefined' || !db) {
    alert('데이터베이스 연결이 준비되지 않았습니다.\n페이지를 새로고침한 후 다시 시도해 주세요.');
    console.error('[DB 미정의]', typeof db);
    return;
  }

  const { rows } = window._excelData;
  const units = rows.map((r, i) => ({
    idx: i,
    road: r[0] || '', jibun: r[1] || '',
    building: r[2] || '', unit: String(r[3] || ''),
    visitCode: null, visitedBy: null, visitedAt: null,
    escortRequired: false
  }));

  // 금지(Y) → visitMap에 'refuse' 자동 체크
  const nowIso = new Date().toISOString();
  const visitMap = {};
  rows.forEach((r, i) => {
    if (r[4]) visitMap[i] = { code: 'refuse', by: '', at: nowIso };
  });

  // 메모가 있는 행 수집
  const memoRows = rows
    .map((r, i) => ({ i, unit: String(r[3]||''), building: String(r[2]||''), memo: String(r[5]||'').trim() }))
    .filter(x => x.memo);

  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    // 1) 구역카드 생성
    console.log('[1/3] territories 문서 생성 중...');
    const docRef = await addDoc(collection(db, 'territories'), {
      no, name, category,
      totalUnits: units.length,
      assignedPublishers: [],
      status: '미배정',
      completionRate: 0,
      cycle: 1,
      lastAssignedDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      units,
      visitMap
    });
    console.log('[1/3] ✓ 구역카드 생성 완료', docRef.id);

    // 2) 메모 저장 (실패해도 구역카드는 유지)
    if (memoRows.length) {
      btn.textContent = `메모 저장 중 (0/${memoRows.length})...`;
      console.log('[2/3] 관리자 메모 저장 중... 총', memoRows.length, '건');
      let savedMemos = 0;
      for (const m of memoRows) {
        try {
          const label = m.building ? `${m.building} ${m.unit}호` : `${m.unit}호`;
          await addDoc(collection(db, 'memos'), {
            territoryId: docRef.id,
            territoryNo: no,
            territoryName: name,
            unit: m.unit,
            unitIdx: m.i,
            building: m.building,
            content: `[${label}] ${m.memo}`,
            category: 'general',
            submittedBy: '엑셀업로드',
            submittedAt: serverTimestamp(),
            type: 'admin',
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: '엑셀업로드'
          });
          savedMemos++;
          btn.textContent = `메모 저장 중 (${savedMemos}/${memoRows.length})...`;
        } catch(memErr) {
          console.warn('[메모 저장 실패] idx=', m.i, memErr);
        }
      }
      console.log('[2/3] ✓ 메모 저장 완료', savedMemos, '/', memoRows.length);
    }

    // 3) 로컬 상태 갱신
    console.log('[3/3] 로컬 상태 갱신...');
    window._territories = window._territories || [];
    window._territories.push({
      id: docRef.id, no, name, category,
      totalUnits: units.length,
      assignedPublishers: [],
      status: '미배정',
      completionRate: 0,
      cycle: 1,
      units, visitMap
    });

    // 완료 메시지
    const banCnt = Object.keys(visitMap).length;
    const memoCnt = memoRows.length;
    let msg = `✅ 구역 ${no}번 "${name}" 생성 완료!\n\n세대 ${units.length}호`;
    if (banCnt)  msg += ` · 거절 자동체크 ${banCnt}건`;
    if (memoCnt) msg += ` · 관리자 메모 ${memoCnt}건`;
    alert(msg);

    closeModal('upload-modal');
    try { renderTerritoryTable(); } catch(e) { console.warn(e); }
    try { updateTerritoryStats(); } catch(e) { console.warn(e); }
    try { if (typeof renderCatTabs === 'function') renderCatTabs(); } catch(e) {}
    btn.textContent = '구역카드 생성';

  } catch(e) {
    console.error('[구역카드 저장 실패]', e);
    let hint = '';
    const msg = String(e.message || e);
    if (/permission|Missing or insufficient|unauthenticated/i.test(msg)) {
      hint = '\n\n💡 해결방법:\n  ① 관리자 권한으로 로그인되어 있는지 확인\n  ② Firestore 보안 규칙이 쓰기를 허용하는지 확인';
    } else if (/network|offline|unavailable/i.test(msg)) {
      hint = '\n\n💡 네트워크 연결을 확인해 주세요.';
    } else if (/quota|exceed/i.test(msg)) {
      hint = '\n\n💡 Firestore 할당량이 초과되었을 수 있습니다.';
    } else if (/invalid.*argument|invalid-argument/i.test(msg)) {
      hint = '\n\n💡 데이터 형식이 잘못되었습니다. 엑셀 파일을 다시 확인해 주세요.';
    }
    alert('저장 중 오류 발생:\n\n' + msg + hint + '\n\n(F12 콘솔에서 상세 로그 확인)');
    btn.textContent = '구역카드 생성';
    btn.disabled = false;
  }
};


// ════════════════════════════════════════════════════════════
// 일괄 업로드 (다중 파일 / ZIP 지원)
// ════════════════════════════════════════════════════════════
window._batchData = []; // [{filename, no, name, rows, banCnt, memoCnt, status, error}]

window.openBatchUploadModal = function() {
  const $ = id => document.getElementById(id);
  $('batch-file-input').value = '';
  $('batch-upload-label').textContent = '엑셀 파일들 또는 ZIP을 선택 (다중 선택 가능)';
  $('bu-file-count').value = '0개';
  $('batch-preview-wrap').style.display = 'none';
  $('batch-preview-tbody').innerHTML = '';
  $('batch-summary').textContent = '';
  $('batch-progress-wrap').style.display = 'none';
  $('batch-upload-btn').disabled = true;
  $('batch-upload-btn').textContent = '일괄 생성';
  window._batchData = [];

  // 카테고리 select 채우기
  const sel = $('bu-category');
  const grps = window._territoryGroups || [];
  if (grps.length) {
    sel.innerHTML = grps.map(g => `<option value="${g}">${g}</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">그룹 없음 - 설정에서 추가 필요</option>';
  }

  $('batch-upload-modal').classList.add('open');
};

// 파일들을 받아서 (xlsx 직접 또는 zip 풀어서) ArrayBuffer 배열로 반환
async function _collectExcelFiles(fileList) {
  const out = []; // [{name, buf}]
  for (const f of fileList) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      if (typeof JSZip === 'undefined') {
        throw new Error('ZIP 라이브러리(JSZip)가 로드되지 않았습니다. 페이지를 새로고침해 주세요.');
      }
      const zipBuf = await f.arrayBuffer();
      const zip = await JSZip.loadAsync(zipBuf);
      const entries = Object.values(zip.files);
      for (const e of entries) {
        if (e.dir) continue;
        const en = e.name.toLowerCase();
        // macOS .DS_Store, __MACOSX/ 폴더, 임시파일 제외
        if (en.startsWith('__macosx/') || en.endsWith('.ds_store') || en.includes('/.~') || en.split('/').pop().startsWith('~$')) continue;
        if (!(en.endsWith('.xlsx') || en.endsWith('.xls'))) continue;
        const buf = await e.async('arraybuffer');
        // 압축 내부 경로에서 파일명만 추출
        const baseName = e.name.split('/').pop();
        out.push({ name: baseName, buf });
      }
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const buf = await f.arrayBuffer();
      out.push({ name: f.name, buf });
    }
  }
  return out;
}

// 단일 ArrayBuffer를 파싱해서 batchData 항목으로 변환
function _parseOneExcelToBatchItem(filename, arrayBuf) {
  if (typeof XLSX === 'undefined') throw new Error('XLSX 라이브러리 미로드');
  const wb = XLSX.read(arrayBuf, { type: 'array' });
  if (!wb.SheetNames.length) throw new Error('시트 없음');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!all2D.length) throw new Error('빈 시트');

  // 메타 + 헤더 위치 탐지 (handleExcelFile과 동일 로직)
  const { meta, headerRow } = _parseSheetMeta(all2D);
  const hRow = (headerRow >= 0) ? headerRow : 0;
  const dataStart = hRow + 1;

  const headerCells = (all2D[hRow] || []).map(c => String(c || '').trim());
  const findCol = (patterns) => {
    for (let i = 0; i < headerCells.length; i++) {
      if (patterns.some(p => p.test(headerCells[i]))) return i;
    }
    return -1;
  };
  const colMap = {
    road:     findCol([/도로명/]),
    jibun:    findCol([/번지/]),
    building: findCol([/건물명|단지/]),
    unit:     findCol([/세부주소|호수|호$/]),
    ban:      findCol([/금지|방문금지|거절/]),
    memo:     findCol([/메모|비고/])
  };
  if (colMap.road === -1 && colMap.unit === -1) {
    colMap.road = 0; colMap.jibun = 1; colMap.building = 2;
    colMap.unit = 3; colMap.ban = 4; colMap.memo = 5;
  }

  const rawRows = all2D.slice(dataStart).filter(r => r.some(c => String(c || '').trim() !== ''));
  let lastRoad = '', lastJibun = '', lastBuilding = '';
  const rows = rawRows.map(r => {
    const g = (idx) => (idx >= 0 && idx < r.length) ? String(r[idx] || '').trim() : '';
    const rawRoad    = g(colMap.road);
    const rawJibun   = g(colMap.jibun);
    const rawBuilding = g(colMap.building);
    const road    = rawRoad    || lastRoad;
    const jibun   = rawJibun   || lastJibun;
    // 도로명 또는 번지가 바뀌면 이전 건물명 승계 금지
    const addrChanged = rawRoad !== '' || rawJibun !== '';
    const building = rawBuilding || (addrChanged ? '' : lastBuilding);
    const unit    = g(colMap.unit);
    const banRaw  = g(colMap.ban).toUpperCase();
    const ban     = (banRaw === 'Y' || banRaw === 'YES' || banRaw === '1' || banRaw === 'TRUE' || banRaw === 'O' || banRaw === '금지' || banRaw === '거절');
    const memo    = g(colMap.memo);
    lastRoad = road; lastJibun = jibun; lastBuilding = building;
    return [road, jibun, building, unit, ban, memo];
  }).filter(r => r[1] !== '' || r[3] !== '');

  if (!rows.length) throw new Error('유효한 세대 데이터 없음');

  const fromFile = _parseFilename(filename);
  return {
    filename,
    no:   meta.no   || fromFile.no   || '',
    name: meta.name || fromFile.name || '',
    rows,
    banCnt:  rows.filter(r => r[4]).length,
    memoCnt: rows.filter(r => r[5]).length,
    status: 'pending', // pending | skip-conflict | skip-noname | skip-nono | success | error
    error: ''
  };
}

window.handleBatchFiles = async function(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const $ = id => document.getElementById(id);
  $('batch-upload-label').textContent = `📦 처리 중... (${files.length}개 파일)`;
  console.log('[일괄] 파일 선택', files.map(f => f.name));

  try {
    // 1) 압축 풀고 .xlsx 모두 수집
    const excelFiles = await _collectExcelFiles(files);
    console.log('[일괄] 추출된 엑셀:', excelFiles.length);
    if (!excelFiles.length) {
      alert('선택한 파일에 .xlsx 파일이 없습니다.');
      $('batch-upload-label').textContent = '엑셀 파일들 또는 ZIP을 선택 (다중 선택 가능)';
      return;
    }

    // 2) 각 파일 파싱
    const batchData = [];
    for (const ef of excelFiles) {
      try {
        const item = _parseOneExcelToBatchItem(ef.name, ef.buf);
        batchData.push(item);
      } catch(err) {
        console.warn('[일괄] 파싱 실패:', ef.name, err);
        batchData.push({
          filename: ef.name, no: '', name: '', rows: [],
          banCnt: 0, memoCnt: 0,
          status: 'error', error: err.message || String(err)
        });
      }
    }

    // 3) 충돌/누락 마킹
    const existingNos = new Set((window._territories || []).map(t => String(t.no)));
    const seenNos = new Set();
    for (const it of batchData) {
      if (it.status === 'error') continue;
      if (!it.no) {
        it.status = 'skip-nono';
        it.error = '구역번호 누락';
        continue;
      }
      if (existingNos.has(String(it.no))) {
        it.status = 'skip-conflict';
        it.error = '이미 존재하는 번호';
        continue;
      }
      if (seenNos.has(String(it.no))) {
        it.status = 'skip-conflict';
        it.error = '같은 번호 중복';
        continue;
      }
      seenNos.add(String(it.no));
      // 이름 누락은 경고만, 사용자가 표에서 수정 가능
      if (!it.name) it.status = 'pending-noname';
    }

    window._batchData = batchData;
    $('bu-file-count').value = `${batchData.length}개`;
    $('batch-upload-label').textContent = `✓ ${batchData.length}개 파일 분석 완료`;
    _renderBatchPreview();
    $('batch-preview-wrap').style.display = 'block';
    _updateBatchUploadBtn();
  } catch(err) {
    console.error('[일괄] 오류:', err);
    alert('일괄 처리 중 오류:\n\n' + (err.message || err));
    $('batch-upload-label').textContent = '엑셀 파일들 또는 ZIP을 선택 (다중 선택 가능)';
  }
};

function _renderBatchPreview() {
  const data = window._batchData || [];
  const tbody = document.getElementById('batch-preview-tbody');
  if (!tbody) return;

  const statusBadge = (it) => {
    if (it.status === 'error')          return `<span style="color:#991B1B;font-weight:600">❌ 파싱실패</span><div style="font-size:10px;color:#64748B">${it.error}</div>`;
    if (it.status === 'skip-conflict')  return `<span style="color:#92400E;font-weight:600">⏭ 건너뜀</span><div style="font-size:10px;color:#64748B">${it.error}</div>`;
    if (it.status === 'skip-nono')      return `<span style="color:#991B1B;font-weight:600">❌ 번호없음</span><div style="font-size:10px;color:#64748B">파일명 확인 필요</div>`;
    if (it.status === 'pending-noname') return `<span style="color:#92400E;font-weight:600">⚠ 이름입력</span><div style="font-size:10px;color:#64748B">아래 칸에 입력</div>`;
    if (it.status === 'success')        return `<span style="color:#15803D;font-weight:600">✓ 완료</span>`;
    if (it.status === 'uploading')      return `<span style="color:#1B3A6B">⏳ 업로드중</span>`;
    if (it.status === 'pending')        return `<span style="color:#15803D">✓ 준비됨</span>`;
    return it.status;
  };

  tbody.innerHTML = data.map((it, i) => {
    const skipped = it.status === 'error' || it.status === 'skip-conflict' || it.status === 'skip-nono';
    const rowBg = skipped ? 'background:#FEF2F2' :
                  it.status === 'pending-noname' ? 'background:#FFFBEB' :
                  it.status === 'success' ? 'background:#F0FDF4' : '';
    const nameCell = (it.status === 'error' || it.status === 'skip-nono')
      ? `<input type="text" value="${(it.name||'').replace(/"/g,'&quot;')}" disabled style="width:100%;padding:5px 8px;border:1px solid #E2E8F0;border-radius:4px;font-size:12px;background:#F1F5F9">`
      : `<input type="text" value="${(it.name||'').replace(/"/g,'&quot;')}" oninput="_updateBatchName(${i}, this.value)"
               placeholder="${it.status === 'pending-noname' ? '이름을 입력하세요' : ''}"
               style="width:100%;padding:5px 8px;border:1px solid ${it.status === 'pending-noname' ? '#FBBF24' : '#E2E8F0'};border-radius:4px;font-size:12px">`;
    const noCell = (it.status === 'skip-nono')
      ? `<span style="color:#991B1B">—</span>`
      : `<span style="font-weight:600">${it.no || '—'}</span>`;
    return `
      <tr style="${rowBg};border-bottom:1px solid #F1F5F9">
        <td style="padding:6px 8px;color:#94A3B8;font-size:11px">${i+1}</td>
        <td style="padding:6px 8px">${noCell}<div style="font-size:10px;color:#94A3B8" title="${it.filename}">${it.filename.length > 18 ? it.filename.slice(0,16)+'…' : it.filename}</div></td>
        <td style="padding:6px 8px">${nameCell}</td>
        <td style="padding:6px 8px;text-align:center">${it.rows.length || '—'}</td>
        <td style="padding:6px 8px;text-align:center">${it.banCnt ? `<span style="color:#991B1B">${it.banCnt}</span>` : '—'}</td>
        <td style="padding:6px 8px;text-align:center">${it.memoCnt ? `<span style="color:#64748B">${it.memoCnt}</span>` : '—'}</td>
        <td style="padding:6px 8px">${statusBadge(it)}</td>
      </tr>`;
  }).join('');

  const ok = data.filter(it => it.status === 'pending' || it.status === 'pending-noname').length;
  const skip = data.filter(it => it.status === 'skip-conflict' || it.status === 'skip-nono' || it.status === 'error').length;
  const success = data.filter(it => it.status === 'success').length;
  const totalUnits = data.filter(it => it.status === 'pending' || it.status === 'pending-noname')
                         .reduce((sum, it) => sum + it.rows.length, 0);
  document.getElementById('batch-summary').textContent =
    `생성 가능: ${ok}개 · 건너뜀: ${skip}개${success ? ` · 완료: ${success}개` : ''} · 총 세대: ${totalUnits}호`;
}

window._updateBatchName = function(idx, val) {
  const it = window._batchData[idx];
  if (!it) return;
  it.name = (val || '').trim();
  if (it.name && it.status === 'pending-noname') it.status = 'pending';
  else if (!it.name && it.status === 'pending')  it.status = 'pending-noname';
  _updateBatchUploadBtn();
};

function _updateBatchUploadBtn() {
  const data = window._batchData || [];
  const ready = data.filter(it => it.status === 'pending').length;
  const btn = document.getElementById('batch-upload-btn');
  if (!btn) return;
  btn.disabled = (ready === 0);
  btn.textContent = ready ? `일괄 생성 (${ready}개)` : '일괄 생성';
}

window.uploadBatchTerritories = async function() {
  const $ = id => document.getElementById(id);
  const category = ($('bu-category')?.value || '').trim();
  if (!category) { alert('유형(그룹)을 선택해 주세요.'); return; }
  if (typeof db === 'undefined' || !db) {
    alert('데이터베이스 연결이 준비되지 않았습니다.\n페이지를 새로고침해 주세요.');
    return;
  }

  const data = window._batchData || [];
  const targets = data.filter(it => it.status === 'pending');
  if (!targets.length) {
    alert('업로드할 항목이 없습니다.\n이름 누락 항목은 표에서 입력해 주세요.');
    return;
  }

  if (!confirm(`총 ${targets.length}개 구역을 생성합니다. 계속할까요?\n\n유형: ${category}`)) return;

  const btn = $('batch-upload-btn');
  btn.disabled = true;
  $('batch-progress-wrap').style.display = 'block';
  const bar = $('batch-progress-bar');
  const txt = $('batch-progress-text');

  let done = 0, ok = 0, fail = 0;
  const total = targets.length;
  const totalForProgress = total;

  // 600+개 처리 최적화: 매 파일마다 전체 재렌더하면 느려짐 → 10개마다만 갱신
  let renderCounter = 0;
  for (const it of targets) {
    it.status = 'uploading';
    // 진행률 텍스트는 매번, 표 재렌더는 10개마다
    txt.textContent = `진행 중... ${done}/${total} (성공 ${ok}, 실패 ${fail})`;
    if (renderCounter % 10 === 0) _renderBatchPreview();
    renderCounter++;
    try {
      // units 빌드
      const units = it.rows.map((r, i) => ({
        idx: i,
        road: r[0] || '', jibun: r[1] || '',
        building: r[2] || '', unit: String(r[3] || ''),
        visitCode: null, visitedBy: null, visitedAt: null,
        escortRequired: false
      }));

      // visitMap 빌드
      const nowIso = new Date().toISOString();
      const visitMap = {};
      it.rows.forEach((r, i) => {
        if (r[4]) visitMap[i] = { code: 'refuse', by: '', at: nowIso };
      });

      // 메모 행 수집
      const memoRows = it.rows
        .map((r, i) => ({ i, unit: String(r[3]||''), building: String(r[2]||''), memo: String(r[5]||'').trim() }))
        .filter(x => x.memo);

      // 1) territories 생성
      const no = String(it.no).replace(/^0+/, '') || '0';
      const docRef = await addDoc(collection(db, 'territories'), {
        no, name: it.name, category,
        totalUnits: units.length,
        assignedPublishers: [],
        status: '미배정',
        completionRate: 0,
        cycle: 1,
        lastAssignedDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        units, visitMap
      });

      // 2) 메모 저장 (실패해도 무시)
      for (const m of memoRows) {
        try {
          const label = m.building ? `${m.building} ${m.unit}호` : `${m.unit}호`;
          await addDoc(collection(db, 'memos'), {
            territoryId: docRef.id,
            territoryNo: no,
            territoryName: it.name,
            unit: m.unit,
            unitIdx: m.i,
            building: m.building,
            content: `[${label}] ${m.memo}`,
            category: 'general',
            submittedBy: '엑셀일괄업로드',
            submittedAt: serverTimestamp(),
            type: 'admin',
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: '엑셀일괄업로드'
          });
        } catch(_) {}
      }

      // 3) 로컬 상태 갱신
      window._territories = window._territories || [];
      window._territories.push({
        id: docRef.id, no, name: it.name, category,
        totalUnits: units.length,
        assignedPublishers: [],
        status: '미배정',
        completionRate: 0,
        cycle: 1,
        units, visitMap
      });

      it.status = 'success';
      ok++;
    } catch(err) {
      console.error('[일괄] 저장 실패:', it.filename, err);
      it.status = 'error';
      it.error = err.message || String(err);
      fail++;
    }

    done++;
    bar.style.width = `${Math.round(done/totalForProgress*100)}%`;
    txt.textContent = `진행 중... ${done}/${total} (성공 ${ok}, 실패 ${fail})`;

    // UI 응답성 유지: 50개마다 짧은 yield (브라우저가 다른 작업 처리하도록)
    if (done % 50 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
  // 모든 처리가 끝나면 마지막으로 한 번 전체 재렌더
  _renderBatchPreview();

  bar.style.width = '100%';
  txt.textContent = `완료! 성공 ${ok}개, 실패 ${fail}개`;

  // UI 갱신
  try { renderTerritoryTable(); } catch(_) {}
  try { updateTerritoryStats(); } catch(_) {}
  try { if (typeof renderCatTabs === 'function') renderCatTabs(); } catch(_) {}

  alert(`일괄 업로드 완료\n\n✓ 성공: ${ok}개\n${fail ? `✗ 실패: ${fail}개\n` : ''}건너뜀: ${data.length - ok - fail}개`);
  btn.textContent = '닫기';
  btn.disabled = false;
  btn.onclick = function() { closeModal('batch-upload-modal'); };
};


// 배정 모달
window.openAssignModal = function(id, name, no) {
  window._assignTargetId = id;
  document.getElementById('assign-info').textContent =
    `구역 번호 ${String(no)}. ${name} — 최대 6명까지 배정 가능합니다.`;

  const pubs = window._publishers.filter(p => p.approved);
  const territory = window._territories.find(t => t.id === id);
  const assigned = territory?.assignedPublishers || [];

  const listHtml = pubs.length
    ? pubs.map(p => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #E2E8F0;border-radius:8px;cursor:pointer;background:${assigned.includes(p.name)?'#EFF6FF':'#fff'}">
          <input type="checkbox" value="${p.name}" ${assigned.includes(p.name)?'checked':''} onchange="limitAssignCheck(this)" style="width:16px;height:16px">
          <span style="font-size:14px;font-weight:500">${p.name}</span>
          <span style="font-size:11px;color:#94A3B8;margin-left:auto">${p.orgRole || '전도인'}</span>
        </label>`).join('')
    : '<div style="color:#94A3B8;font-size:13px;text-align:center;padding:20px">승인된 전도인이 없습니다</div>';

  document.getElementById('assign-pub-list').innerHTML = listHtml;
  document.getElementById('assign-modal').classList.add('open');
};

window.limitAssignCheck = function(cb) {
  const checked = document.querySelectorAll('#assign-pub-list input:checked');
  if (checked.length > 6) { cb.checked = false; alert('최대 6명까지 배정할 수 있습니다.'); }
};

window.confirmAssign = async function() {
  const id = window._assignTargetId;
  const checked = [...document.querySelectorAll('#assign-pub-list input:checked')].map(c => c.value);
  const status = checked.length > 0 ? '진행중' : '미배정';
  try {
    await updateDoc(doc(db, 'territories', id), {
      assignedPublishers: checked,
      status,
      lastAssignedDate: serverTimestamp()
    });
    const t = window._territories.find(t => t.id === id);
    if (t) { t.assignedPublishers = checked; t.status = status; }
    closeModal('assign-modal');
    renderTerritoryTable();
    updateTerritoryStats();
  } catch(e) { alert('저장 중 오류가 발생했습니다.'); }
};

// 구역 삭제
window.deleteTerritory = function(id, name) {
  if (!confirm(`"${name}" 구역을 삭제하시겠습니까?
모든 방문 기록이 함께 삭제됩니다.`)) return;
  deleteDoc(doc(db, 'territories', id)).then(() => {
    window._territories = window._territories.filter(t => t.id !== id);
    renderTerritoryTable();
    updateTerritoryStats();
  }).catch(() => alert('삭제 중 오류가 발생했습니다.'));
};

// ── Firebase 함수 전역 노출 (비모듈 스크립트용 — 설정탭 등) ──
window._db             = db;
window._doc            = (...a) => doc(...a);
window._getDefaultGroups = () => ['주택구역','상가구역','격지 구역','동행필수 구역','아파트 구역','인터폰','편지 구역'];
window._getDoc         = (...a) => getDoc(...a);
window._getDocs        = (...a) => getDocs(...a);
window._updateDoc      = (...a) => updateDoc(...a);
window._deleteDoc      = (...a) => deleteDoc(...a);
window._addDoc         = (...a) => addDoc(...a);
window._collection     = (...a) => collection(...a);
window._query          = (...a) => query(...a);
window._where          = (...a) => where(...a);
window._orderBy        = (...a) => orderBy(...a);
window._setDoc         = (...a) => setDoc(...a);
window._serverTimestamp = () => serverTimestamp();

// ════════════════════════════════════════════
// ══ 방문내역 탭 ══
// ════════════════════════════════════════════

const VISIT_CODE_META = {
  absent:   { label:'부재',            icon:'—',  color:'#64748B', bg:'#F1F5F9' },
  resp:     { label:'응답',            icon:'✓',  color:'#166534', bg:'#DCFCE7' },
  revisit:  { label:'재방문',          icon:'⏰', color:'#1D4ED8', bg:'#DBEAFE' },
  refuse:   { label:'거절',            icon:'✕',  color:'#991B1B', bg:'#FEE2E2' },
  vacant:   { label:'공실',            icon:'□',  color:'#475569', bg:'#F8FAFC' },
  escort:   { label:'동행필수',        icon:'⚠',  color:'#92400E', bg:'#FEF3C7' },
  jwmember: { label:'형제/자매댁',     icon:'🏠', color:'#5B21B6', bg:'#EDE9FE' },
  interest: { label:'관심자/성서연구', icon:'📖', color:'#0F766E', bg:'#F0FDFA' },
};

let _visitView = 'card'; // 'card' | 'list'

window.initVisitTab = function() {
  const today = new Date();
  const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
  const dfFrom = document.getElementById('vf-date-from');
  const dfTo   = document.getElementById('vf-date-to');
  if (dfFrom && !dfFrom.value) dfFrom.value = oneYearAgo.toISOString().slice(0, 10);
  if (dfTo   && !dfTo.value)   dfTo.value   = today.toISOString().slice(0, 10);
  applyVisitFilter();
};

window.switchVisitView = function(mode) {
  _visitView = mode;
  const cardBtn   = document.getElementById('vv-card-btn');
  const listBtn   = document.getElementById('vv-list-btn');
  const cardGrid  = document.getElementById('visit-card-grid');
  const tableWrap = document.getElementById('visit-table-wrap');
  if (cardBtn) {
    cardBtn.style.background  = mode === 'card' ? '#1B3A6B' : '#fff';
    cardBtn.style.color       = mode === 'card' ? '#fff'    : '#64748B';
    cardBtn.style.borderColor = mode === 'card' ? '#1B3A6B' : '#CBD5E1';
  }
  if (listBtn) {
    listBtn.style.background  = mode === 'list' ? '#1B3A6B' : '#fff';
    listBtn.style.color       = mode === 'list' ? '#fff'    : '#64748B';
    listBtn.style.borderColor = mode === 'list' ? '#1B3A6B' : '#CBD5E1';
  }
  if (cardGrid)  cardGrid.style.display  = mode === 'card' ? 'grid'  : 'none';
  if (tableWrap) tableWrap.style.display = mode === 'list' ? 'block' : 'none';
  applyVisitFilter();
};

window.applyVisitFilter = function() {
  const dateFrom = (document.getElementById('vf-date-from') || {}).value || '';
  const dateTo   = (document.getElementById('vf-date-to')   || {}).value || '';
  const noFrom   = parseInt((document.getElementById('vf-no-from') || {}).value) || 1;
  const noTo     = parseInt((document.getElementById('vf-no-to')   || {}).value) || 99999;

  const territories = [...(window._territories || [])]
    .filter(t => { const n = parseInt(t.no || 0); return n >= noFrom && n <= noTo; })
    .sort((a, b) => parseInt(a.no || 0) - parseInt(b.no || 0));

  let totalCycles = 0;
  const activeSet = new Set();
  const pubSet    = new Set();
  let   inactiveCnt = 0;
  territories.forEach(t => {
    const cycles = (t.cycleHistory || []).filter(h => {
      const d = (h.completedAt || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    });
    if (cycles.length) {
      totalCycles += cycles.length;
      activeSet.add(t.id);
      cycles.forEach(h => (h.publishers || []).forEach(p => pubSet.add(p)));
    } else {
      inactiveCnt++;
    }
  });
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('vs-total',   totalCycles.toLocaleString() + '회');
  setEl('vs-resp',    activeSet.size.toLocaleString() + '개');
  setEl('vs-revisit', inactiveCnt.toLocaleString() + '개');
  setEl('vs-refuse',  pubSet.size.toLocaleString() + '명');

  if (_visitView === 'card') {
    _renderVisitCards(territories, dateFrom, dateTo);
  } else {
    _renderVisitTable(territories, dateFrom, dateTo);
  }
};

function _renderVisitCards(territories, dateFrom, dateTo) {
  const grid = document.getElementById('visit-card-grid'); if (!grid) return;
  if (!territories.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#94A3B8;font-size:14px">조건에 맞는 구역이 없습니다</div>';
    return;
  }
  const vmModeLabel = m => m === '편지' ? '편지' : m === '전화' ? '전화' : '호별';

  grid.innerHTML = territories.map(t => {
    const cycles = (t.cycleHistory || [])
      .filter(h => {
        const d = (h.completedAt || '').slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
        return true;
      })
      .sort((a, b) => (b.cycle || 0) - (a.cycle || 0));

    const catBg = CAT_BG[t.category] || '#F1F5F9';
    const catCl = CAT_CL[t.category] || '#475569';
    const isPersonal = !!t.personalAssignee;

    // visitMap 요약 (현재 진행 중) — 금지 마커 및 시스템 명칭 제외
    const _SYS = ['엑셀업로드', '엑셀일괄업로드'];
    const vmEntries = Object.entries(t.visitMap || {}).filter(([, v]) => v && v.by && v.by.trim() !== '' && !_SYS.includes(v.by));
    const vmPubs    = [...new Set(vmEntries.map(([, v]) => v.by).filter(Boolean))];
    const vmLastAt  = vmEntries.map(([, v]) => v.at || '').filter(Boolean).sort().slice(-1)[0] || '';

    let rowsHtml;
    if (cycles.length) {
      rowsHtml = cycles.map(h => {
        const pubs   = (h.publishers || []);
        const pubStr = pubs.length > 2 ? pubs.slice(0, 2).join(',') + '...' : pubs.join(',') || '—';
        const dateStr = (h.completedAt || '').slice(2, 10);
        return '<div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:3px 0;border-bottom:1px solid #F1F5F9;line-height:1.4">' +
          '<span style="min-width:26px;color:#1B3A6B;font-weight:600">' + h.cycle + '차</span>' +
          '<span style="min-width:26px;color:#64748B;background:#F1F5F9;border-radius:3px;padding:1px 3px;font-size:10px">' + vmModeLabel(h.visitMode) + '</span>' +
          '<span style="min-width:58px;color:#94A3B8;font-variant-numeric:tabular-nums">' + dateStr + '</span>' +
          '<span style="color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + pubStr + '</span>' +
          '</div>';
      }).join('');
    } else if (vmPubs.length > 0) {
      // cycleHistory 없지만 visitMap에 방문 기록이 있는 경우
      const pubStr  = vmPubs.length > 2 ? vmPubs.slice(0, 2).join(',') + '...' : vmPubs.join(',');
      const dateStr = vmLastAt ? vmLastAt.slice(2, 10) : '';
      rowsHtml =
        '<div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:3px 0;line-height:1.4">' +
          '<span style="min-width:34px;color:#059669;font-weight:600;font-size:10px;background:#ECFDF5;border-radius:3px;padding:1px 3px">진행중</span>' +
          '<span style="min-width:58px;color:#94A3B8;font-variant-numeric:tabular-nums">' + dateStr + '</span>' +
          '<span style="color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + pubStr + '</span>' +
        '</div>';
    } else {
      rowsHtml = '<div style="font-size:12px;color:#94A3B8;padding:8px 0;text-align:center">봉사내역 없음</div>';
    }

    const personalBadge = isPersonal
      ? '<span style="font-size:10px;background:#F3E8FF;color:#7C3AED;border-radius:4px;padding:1px 5px;margin-left:4px">개인</span>'
      : '';

    const catBadge = t.category
      ? '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:' + catBg + ';color:' + catCl + '">' + t.category + '</span>'
      : '';

    return '<div onclick="openTerritoryCard(\'' + t.id + '\')" style="background:#fff;border-radius:10px;padding:12px 12px 10px;box-shadow:0 1px 4px rgba(0,0,0,0.07);cursor:pointer;border:1px solid #E2E8F0;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow=\'0 3px 12px rgba(0,0,0,0.12)\'" onmouseout="this.style.boxShadow=\'0 1px 4px rgba(0,0,0,0.07)\'">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
          '<span style="font-size:16px;font-weight:700;color:#1B3A6B">' + t.no + '</span>' +
          catBadge + personalBadge +
        '</div>' +
        '<button onclick="event.stopPropagation();openVisitDetailModal(\'' + t.id + '\')" title="세부 방문기록 보기" style="border:none;background:none;color:#94A3B8;cursor:pointer;font-size:18px;padding:0 4px;line-height:1;letter-spacing:1px" onmouseover="this.style.color=\'#1B3A6B\'" onmouseout="this.style.color=\'#94A3B8\'">···</button>' +
      '</div>' +
      (t.name ? '<div style="font-size:11px;color:#94A3B8;margin-bottom:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + t.name + '</div>' : '') +
      '<div style="border-top:1px solid #F1F5F9;padding-top:7px">' + rowsHtml + '</div>' +
    '</div>';
  }).join('');
}

function _renderVisitTable(territories, dateFrom, dateTo) {
  const wrap = document.getElementById('visit-table-wrap'); if (!wrap) return;
  const allRows = [];
  territories.forEach(t => {
    (t.cycleHistory || [])
      .filter(h => {
        const d = (h.completedAt || '').slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
        return true;
      })
      .forEach(h => allRows.push({ t, h }));
  });
  if (!allRows.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:48px;color:#94A3B8;font-size:14px">해당 기간에 방문 완료 기록이 없습니다</div>';
    return;
  }
  allRows.sort((a, b) => (b.h.completedAt || '').localeCompare(a.h.completedAt || ''));
  const rows = allRows.map(function({ t, h }) {
    const pubs      = (h.publishers || []).join(', ') || '—';
    const assigned  = (h.assignedAt  || '—').slice(0, 10);
    const completed = (h.completedAt || '—').slice(0, 10);
    return '<tr style="cursor:pointer" onclick="openTerritoryCard(\'' + t.id + '\')">' +
      '<td style="font-weight:600;color:#1B3A6B">' + t.no + '번</td>' +
      '<td style="font-size:12px;color:#475569">' + (t.name || '') + '</td>' +
      '<td style="color:#64748B">' + h.cycle + '차</td>' +
      '<td style="font-size:12px">' + (h.visitMode || '호별') + '</td>' +
      '<td style="font-size:12px;white-space:nowrap">' + assigned + ' → ' + completed + '</td>' +
      '<td style="font-size:12px">' + pubs + '</td>' +
    '</tr>';
  }).join('');
  wrap.innerHTML = '<div class="table-scroll-wrap"><table>' +
    '<thead><tr><th>구역</th><th>이름</th><th>회차</th><th>방식</th><th>기간</th><th>전도인</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>' +
    '<div style="font-size:12px;color:#94A3B8;margin-top:8px;text-align:right">' + allRows.length.toLocaleString() + '건 표시</div>';
}

// ── 방문내역 세부 팝업 ──
window.openVisitDetailModal = function(id) {
  const t = (window._territories || []).find(t => t.id === id);
  if (!t) return;

  // 헤더
  const noEl    = document.getElementById('vd-no');
  const nameEl  = document.getElementById('vd-name');
  const cntEl   = document.getElementById('vd-count');
  if (noEl)   noEl.textContent   = t.no + '번';
  if (nameEl) nameEl.textContent = t.name || '';
  if (cntEl)  cntEl.textContent  = (t.units || []).length + '세대';

  // 회차 목록 (cycleHistory 오름차순)
  const cycles = [...(t.cycleHistory || [])].sort((a, b) => (a.cycle || 0) - (b.cycle || 0));
  const units  = t.units || [];

  // visitMap (현재 진행 중) — by가 비어있는 항목은 엑셀 금지 마커이므로 제외
  const visitMap = t.visitMap || {};
  const _SYSTEM_BY = ['엑셀업로드', '엑셀일괄업로드'];
  const _isRealVisit = v => v && v.by && v.by.trim() !== '' && !_SYSTEM_BY.includes(v.by);
  const hasCurrentVisits = Object.values(visitMap).some(_isRealVisit);

  // unitVisits가 실제 데이터를 갖고 있는지 판단
  const hasUnitVisits = h => h.unitVisits && Object.keys(h.unitVisits).length > 0;

  // ── 헤더 행 ──
  const thBase    = 'padding:7px 8px;text-align:left;border-bottom:2px solid #2E7D7A;border-right:1px solid #CBD5E1;font-weight:600;color:#1E293B;white-space:nowrap;background:#F0FAFA;font-size:11px;position:sticky;top:0;z-index:2';
  const thCycle   = 'padding:7px 8px;text-align:center;border-bottom:2px solid #2E7D7A;border-right:1px solid #CBD5E1;font-weight:600;white-space:nowrap;background:#E6F7F6;color:#1B5E5C;font-size:11px;min-width:70px;position:sticky;top:0;z-index:2';
  const thCurrent = 'padding:7px 8px;text-align:center;border-bottom:2px solid #059669;border-right:1px solid #CBD5E1;font-weight:600;white-space:nowrap;background:#ECFDF5;color:#065F46;font-size:11px;min-width:70px;position:sticky;top:0;z-index:2';

  const cycleHeaders = cycles.map(h => {
    const dateStr   = (h.completedAt || h.assignedAt || '').slice(2, 10);
    const modeLabel = h.visitMode === '편지' ? '편지' : h.visitMode === '전화' ? '전화' : '호별';
    return '<th style="' + thCycle + '">' + h.cycle + '회차' +
      '<div style="font-weight:400;font-size:10px;color:#64748B;margin-top:1px">' + modeLabel + ' ' + dateStr + '</div></th>';
  }).join('');

  const currentHeader = hasCurrentVisits
    ? '<th style="' + thCurrent + '">현재 진행<div style="font-weight:400;font-size:10px;color:#047857;margin-top:1px">방문 기록</div></th>'
    : '';

  const thead = document.getElementById('vd-thead');
  if (thead) thead.innerHTML = '<tr>' +
    '<th style="' + thBase + '">도로명</th>' +
    '<th style="' + thBase + '">번지</th>' +
    '<th style="' + thBase + '">건물명</th>' +
    '<th style="' + thBase + '">세부주소</th>' +
    '<th style="' + thBase + ';text-align:center;min-width:36px">금지</th>' +
    (cycleHeaders || (!hasCurrentVisits ? '<th style="' + thCycle + '">완료 기록 없음</th>' : '')) +
    currentHeader +
    '</tr>';

  // ── 데이터 행 ──
  const border = '1px solid #E2E8F0';
  const tdBase = 'padding:5px 8px;border-bottom:' + border + ';border-right:' + border + ';font-size:11px;color:#334155';
  const tdAlt  = 'padding:5px 8px;border-bottom:' + border + ';border-right:' + border + ';font-size:11px;color:#334155;background:#F8FFFE';

  const rows = units.map((u, idx) => {
    const td = idx % 2 === 0 ? tdBase : tdAlt;
    const restricted = u.restricted || u.noVisit || false;
    const restrCell = restricted
      ? '<td style="' + td + ';text-align:center;color:#EF4444;font-weight:700">Y</td>'
      : '<td style="' + td + '"></td>';

    const cycleCells = cycles.map(h => {
      let cellStyle = td + ';text-align:center';
      let displayText = '';

      if (hasUnitVisits(h)) {
        const v = (h.unitVisits || {})[String(idx)];
        const who = v && v.by ? v.by : '';
        if (who) {
          cellStyle += ';background:#E6F7F6;color:#1B5E5C;font-weight:600';
          displayText = who;
        } else {
          cellStyle += ';color:#D1D5DB';
          displayText = '—';
        }
      } else {
        // unitVisits 없음 → 회차 publishers 전체를 회색으로 표시
        const pubs = (h.publishers || []);
        if (pubs.length > 0) {
          cellStyle += ';color:#6B7280;font-size:10px';
          displayText = pubs.length > 2
            ? pubs.slice(0, 2).join('<br>') + '<br><span style="color:#9CA3AF">+' + (pubs.length - 2) + '</span>'
            : pubs.join('<br>');
        } else {
          cellStyle += ';color:#D1D5DB';
          displayText = '—';
        }
      }

      return '<td style="' + cellStyle + '">' + displayText + '</td>';
    }).join('');

    // 현재 진행 중인 visitMap 셀
    let currentCell = '';
    if (hasCurrentVisits) {
      const vm = visitMap[String(idx)];
      const who = _isRealVisit(vm) ? vm.by : '';
      const code = vm && vm.code ? vm.code : '';
      const codeLabel = { resp:'응답', revisit:'재방문', refuse:'거절', absent:'부재', vacant:'공실' }[code] || '';
      if (who) {
        currentCell = '<td style="' + td + ';text-align:center;background:#ECFDF5;color:#065F46;font-weight:600">' +
          who + (codeLabel ? '<div style="font-size:9px;color:#047857;font-weight:400">' + codeLabel + '</div>' : '') + '</td>';
      } else {
        currentCell = '<td style="' + td + ';text-align:center;color:#D1D5DB">—</td>';
      }
    }

    return '<tr>' +
      '<td style="' + td + '">' + (u.road || '') + '</td>' +
      '<td style="' + td + '">' + (u.jibun || u.number || '') + '</td>' +
      '<td style="' + td + '">' + (u.building || '') + '</td>' +
      '<td style="' + td + '">' + (u.unit || u.ho || '') + '</td>' +
      restrCell +
      cycleCells +
      currentCell +
    '</tr>';
  }).join('');

  const totalCols = 5 + cycles.length + (hasCurrentVisits ? 1 : 0);
  const tbody = document.getElementById('vd-tbody');
  if (tbody) tbody.innerHTML = rows ||
    '<tr><td colspan="' + totalCols + '" style="padding:20px;text-align:center;color:#94A3B8">세대 정보가 없습니다</td></tr>';

  document.getElementById('visit-detail-modal').classList.add('open');
};

window.clearVisitFilter = function() {
  ['vf-date-from', 'vf-date-to', 'vf-no-from', 'vf-no-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  applyVisitFilter();
};

window.exportVisitCsv = function() {
  const dateFrom = (document.getElementById('vf-date-from') || {}).value || '';
  const dateTo   = (document.getElementById('vf-date-to')   || {}).value || '';
  const noFrom   = parseInt((document.getElementById('vf-no-from') || {}).value) || 1;
  const noTo     = parseInt((document.getElementById('vf-no-to')   || {}).value) || 99999;
  const rows = [];
  (window._territories || [])
    .filter(t => { const n = parseInt(t.no || 0); return n >= noFrom && n <= noTo; })
    .forEach(t => {
      (t.cycleHistory || [])
        .filter(h => {
          const d = (h.completedAt || '').slice(0, 10);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo   && d > dateTo)   return false;
          return true;
        })
        .forEach(h => rows.push([t.no, t.name || '', h.cycle, h.visitMode || '',
          (h.assignedAt  || '').slice(0, 10),
          (h.completedAt || '').slice(0, 10),
          (h.publishers  || []).join('|')]));
    });
  if (!rows.length) { alert('내보낼 데이터가 없습니다.'); return; }
  const hdr = ['구역번호', '구역명', '회차', '방식', '배정일', '완료일', '전도인'];
  const csv = '﻿' + [hdr.join(','), ...rows.map(r =>
    r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url;
  a.download = '방문내역_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
};


// ════════════════════════════════════════════
// ══ 메모관리 탭 ══
// ════════════════════════════════════════════

let _memos        = [];
let _memoFiltered = [];
let _memoUnsub    = null;

window.initMemoTab = function() {
  _fillMemoSelects();
  if (!_memoUnsub) _startMemoListener();
};

function _fillMemoSelects() {
  ['mf-territory','ma-territory'].forEach(function(selId) {
    var sel = document.getElementById(selId); if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = selId==='mf-territory'
      ? '<option value="">전체 구역</option>'
      : '<option value="">구역을 선택하세요</option>';
    var territories = window._territories || [];
    territories.slice().sort(function(a,b){return parseInt(a.no||0)-parseInt(b.no||0);}).forEach(function(t){
      var o = document.createElement('option');
      o.value=t.id; o.dataset.no=t.no; o.dataset.name=t.name;
      o.textContent=t.no+'번 '+t.name; sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  });
}

function _startMemoListener() {
  var q = query(collection(db,'memos'), orderBy('submittedAt','desc'));
  _memoUnsub = onSnapshot(q, function(snap) {
    _memos = snap.docs.map(function(d){return Object.assign({id:d.id},d.data());});
    _syncMemoStats(); applyMemoFilter();
  }, function(_err) {
    getDocs(collection(db,'memos')).then(function(snap){
      _memos = snap.docs.map(function(d){return Object.assign({id:d.id},d.data());})
        .sort(function(a,b){return ((b.submittedAt&&b.submittedAt.toMillis&&b.submittedAt.toMillis())||0)-((a.submittedAt&&a.submittedAt.toMillis&&a.submittedAt.toMillis())||0);});
      _syncMemoStats(); applyMemoFilter();
    }).catch(console.error);
  });
}

function _syncMemoStats() {
  var setEl=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('ms-total',    _memos.length);
  setEl('ms-pending',  _memos.filter(function(m){return m.status==='pending';}).length);
  setEl('ms-approved', _memos.filter(function(m){return m.status==='approved';}).length);
  setEl('ms-admin',    _memos.filter(function(m){return m.type==='admin';}).length);
}

window.applyMemoFilter = function() {
  var terrId = (document.getElementById('mf-territory')||{}).value||'';
  var status = (document.getElementById('mf-status')   ||{}).value||'';
  var type   = (document.getElementById('mf-type')     ||{}).value||'';
  _memoFiltered = _memos.filter(function(m){
    if (terrId && m.territoryId!==terrId) return false;
    if (status && m.status     !==status) return false;
    if (type   && m.type       !==type)   return false;
    return true;
  });
  _renderMemoTable(_memoFiltered);
};

function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function _renderMemoTable(memos) {
  var wrap = document.getElementById('memo-table-wrap'); if(!wrap) return;
  if (!memos.length) {
    wrap.innerHTML='<div style="text-align:center;padding:48px;color:#94A3B8">'
      +'<div style="font-size:36px;margin-bottom:12px;opacity:0.4">\u{1F4DD}</div>'
      +'<p style="font-size:14px">메모가 없습니다</p>'
      +'<p style="font-size:12px;margin-top:6px">+ 관리자 메모 추가 버튼을 눌러 첫 메모를 작성하세요</p>'
      +'</div>'; return;
  }
  var CAT={general:'일반 안내',caution:'주의 사항',access:'출입 정보',revisit:'재방문 정보'};
  var rows = memos.map(function(m){
    var isPending=m.status==='pending';
    var statusBadge=isPending
      ?'<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:500">대기</span>'
      :'<span style="background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:500">승인</span>';
    var typeBadge=m.type==='admin'
      ?'<span style="background:#EDE9FE;color:#5B21B6;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:500">관리자</span>'
      :'<span style="background:#DBEAFE;color:#1D4ED8;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:500">전도인</span>';
    var dt=(m.submittedAt&&m.submittedAt.toDate)
      ?m.submittedAt.toDate().toLocaleDateString('ko-KR')
      :(m.submittedAt||'').slice(0,10);
    var approveBtn=isPending?'<button class="btn btn-sm btn-success" onclick="approveMemo(\'' + m.id + '\')">✓ 승인</button>':'';
    return '<tr>'
      +'<td style="font-size:12px;color:#94A3B8;white-space:nowrap">'+dt+'</td>'
      +'<td><strong style="color:#1B3A6B">'+(m.territoryNo||'')+'번</strong><br><span style="font-size:11px;color:#64748B">'+_esc(m.territoryName||'')+'</span></td>'
      +'<td>'+typeBadge+'<br>'+statusBadge+'</td>'
      +'<td style="font-size:11px;color:#64748B">'+(CAT[m.category]||m.category||'')+'</td>'
      +'<td style="font-size:13px;max-width:260px;word-break:break-all">'+_esc(m.content||'')+'</td>'
      +'<td style="font-size:12px">'+_esc(m.submittedBy||'—')+'</td>'
      +'<td><div class="row-actions">'+approveBtn+'<button class="btn btn-sm btn-danger" onclick="deleteMemo(\'' + m.id + '\')">삭제</button></div></td>'
      +'</tr>';
  }).join('');
  wrap.innerHTML='<div class="table-scroll-wrap"><table>'
    +'<thead><tr><th>날짜</th><th>구역</th><th>유형/상태</th><th>분류</th><th>내용</th><th>작성자</th><th>작업</th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table></div>'
    +'<div style="font-size:12px;color:#94A3B8;margin-top:8px;text-align:right">'+memos.length+'건</div>';
}

window.openMemoAddModal = function() {
  _fillMemoSelects();
  document.getElementById('ma-territory').value='';
  document.getElementById('ma-category').value='general';
  document.getElementById('ma-content').value='';
  document.getElementById('ma-author').value='';
  document.getElementById('memo-add-modal').classList.add('open');
  setTimeout(function(){document.getElementById('ma-territory').focus();},100);
};

window.submitAdminMemo = async function() {
  var terrSel  = document.getElementById('ma-territory');
  var terrId   = terrSel.value.trim();
  var content  = document.getElementById('ma-content').value.trim();
  var category = document.getElementById('ma-category').value;
  var author   = (document.getElementById('ma-author').value.trim()) || '관리자';
  if (!terrId)  { alert('구역을 선택해 주세요.');    return; }
  if (!content) { alert('메모 내용을 입력해 주세요.'); return; }
  var opt      = terrSel.options[terrSel.selectedIndex];
  var terrNo   = opt.dataset.no   || '';
  var terrName = opt.dataset.name || '';
  try {
    await addDoc(collection(db,'memos'),{
      territoryId:terrId, territoryNo:terrNo, territoryName:terrName,
      content:content, category:category, submittedBy:author,
      submittedAt:serverTimestamp(),
      type:'admin', status:'approved',
      approvedAt:serverTimestamp(), approvedBy:author,
    });
    closeModal('memo-add-modal');
  } catch(e){ alert('저장 오류: '+e.message); }
};

window.approveMemo = async function(id) {
  if (!confirm('이 메모를 승인하시겠습니까?')) return;
  try {
    await updateDoc(doc(db,'memos',id),{status:'approved',approvedAt:serverTimestamp(),approvedBy:'관리자'});
  } catch(e){ alert('처리 오류: '+e.message); }
};

window.deleteMemo = async function(id) {
  if (!confirm('이 메모를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;
  try {
    await deleteDoc(doc(db,'memos',id));
  } catch(e){ alert('삭제 오류: '+e.message); }
};

// ── 엑셀 다운로드 ──
window.downloadTerritoryExcel = function(id) {
  const t = (window._territories || []).find(t => t.id === id);
  if (!t) return;
  const rows = [['도로명','번지','건물명','세부주소','금지','메모']];
  (t.units || []).forEach(u => {
    rows.push([u.road||'', u.jibun||'', u.building||'', u.detail||'', u.ban?'Y':'', u.memo||'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '구역카드');
  XLSX.writeFile(wb, `${t.no}_${t.name}.xlsx`);
};

window.downloadAllTerritoriesExcel = async function() {
  const list = window._territories || [];
  if (!list.length) { alert('구역 데이터가 없습니다.'); return; }
  const zip = new JSZip();
  list.forEach(t => {
    const rows = [['도로명','번지','건물명','세부주소','금지','메모']];
    (t.units || []).forEach(u => {
      rows.push([u.road||'', u.jibun||'', u.building||'', u.detail||'', u.ban?'Y':'', u.memo||'']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '구역카드');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    zip.file(`${t.no}_${t.name}.xlsx`, wbout);
  });
  const blob = await zip.generateAsync({ type:'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `구역카드_전체_${new Date().toISOString().slice(0,10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};

/* ── 건물명 오류 일괄 정비 ── */
window.fixBuildingCarryForward = async function() {
  const territories = window._territories || [];
  if (!territories.length) {
    alert('구역 데이터가 없습니다. 구역관리 탭을 먼저 열어주세요.');
    return;
  }
  const msgEl = document.getElementById('fix-building-msg');
  msgEl.style.display = 'block';
  msgEl.style.color = '#92400E';
  msgEl.textContent = '분석 중...';

  let fixedUnits = 0, fixedTerrs = 0;
  for (const terr of territories) {
    if (!Array.isArray(terr.units) || terr.units.length === 0) continue;

    // 같은 road+jibun을 연속 그룹으로 묶음
    const groups = [];
    for (const u of terr.units) {
      const road = (u.road || '').trim();
      const jibun = (u.jibun || '').trim();
      const last = groups[groups.length - 1];
      if (last && last.road === road && last.jibun === jibun) {
        last.units.push(u);
      } else {
        groups.push({ road, jibun, units: [u] });
      }
    }

    // 그룹 단위로 건물명 승계 오류 검사 (두 가지 케이스 처리)
    const newUnits = [];
    let changed = false;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (gi === 0) {
        newUnits.push(...g.units);
        continue;
      }
      const prevG = groups[gi - 1];
      const prevBuilding = (prevG.units[prevG.units.length - 1].building || '').trim();
      const buildings = g.units.map(u => (u.building || '').trim());
      const hasEmpty   = buildings.some(b => b === '');
      const hasNonEmpty = buildings.some(b => b !== '');

      // Case 1: 이전 그룹 건물명이 현재 그룹 전체에 그대로 승계된 경우
      const allInheritedFromPrev = prevBuilding !== '' && buildings.every(b => b === prevBuilding);

      // Case 2: 그룹 내 일부 행은 이미 ''로 정비됐고 나머지는 아직 건물명이 남은 경우
      //         (이전 정비 실행에서 첫 행만 지워지고 후속 행이 미처리된 상황)
      const partiallyFixed = hasEmpty && hasNonEmpty;

      if (allInheritedFromPrev || partiallyFixed) {
        // 현재 그룹의 모든 행에서 건물명 제거
        for (const u of g.units) {
          if ((u.building || '') !== '') {
            changed = true;
            fixedUnits++;
            newUnits.push({ ...u, building: '' });
          } else {
            newUnits.push(u);
          }
        }
      } else {
        newUnits.push(...g.units);
      }
    }

    if (changed) {
      fixedTerrs++;
      try {
        await updateDoc(doc(db, 'territories', terr.id), { units: newUnits });
        const t = window._territories.find(t => t.id === terr.id);
        if (t) t.units = newUnits;
      } catch (e) {
        console.error('fix building error', terr.id, e);
      }
    }
  }

  msgEl.style.color = fixedUnits > 0 ? '#166534' : '#64748B';
  msgEl.textContent = fixedUnits > 0
    ? `✅ ${fixedTerrs}개 구역, ${fixedUnits}개 세대의 건물명 오류를 수정했습니다.`
    : '✓ 수정이 필요한 건물명 오류가 없습니다.';
};

