// ══ 설정 탭 — window._db 등으로 모듈 함수 사용 ══
async function loadSettingsValues() {
  if (!window._db) return;
  try {
    const adminDoc = await window._getDoc(window._doc(window._db, 'admin', 'config'));
    if (adminDoc.exists()) {
      const data = adminDoc.data();
      const cEl = document.getElementById('s-congregation');
      if (cEl) cEl.value = data.congregation || '';
      const caEl = document.getElementById('s-cart-admin-pw');
      if (caEl) caEl.value = data.cartAdminPw || '';
      const clEl = document.getElementById('s-cycle-limit');
      if (clEl) clEl.value = data.cycleLimit || 6;
      window._cycleLimit = data.cycleLimit || 6;
      const vmEl = document.getElementById('s-visit-mode');
      if (vmEl) vmEl.querySelectorAll('.vm-chip').forEach(ch => {
        ch.classList.remove('selected');
        ch.style.background = '';
        ch.style.color = '';
        ch.style.borderColor = '';
        if (ch.dataset.val === (data.visitMode || '호별')) ch.classList.add('selected');
      });
      window._visitMode = data.visitMode || '호별';
      window._territoryGroups = data.territoryGroups || window._getDefaultGroups?.() || ['주택구역','상가구역','격지 구역','동행필수 구역','아파트 구역','인터폰','편지 구역','개인 구역'];
      if (!window._territoryGroups.includes('개인 구역')) {
        window._territoryGroups = [...window._territoryGroups, '개인 구역'];
      }
      renderGroupChipsInSettings();
    }
  } catch(e) { console.error('설정 로드 오류:', e); }

  // ── 인도자 인증 방식 로드 ──
  try {
    const authDoc = await window._getDoc(window._doc(window._db, 'config', 'auth'));
    const authData = authDoc.exists() ? authDoc.data() : {};
    const mode = authData.leaderAuthMode || 'individual';
    // 항상 라디오 하나를 체크 상태로 (문서 없을 때도 individual 기본 선택)
    const radioEl = document.querySelector(`input[name="leaderAuthMode"][value="${mode}"]`)
                 || document.querySelector('input[name="leaderAuthMode"][value="individual"]');
    if (radioEl) { radioEl.checked = true; }
    const pinEl = document.getElementById('s-shared-leader-pin');
    if (pinEl) pinEl.value = authData.sharedLeaderPin || '';
    onLeaderAuthModeChange(); // UI 상태 동기화
  } catch(e) { console.error('인증 설정 로드 오류:', e); }
}

window.saveCongregation = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const val = (document.getElementById('s-congregation').value || '').trim();
  if (!val) { alert('회중명을 입력해 주세요.'); return; }
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { congregation: val });
    window._congregation = val;
    // 로그인 화면 · 사이드바 · 매뉴얼 표지 · 브라우저 탭 즉시 갱신
    ['login-cong-name', 'sidebar-cong-name', 'manual-cong-name'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    document.title = '구역카드 관리자 — ' + val;
    alert('✅ 회중명이 저장되었습니다.');
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.saveCycleLimit = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const val = parseInt(document.getElementById('s-cycle-limit').value, 10);
  if (!val || val < 1) { alert('1 이상의 값을 입력해 주세요.'); return; }
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { cycleLimit: val });
    window._cycleLimit = val;
    alert(`✅ 회차제한이 ${val}회차로 저장되었습니다.`);
  } catch(e) { alert('저장 오류: ' + e.message); }
};

window.selectVisitMode = function(el) {
  document.querySelectorAll('#s-visit-mode .vm-chip').forEach(ch => {
    ch.classList.remove('selected');
    ch.style.background = '';
    ch.style.color = '';
    ch.style.borderColor = '';
  });
  el.classList.add('selected');
};

window.saveVisitMode = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const sel = document.querySelector('#s-visit-mode .vm-chip.selected');
  if (!sel) return;
  const val = sel.dataset.val;
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { visitMode: val });
    window._visitMode = val;
    alert('✅ 방문횟수가 저장되었습니다.');
  } catch(e) { alert('저장 오류: ' + e.message); }
};


