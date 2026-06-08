// ══════════════════════════════════════════════════════════════════════
//  territory-image.js — 구역 이미지(애드온) 선택 기능 · 격리 모듈
// ----------------------------------------------------------------------
//  · 기본 OFF. 관리자 설정의 territoryImageAddon(=window._territoryImageAddon)이
//    true일 때만 동작합니다. 꺼져 있으면 모든 함수가 즉시 빠져나갑니다.
//  · 기존 구역 문서(territories)는 건드리지 않습니다. 이미지는 admin 컬렉션의
//    별도 문서 admin/terrimg_<구역문서ID> 에 저장합니다(보안규칙 변경 불필요).
//  · 업로드 시 브라우저에서 자동 축소·압축(가로 1200px, JPEG)하여
//    Firestore 1MB 문서 한계 안에 들어가도록 합니다.
//  · 모든 동작은 try/catch로 감싸 실패해도 다른 기능에 영향을 주지 않습니다.
//
//  ⚠ 개인정보(이름·연락처·세대주 정보)가 보이는 이미지는 올리지 마세요.
// ══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var MAX_DIM   = 1200;     // 가로/세로 최대 px (초과 시 축소)
  var MAX_BYTES = 900 * 1024; // dataURL 최대 크기(약 0.9MB, Firestore 1MB 한계 대비)
  var DOC_PREFIX = 'terrimg_';

  function _enabled() { return !!window._territoryImageAddon; }
  function _ref(id)   { return window._doc(window._db, 'admin', DOC_PREFIX + id); }

  function _setStatus(msg, color) {
    var el = document.getElementById('tc-image-status');
    if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; }
  }

  function _showPreview(dataUrl) {
    var wrap = document.getElementById('tc-image-preview');
    var img  = document.getElementById('tc-image-img');
    var del  = document.getElementById('tc-image-del');
    if (dataUrl) {
      if (img)  img.src = dataUrl;
      if (wrap) wrap.style.display = 'block';
      if (del)  del.style.display = 'inline-block';
    } else {
      if (img)  img.removeAttribute('src');
      if (wrap) wrap.style.display = 'none';
      if (del)  del.style.display = 'none';
    }
  }

  // 파일 → 축소·압축된 JPEG dataURL
  function _compress(file) {
    return new Promise(function (resolve, reject) {
      try {
        var url = URL.createObjectURL(file);
        var im = new Image();
        im.onload = function () {
          try {
            var w = im.naturalWidth, h = im.naturalHeight;
            var scale = Math.min(1, MAX_DIM / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale));
            var ch = Math.max(1, Math.round(h * scale));
            var cv = document.createElement('canvas');
            cv.width = cw; cv.height = ch;
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(im, 0, 0, cw, ch);
            URL.revokeObjectURL(url);
            // PNG 투명 배경 등은 위에서 흰 배경 깔고 JPEG로 통일
            var q = 0.72, out = cv.toDataURL('image/jpeg', q);
            while (out.length > MAX_BYTES && q > 0.35) {
              q -= 0.1; out = cv.toDataURL('image/jpeg', q);
            }
            if (out.length > MAX_BYTES) { reject(new Error('이미지 용량이 너무 큽니다. 더 작은 이미지를 사용해 주세요.')); return; }
            resolve({ data: out, w: cw, h: ch });
          } catch (e) { reject(e); }
        };
        im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
        im.src = url;
      } catch (e) { reject(e); }
    });
  }

  var TI = {};

  // 관리자 구역카드(구역정보 모달)가 열릴 때 호출
  TI.onCardOpen = function (t) {
    try {
      var row = document.getElementById('tc-image-row');
      if (!row) return;
      if (!_enabled() || !t || !t.id) { row.style.display = 'none'; return; }
      window._tiCurrentId = t.id;
      row.style.display = '';
      _showPreview(null);
      _setStatus('불러오는 중…');
      window._getDoc(_ref(t.id)).then(function (snap) {
        if (snap.exists() && snap.data() && snap.data().data) {
          _showPreview(snap.data().data);
          _setStatus('등록됨', '#166534');
        } else {
          _showPreview(null);
          _setStatus('등록된 이미지 없음');
        }
      }).catch(function () { _setStatus('불러오기 실패'); });
    } catch (e) { /* 무시 */ }
  };

  // 파일 선택 시
  TI.onPick = function (input) {
    try {
      if (!_enabled()) return;
      var id = window._tiCurrentId;
      if (!id) { alert('먼저 구역을 선택해 주세요.'); return; }
      var file = input && input.files && input.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { alert('이미지 파일만 올릴 수 있습니다.'); input.value = ''; return; }
      _setStatus('처리 중…');
      _compress(file).then(function (r) {
        return window._setDoc(_ref(id), { data: r.data, w: r.w, h: r.h, updatedAt: Date.now() })
          .then(function () {
            _showPreview(r.data);
            _setStatus('저장됨 ✅', '#166534');
          });
      }).catch(function (e) {
        _setStatus('실패: ' + (e && e.message ? e.message : '오류'), '#B91C1C');
      }).then(function () { try { input.value = ''; } catch (e) {} });
    } catch (e) {
      _setStatus('오류가 발생했습니다.', '#B91C1C');
    }
  };

  // 삭제
  TI.onDelete = function () {
    try {
      if (!_enabled()) return;
      var id = window._tiCurrentId;
      if (!id) return;
      if (!confirm('이 구역의 이미지를 삭제할까요?')) return;
      _setStatus('삭제 중…');
      window._deleteDoc(_ref(id)).then(function () {
        _showPreview(null);
        _setStatus('삭제됨');
      }).catch(function (e) {
        _setStatus('삭제 실패: ' + (e && e.message ? e.message : ''), '#B91C1C');
      });
    } catch (e) { /* 무시 */ }
  };

  window.TerritoryImage = TI;
})();
