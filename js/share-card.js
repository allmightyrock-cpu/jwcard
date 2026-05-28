// ══ 전시대봉사 공유 카드 모듈 ══
// 앱 화면을 그대로 캡처하는 대신, 공유 전용으로 "필요한 내용만" 담은
// 깨끗한 카드 DOM을 따로 그려서 이미지로 만든다.
//   - 글자 크게 + 단순 레이아웃(그림자·그라데이션 없음) → 카카오톡 JPEG 재압축에도
//     한글 획이 뭉개지지 않음 (해상도를 키우는 방식보다 가독성이 좋음)
//   - 색상은 CSS 변수(var(--navy)) 대신 실제 hex 값을 직접 사용
//     (분리된 노드에서는 CSS 변수가 적용되지 않아 과거 공유 노드가 깨졌던 원인)
//   - 캡처는 html-to-image(브라우저 네이티브 SVG 렌더 → 텍스트 선명) 우선,
//     없으면 html2canvas 로 폴백
//
// 의존: window.ScheduleTime (js/schedule-time.js)
//       window.htmlToImage (CDN, 선택) / window.html2canvas (폴백)
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') window.ShareCard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 팀별 색상 (accent / 연한 배경) — 평면 색만 사용
  var PALETTE = {
    A: { ac: '#1B3A6B', bg: '#EAF0F9' },
    B: { ac: '#7C3AED', bg: '#F1EAFC' },
    C: { ac: '#B45309', bg: '#FBF1E5' },
    D: { ac: '#047857', bg: '#E6F4EF' },
    E: { ac: '#B91C1C', bg: '#FBE9E9' },
    F: { ac: '#0369A1', bg: '#E6F1F8' }
  };
  var FALLBACK = { ac: '#1B3A6B', bg: '#EAF0F9' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 공유 카드 DOM 생성
  // model = { dateLabel, timeRange, conductor, startStr:"HH:MM", cols:2|3,
  //           teams:[{ key,label,loc,cartPerson,numSlots,rows:[[이름,…],…] }] }
  // opts  = { width:560|'100%'(기본 560px·공유이미지용), highlightName:"내 이름"(본인 행 ★강조) }
  function build(model, opts) {
    opts = opts || {};
    var width = opts.width != null ? (typeof opts.width === 'number' ? opts.width + 'px' : opts.width) : '560px';
    var hl = (opts.highlightName || '').trim();
    var cols = model.cols || 3;
    var ST = window.ScheduleTime;

    var teamsHtml = (model.teams || []).map(function (t) {
      var p = PALETTE[t.key] || FALLBACK;
      var ns = parseInt(t.numSlots) || 2;
      var intv = ST ? ST.interval(ns) : Math.round(60 / ns);

      // 헤더(팀 라벨 · 조 수 · 장소 · 카트담당)
      var head =
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:' + p.bg + ';border:2px solid ' + p.ac + ';border-bottom:none;border-radius:12px 12px 0 0">' +
          '<div style="width:34px;height:34px;border-radius:9px;background:' + p.ac + ';color:#fff;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(t.key) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:19px;font-weight:800;color:' + p.ac + '">' + esc(t.label) +
              ' <span style="font-size:13px;font-weight:600">· ' + ns + '개 조 · ' + intv + '분</span></div>' +
            '<div style="font-size:16px;font-weight:800;color:' + p.ac + ';margin-top:3px">📍 ' + esc(t.loc || '장소 미정') + '</div>' +
            (t.cartPerson ? '<div style="font-size:13px;font-weight:400;color:' + p.ac + ';margin-top:2px">전시대 준비: ' + esc(t.cartPerson) + '</div>' : '') +
          '</div>' +
        '</div>';

      // 표 헤더
      var colLabels = cols === 3 ? ['시간', '봉사자 ①', '봉사자 ②', '추가 ③'] : ['시간', '봉사자 ①', '봉사자 ②'];
      var gridCols = '84px repeat(' + cols + ',1fr)';
      var thead =
        '<div style="display:grid;grid-template-columns:' + gridCols + ';background:' + p.ac + ';color:#fff;font-size:13px;font-weight:700;text-align:center">' +
          colLabels.map(function (l) { return '<div style="padding:9px 4px">' + l + '</div>'; }).join('') +
        '</div>';

      // 행
      var rowsHtml = '';
      for (var i = 0; i < ns; i++) {
        var time = ST ? ST.slotLabel(model.startStr, ns, i) : '';
        var rowArr = (t.rows && t.rows[i]) || [];
        var rowHasMe = false;
        if (hl) { for (var x = 0; x < rowArr.length; x++) { if ((rowArr[x] || '').trim() === hl) { rowHasMe = true; break; } } }
        var cells = '';
        for (var j = 0; j < cols; j++) {
          var name = (rowArr[j] || '').trim();
          var isMe = !!hl && name === hl;
          cells +=
            '<div style="padding:11px 8px;font-size:15px;font-weight:' + (isMe ? '800' : '600') + ';text-align:center;color:' + (isMe ? p.ac : (name ? '#0F172A' : '#CBD5E1')) + ';border-left:1px solid ' + p.ac + '22">' +
              (isMe ? '★ ' : '') + (name ? esc(name) : '—') + '</div>';
        }
        var rowBg = rowHasMe ? p.bg : (i % 2 ? '#F8FAFC' : '#ffffff');
        rowsHtml +=
          '<div style="display:grid;grid-template-columns:' + gridCols + ';border-top:1px solid ' + p.ac + '33;background:' + rowBg + '">' +
            '<div style="padding:11px 4px;text-align:center;font-size:15px;font-weight:700;color:' + p.ac + ';background:' + p.bg + '">' + time + '</div>' +
            cells +
          '</div>';
      }

      return '<div style="margin-bottom:16px">' + head +
        '<div style="border:2px solid ' + p.ac + ';border-top:none;border-radius:0 0 12px 12px;overflow:hidden">' +
          thead + rowsHtml +
        '</div></div>';
    }).join('');

    var header =
      '<div style="padding:18px 16px 14px;border-bottom:2px solid #E2E8F0;margin-bottom:16px">' +
        '<div style="font-size:15px;font-weight:800;color:#1B3A6B;letter-spacing:.5px">전시대봉사 명단</div>' +
        '<div style="font-size:27px;font-weight:800;margin-top:5px;color:#0F172A">' + esc(model.dateLabel) + '</div>' +
        (model.timeRange ? '<div style="font-size:14px;color:#475569;margin-top:7px">🕐 ' + esc(model.timeRange) + '</div>' : '') +
        (model.conductor ? '<div style="font-size:14px;color:#475569;margin-top:3px">🎤 인도자: ' + esc(model.conductor) + '</div>' : '') +
      '</div>';

    var card = document.createElement('div');
    card.style.cssText = 'width:' + width + ';box-sizing:border-box;background:#ffffff;' +
      "font-family:'Noto Sans KR','Malgun Gothic',Arial,sans-serif;color:#0F172A;padding:0 16px 18px";
    card.innerHTML = header + teamsHtml;
    return card;
  }

  // html2canvas 로 캡처 → Blob (폴백 경로)
  function _viaCanvas(node) {
    if (!window.html2canvas) throw new Error('이미지 변환 라이브러리를 찾을 수 없습니다');
    return window.html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      .then(function (canvas) {
        return new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
      });
  }

  // 카드 캡처 → Blob
  // html-to-image 우선(텍스트 선명). 단 skipFonts:true 로 외부(cross-origin)
  // 스타일시트 접근을 막아 SecurityError 를 피한다(모바일 OS 한글 폰트로 렌더).
  // 실패하면 html2canvas 로 자동 폴백.
  function capture(node) {
    if (window.htmlToImage && window.htmlToImage.toBlob) {
      return window.htmlToImage.toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true
      }).then(function (blob) {
        if (!blob) throw new Error('empty blob');
        return blob;
      }).catch(function (e) {
        console.warn('html-to-image 실패, html2canvas로 폴백:', e && e.message);
        return _viaCanvas(node);
      });
    }
    return Promise.resolve().then(function () { return _viaCanvas(node); });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // 공유 카드 생성 → 이미지화 → 네이티브 공유(모바일) 또는 다운로드(PC)
  // 반환: 'shared' | 'downloaded'  (실패 시 reject)
  function share(model, filename, shareTitle) {
    var node = build(model);
    // 0×0 overflow:hidden 래퍼 안 (0,0)에 배치.
    //   - 화면엔 안 보이지만(깜빡임 없음) 카드는 (0,0)에 실제 크기로 레이아웃됨
    //   - html2canvas/html-to-image 는 대상 노드를 독립 렌더하므로 조상 클리핑 영향 없음
    //   - left:-10000px 같은 음수 좌표를 피해 "백지 캡처" 버그 방지
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;z-index:-1;pointer-events:none';
    holder.appendChild(node);
    document.body.appendChild(holder);

    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();

    return ready
      .then(function () { return capture(node); })
      .then(function (blob) {
        if (!blob) throw new Error('이미지 생성 실패');
        var file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: shareTitle || '전시대 봉사 명단' })
            .then(function () { return 'shared'; })
            .catch(function (e) {
              if (e && e.name === 'AbortError') return 'shared'; // 사용자가 취소
              download(blob, filename); return 'downloaded';
            });
        }
        download(blob, filename);
        return 'downloaded';
      })
      .finally(function () {
        if (holder.parentNode) holder.parentNode.removeChild(holder);
      });
  }

  return { build: build, capture: capture, share: share, PALETTE: PALETTE };
});