// ── 그룹에 속한 구역 수 ──
function groupTerritoryCount(name) {
  return (window._territories || []).filter(t => t.category === name).length;
}

// ── 그룹 칩 렌더 ──
function renderGroupChipsInSettings() {
  const wrap = document.getElementById('s-group-chips');
  if (!wrap) return;
  const groups = window._territoryGroups || [];
  if (!groups.length) {
    wrap.innerHTML = '<span style="font-size:12px;color:#94A3B8">등록된 그룹 없음</span>';
    return;
  }
  wrap.innerHTML = groups.map((g, i) => {
    const cnt = groupTerritoryCount(g);
    const canDel = cnt === 0;
    return `<div id="grp-chip-${i}" style="display:inline-flex;align-items:center;gap:0;padding:0;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:16px;font-size:13px;color:#334155;overflow:hidden">
      <span style="padding:5px 8px 5px 12px;font-weight:500">${g}</span>
      ${cnt > 0 ? `<span style="font-size:10px;background:#E2E8F0;color:#64748B;padding:2px 6px;border-radius:8px;margin-right:4px">${cnt}개</span>` : ''}
      <button title="이름 변경" onclick="startEditGroup(${i})"
        style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:13px;padding:5px 5px;line-height:1;font-family:inherit" >✏</button>
      <button title="${canDel ? '삭제' : `구역 ${cnt}개 사용 중 — 먼저 다른 그룹으로 변경하세요`}"
        onclick="${canDel ? `removeTerritoryGroup(${i})` : `alert('이 그룹을 사용하는 구역이 ${cnt}개 있습니다.\n먼저 해당 구역들을 다른 그룹으로 변경해 주세요.')`}"
        style="background:none;border:none;color:${canDel ? '#F87171' : '#CBD5E1'};cursor:${canDel ? 'pointer' : 'not-allowed'};font-size:15px;padding:5px 10px 5px 4px;line-height:1;font-family:inherit">×</button>
    </div>`;
  }).join('');
}

// ── 인라인 이름 변경 ──
window.startEditGroup = function(idx) {
  const chip = document.getElementById(`grp-chip-${idx}`);
  if (!chip) return;
  const g = (window._territoryGroups || [])[idx] || '';
  chip.innerHTML = `
    <input id="grp-edit-input-${idx}" value="${g.replace(/"/g,'&quot;')}"
      style="border:none;background:transparent;font-size:13px;font-family:inherit;width:${Math.max(80, g.length * 13)}px;padding:5px 6px;outline:none;color:#1B3A6B;font-weight:500"
      onkeydown="if(event.key==='Enter')saveGroupRename(${idx});if(event.key==='Escape')renderGroupChipsInSettings()">
    <button onclick="saveGroupRename(${idx})" style="background:#1B3A6B;color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;margin-right:4px">저장</button>
    <button onclick="renderGroupChipsInSettings()" style="background:#E2E8F0;color:#475569;border:none;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;font-family:inherit;margin-right:6px">취소</button>`;
  document.getElementById(`grp-edit-input-${idx}`)?.focus();
};

// ── 이름 변경 저장 + 기존 구역 category 일괄 업데이트 ──
window.saveGroupRename = async function(idx) {
  if (!window._db) return;
  const oldName = (window._territoryGroups || [])[idx];
  const newName = (document.getElementById(`grp-edit-input-${idx}`)?.value || '').trim();
  if (!newName) { alert('이름을 입력해 주세요.'); return; }
  if (newName === oldName) { renderGroupChipsInSettings(); return; }
  if ((window._territoryGroups || []).includes(newName)) { alert('이미 있는 그룹명입니다.'); return; }

  const affectedTerritories = (window._territories || []).filter(t => t.category === oldName);
  const btn = document.querySelector(`#grp-chip-${idx} button`);
  if (btn) btn.textContent = '저장 중...';

  try {
    // 그룹 목록 업데이트
    const groups = (window._territoryGroups || []).map((g, i) => i === idx ? newName : g);
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { territoryGroups: groups });
    window._territoryGroups = groups;

    // 해당 그룹 구역들 category 일괄 변경
    for (const t of affectedTerritories) {
      await window._updateDoc(window._doc(window._db, 'territories', t.id), { category: newName });
      t.category = newName;
    }

    renderGroupChipsInSettings();
    renderCatTabs();
    renderCategorySelects();
    if (typeof renderTerritoryTable === 'function') renderTerritoryTable();
    if (affectedTerritories.length > 0)
      alert(`✅ "${oldName}" → "${newName}" 변경 완료
구역 ${affectedTerritories.length}개도 함께 업데이트됐습니다.`);
  } catch(e) { alert('저장 오류: ' + e.message); renderGroupChipsInSettings(); }
};

// ── 그룹 추가 ──
window.addTerritoryGroup = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const input = document.getElementById('s-group-input');
  const name = (input.value || '').trim();
  if (!name) { alert('그룹 이름을 입력해 주세요.'); return; }
  if ((window._territoryGroups || []).includes(name)) { alert('이미 있는 그룹입니다.'); return; }
  const groups = [...(window._territoryGroups || []), name];
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { territoryGroups: groups });
    window._territoryGroups = groups;
    input.value = '';
    renderGroupChipsInSettings();
    renderCatTabs();
    renderCategorySelects();
  } catch(e) { alert('저장 오류: ' + e.message); }
};

// ── 그룹 삭제 (구역 0개일 때만 허용) ──
window.removeTerritoryGroup = async function(idx) {
  if (!window._db) return;
  const name = (window._territoryGroups || [])[idx];
  const cnt = groupTerritoryCount(name);
  if (cnt > 0) {
    alert(`이 그룹을 사용하는 구역이 ${cnt}개 있습니다.\n먼저 해당 구역들을 다른 그룹으로 변경해 주세요.`);
    return;
  }
  if (!confirm(`"${name}" 그룹을 삭제하시겠습니까?`)) return;
  const groups = (window._territoryGroups || []).filter((_, i) => i !== idx);
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { territoryGroups: groups });
    window._territoryGroups = groups;
    renderGroupChipsInSettings();
    renderCatTabs();
    renderCategorySelects();
  } catch(e) { alert('삭제 오류: ' + e.message); }
};

function renderCatTabs() {
  const groups = window._territoryGroups || [];
  const allT   = window._territories || [];
  // 구역관리 탭 (개수 포함, 밑줄 스타일)
  const wrap = document.getElementById('cat-tabs');
  if (wrap) {
    const active = window._currentCategory || '전체';
    const totalCount = allT.length;
    let html = `<button class="terr-type-tab${active==='전체'?' active':''}" onclick="filterTerritory('전체',this)">전체 <span class="cnt">(${totalCount})</span></button>`;
    html += groups.map(g => {
      const c = allT.filter(t => t.category === g).length;
      const gEsc = g.replace(/'/g,"\'");
      return `<button class="terr-type-tab${active===g?' active':''}" onclick="filterTerritory('${gEsc}',this)">${g} <span class="cnt">(${c})</span></button>`;
    }).join('');
    wrap.innerHTML = html;
  }
  // 지도 범례
  const lgd = document.getElementById('map-legend-groups');
  if (lgd) {
    const _bgP2=['#DBEAFE','#DCFCE7','#FEF3C7','#FEE2E2','#F1F5F9','#EDE9FE','#ECFEFF'];
    lgd.innerHTML = groups.map((g,i)=>`<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:#64748B"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${_bgP2[i%_bgP2.length]}"></span>${g}</span>`).join('');
  }
  // 스케줄(배정) 탭
  const swrap = document.getElementById('sched-cat-chips');
  if (swrap) {
    swrap.innerHTML = `<button class="sched-filter-chip active" onclick="setSchedCatFilter('',this)">전체</button>` +
      groups.map(g => `<button class="sched-filter-chip" onclick="setSchedCatFilter('${g.replace(/'/g,"\'")}',this)">${g}</button>`).join('');
  }
}

function renderCategorySelects() {
  const groups = window._territoryGroups || [];
  const opts = groups.map(g => `<option value="${g}">${g}</option>`).join('');
  ['t-category','edit-category','u-category'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = opts || '<option value="">그룹 없음</option>';
    if (groups.includes(cur)) el.value = cur;
  });
  // 편집 탭 칩도 갱신
  const chipWrap = document.getElementById('edit-category-chips');
  if (chipWrap) {
    chipWrap.innerHTML = groups.map(g =>
      `<button type="button" class="cat-chip" data-val="${g}" onclick="selectCatChip(this)">${g}</button>`
    ).join('');
  }
}

window.saveNaverClientId = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const val  = (document.getElementById('s-naver-key').value || '').trim();
  const msgEl = document.getElementById('s-naver-msg');
  function showMsg(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = ok ? '#16A34A' : '#EF4444';
    msgEl.style.display = 'block';
    setTimeout(function() { msgEl.style.display = 'none'; }, 4000);
  }
  if (!val) { showMsg('Client ID를 입력해 주세요.', false); return; }
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), { naverClientId: val });
    window._naverClientId = val;
    // 아직 로드 안 됐으면 즉시 로드
    window._naverMapsLoaded = false;
    if (typeof window._loadNaverMaps === 'function') window._loadNaverMaps(val);
    showMsg('✅ 저장됐습니다. 지도 기능이 활성화됩니다.', true);
  } catch(e) { showMsg('저장 오류: ' + e.message, false); }
};

// ── 인도자 인증 방식 ──────────────────────────────────────────────
window.onLeaderAuthModeChange = function() {
  const mode = document.querySelector('input[name="leaderAuthMode"]:checked')?.value || 'individual';
  const sharedWrap  = document.getElementById('s-shared-pin-wrap');
  const cartWrap    = document.getElementById('s-cart-pw-wrap');
  const descEl      = document.getElementById('s-cart-pw-desc');
  const indLbl      = document.getElementById('s-auth-individual-lbl');
  const shdLbl      = document.getElementById('s-auth-shared-lbl');

  // 선택된 라벨 강조
  if (indLbl) indLbl.style.borderColor = mode === 'individual' ? '#1B3A6B' : '#E2E8F0';
  if (shdLbl) shdLbl.style.borderColor = mode === 'shared'     ? '#1B3A6B' : '#E2E8F0';

  if (mode === 'shared') {
    if (sharedWrap) sharedWrap.style.display = 'block';
    if (cartWrap)   cartWrap.style.display   = 'none';   // 공용 암호가 전시대도 커버
  } else {
    if (sharedWrap) sharedWrap.style.display = 'none';
    if (cartWrap)   cartWrap.style.display   = 'block';
    if (descEl)     descEl.textContent = '개인 PIN 방식 — 전시대봉사 인도자 전용 추가 암호를 설정합니다.';
  }
};

window.saveLeaderAuthSettings = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const msgEl = document.getElementById('s-auth-msg');
  function showMsg(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = ok ? '#166534' : '#DC2626';
    msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3500);
  }

  const mode = document.querySelector('input[name="leaderAuthMode"]:checked')?.value || 'individual';
  let sharedPin = '';

  if (mode === 'shared') {
    sharedPin = (document.getElementById('s-shared-leader-pin')?.value || '').trim();
    if (!sharedPin) { showMsg('공용 암호를 입력해 주세요.', false); return; }
    if (!/^\d+$/.test(sharedPin)) { showMsg('숫자만 입력 가능합니다.', false); return; }
    if (sharedPin.length < 4)     { showMsg('4자리 이상 입력해 주세요.', false); return; }
  }

  try {
    // config/auth — 인도자 인증 방식 (setDoc merge로 신규/업데이트 모두 처리)
    await window._setDoc(
      window._doc(window._db, 'config', 'auth'),
      { leaderAuthMode: mode, sharedLeaderPin: sharedPin },
      { merge: true }
    );

    // 개인 방식일 때 전시대봉사 별도 암호 저장
    if (mode === 'individual') {
      const cartPw = (document.getElementById('s-cart-admin-pw')?.value || '').trim();
      if (cartPw) {
        if (!/^\d+$/.test(cartPw)) { showMsg('전시대봉사 암호: 숫자만 입력 가능합니다.', false); return; }
        if (cartPw.length < 4)     { showMsg('전시대봉사 암호: 4자리 이상 입력해 주세요.', false); return; }
        await window._updateDoc(window._doc(window._db, 'admin', 'config'), { cartAdminPw: cartPw });
      }
    }

    showMsg('✅ 인도자 인증 설정이 저장되었습니다.', true);
  } catch(e) { showMsg('저장 오류: ' + e.message, false); }
};

window.saveCartPasswords = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const adminPw = (document.getElementById('s-cart-admin-pw').value || '').trim();
  const msgEl   = document.getElementById('s-cart-pw-msg');
  function showMsg(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    msgEl.style.color = ok ? '#166534' : '#DC2626';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  }
  if (!adminPw) { showMsg('비밀번호를 입력해 주세요.', false); return; }
  if (!/^\d+$/.test(adminPw)) { showMsg('숫자만 입력 가능합니다.', false); return; }
  if (adminPw.length < 4)     { showMsg('4자리 이상 입력해 주세요.', false); return; }
  try {
    await window._updateDoc(window._doc(window._db, 'admin', 'config'), {
      cartAdminPw: adminPw
    });
    showMsg('✅ 인도자 공용 비밀번호가 저장되었습니다.', true);
  } catch(e) { showMsg('저장 오류: ' + e.message, false); }
};

window.changePassword = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  const cur     = document.getElementById('s-pw-current').value.trim();
  const next    = document.getElementById('s-pw-new').value.trim();
  const confirm = document.getElementById('s-pw-confirm').value.trim();
  const msgEl   = document.getElementById('s-pw-msg');

  function showMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.style.color = ok ? '#16A34A' : '#EF4444';
    msgEl.style.display = 'block';
    setTimeout(function() { msgEl.style.display = 'none'; }, 3000);
  }

  if (!cur || !next || !confirm) { showMsg('모든 항목을 입력해 주세요.', false); return; }
  if (next.length < 4)           { showMsg('새 비밀번호는 4자리 이상이어야 합니다.', false); return; }
  if (next !== confirm)          { showMsg('새 비밀번호가 일치하지 않습니다.', false); return; }

  try {
    const adminDoc = await window._getDoc(window._doc(window._db, 'admin', 'config'));
    if (!adminDoc.exists()) { showMsg('관리자 설정을 찾을 수 없습니다.', false); return; }
    if (adminDoc.data().password !== cur) { showMsg('현재 비밀번호가 올바르지 않습니다.', false); return; }

    await window._updateDoc(window._doc(window._db, 'admin', 'config'), {
      password: next,
      passwordChangedAt: window._serverTimestamp()
    });
    showMsg('비밀번호가 변경되었습니다.', true);
    document.getElementById('s-pw-current').value = '';
    document.getElementById('s-pw-new').value = '';
    document.getElementById('s-pw-confirm').value = '';
  } catch(e) { showMsg('오류: ' + e.message, false); }
};

window.resetAdminPassword = async function() {
  if (!window._db) { alert('로그인 후 이용 가능합니다.'); return; }
  if (!confirm('관리자 비밀번호를 초기화하시겠습니까?\n\n초기화 후 자동으로 로그아웃되며,\n다음 접속 시 새 비밀번호를 설정하게 됩니다.')) return;
  try {
    await window._deleteDoc(window._doc(window._db, 'admin', 'config'));
    alert('초기화 완료. 다시 로그인해 주세요.');
    logout();
  } catch(e) { alert('오류: ' + e.message); }
};
