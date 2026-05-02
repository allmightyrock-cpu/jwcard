// ══ S-13 구역 배정 기록 ══
// 공식 S-13-KO 양식 기준 (A4 세로, 10열, 20행/페이지)

var _S13_PER_PAGE = 20;

// ── 기간 선택기 초기화 (기본: 오늘 기준 최근 6개월) ──
function initS13DateRange() {
  var elStart = document.getElementById('s13-start');
  var elEnd   = document.getElementById('s13-end');
  if (!elStart || !elEnd) return;
  if (elStart.value && elEnd.value) return;
  var today  = new Date();
  var sixAgo = new Date(today);
  sixAgo.setMonth(sixAgo.getMonth() - 6);
  elStart.value = _s13ToInputDate(sixAgo);
  elEnd.value   = _s13ToInputDate(today);
}

function _s13ToInputDate(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function _s13GetRange() {
  var sv = (document.getElementById('s13-start') || {}).value || '';
  var ev = (document.getElementById('s13-end')   || {}).value || '';
  return {
    start: sv ? new Date(sv + 'T00:00:00') : null,
    end:   ev ? new Date(ev + 'T23:59:59') : null
  };
}

function _s13RangeLabel(range) {
  var s = range.start ? s13Fmt(range.start) : '';
  var e = range.end   ? s13Fmt(range.end)   : '';
  if (!s && !e) return '';
  return s + ' ~ ' + e;
}

// ── 날짜로 봉사연도 계산 ──
function _s13ServiceYear(d) {
  if (!d) { var n = new Date(); return n.getMonth() >= 8 ? n.getFullYear() + 1 : n.getFullYear(); }
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}

// ── 날짜 파싱 ──
function s13ParseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (v.toDate)  return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  var d = new Date(v);
  return isNaN(d) ? null : d;
}

// ── YYYY.MM.DD ──
function s13Fmt(v) {
  var d = s13ParseDate(v);
  if (!d) return '';
  return d.getFullYear() + '.'
    + String(d.getMonth() + 1).padStart(2, '0') + '.'
    + String(d.getDate()).padStart(2, '0');
}

// ── YY.MM.DD (인쇄용 단축) ──
function s13FmtShort(v) {
  var s = s13Fmt(v);
  return s ? s.slice(2) : '';
}

// ── 날짜 범위 내 여부 ──
function s13InRange(v, range) {
  var d = s13ParseDate(v);
  if (!d) return false;
  if (range.start && d < range.start) return false;
  if (range.end   && d > range.end)   return false;
  return true;
}

// ── 구역별 S-13 행 데이터 생성 (항상 반환, 기간 내 기록만 채움) ──
function buildS13Row(t, range) {
  var history = t.cycleHistory || [];

  // 전체 이력 중 가장 최근 완료일
  var lastCompleted = '';
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].completedAt) { lastCompleted = history[i].completedAt; break; }
  }

  // 선택 기간 내 완료된 이력만
  var assignments = history
    .filter(function(h) { return s13InRange(h.completedAt, range); })
    .map(function(h) {
      return {
        publishers:    (h.publishers || []).join(', '),
        assignedDate:  h.assignedAt  || '',
        completedDate: h.completedAt || ''
      };
    });

  // 현재 진행 중인 배정은 항상 포함
  if (t.assignedPublishers && t.assignedPublishers.length > 0) {
    assignments.push({
      publishers:    t.assignedPublishers.join(', '),
      assignedDate:  t.lastAssignedDate || '',
      completedDate: ''
    });
  } else if (t.personalAssignee) {
    // 개인구역: assignedPublishers가 없어도 담당자를 진행중으로 표시
    assignments.push({
      publishers:    t.personalAssignee,
      assignedDate:  t.personalAssignedDate || t.lastAssignedDate || '',
      completedDate: ''
    });
  }

  return {
    no:            String(t.no || ''),
    name:          t.name || '',
    lastCompleted: lastCompleted,
    assignments:   assignments.slice(0, 4)
  };
}

// ══ 미리보기 렌더링 (화면용) ══
window.renderS13Preview = function() {
  var range = _s13GetRange();
  var cong  = window._congregation || '';
  var list  = (window._territories || [])
    .slice()
    .sort(function(a, b) { return parseInt(a.no || 0) - parseInt(b.no || 0); });
  var rows  = list.map(function(t) { return buildS13Row(t, range); });
  var rlabel = _s13RangeLabel(range);

  // ── 헤더 ──
  var bdrH = 'border:1px solid #888;padding:5px 4px;text-align:center;';
  var thead =
    '<tr style="background:#D9D9D9;color:#404040;font-size:10px;font-weight:700">'
  + '<th rowspan="2" style="' + bdrH + 'vertical-align:middle;width:44px">구역<br>번호</th>'
  + '<th rowspan="2" style="' + bdrH + 'vertical-align:middle;width:84px;border-left:2px solid #555">마지막으로<br>완료 한 날짜*</th>'
  + '<th colspan="2" style="' + bdrH + 'border-left:2px solid #555">배정 된 전도인</th>'
  + '<th colspan="2" style="' + bdrH + 'border-left:1.5px solid #777">배정 된 전도인</th>'
  + '<th colspan="2" style="' + bdrH + 'border-left:1.5px solid #777">배정 된 전도인</th>'
  + '<th colspan="2" style="' + bdrH + 'border-left:1.5px solid #777">배정 된 전도인</th>'
  + '</tr>'
  + '<tr style="background:#D9D9D9;color:#404040;font-size:9px;font-weight:600">'
  + '<th style="' + bdrH + 'border-left:2px solid #555">배정 날짜</th><th style="' + bdrH + '">완료 날짜</th>'
  + '<th style="' + bdrH + 'border-left:1.5px solid #777">배정 날짜</th><th style="' + bdrH + '">완료 날짜</th>'
  + '<th style="' + bdrH + 'border-left:1.5px solid #777">배정 날짜</th><th style="' + bdrH + '">완료 날짜</th>'
  + '<th style="' + bdrH + 'border-left:1.5px solid #777">배정 날짜</th><th style="' + bdrH + '">완료 날짜</th>'
  + '</tr>';

  // ── 데이터 행 ──
  var bdr  = 'border:1px solid #C0C8D0;';
  var bL2  = 'border-left:2px solid #888;';
  var bL1  = 'border-left:1.5px solid #AAA;';

  var tbody = rows.map(function(r, ri) {
    var bgA = ri % 2 === 0 ? '#fff'    : '#F8FAFC';
    var bgD = ri % 2 === 0 ? '#F3F6FF' : '#EBF0FF';
    var slots = [0,1,2,3].map(function(i) {
      return r.assignments[i] || { publishers:'', assignedDate:'', completedDate:'' };
    });
    var rowA = '<tr style="background:' + bgA + '">'
      + '<td rowspan="2" style="' + bdr + 'font-weight:700;color:#1B3A6B;text-align:center;vertical-align:middle;font-size:12px;width:44px">' + r.no + '</td>'
      + '<td rowspan="2" style="' + bdr + bL2 + 'font-size:11px;text-align:center;vertical-align:middle;color:#374151">' + s13Fmt(r.lastCompleted) + '</td>'
      + slots.map(function(s, si) {
          var lb = si === 0 ? bL2 : bL1;
          var go = s.publishers && !s.completedDate;
          return '<td colspan="2" style="' + bdr + lb + 'font-size:11px;font-weight:' + (s.publishers ? '600' : '400') + ';padding:3px 6px;color:' + (go ? '#1D4ED8' : '#1E293B') + '">' + (s.publishers || '') + '</td>';
        }).join('')
      + '</tr>';
    var rowB = '<tr style="background:' + bgD + '">'
      + slots.map(function(s, si) {
          var lb = si === 0 ? bL2 : bL1;
          var go = s.publishers && !s.completedDate;
          return '<td style="' + bdr + lb + 'font-size:10px;color:#64748B;text-align:center;padding:2px 3px">' + s13Fmt(s.assignedDate) + '</td>'
               + '<td style="' + bdr + 'font-size:10px;text-align:center;padding:2px 3px;color:' + (go ? '#B45309' : '#64748B') + ';font-weight:' + (go ? '600' : '400') + '">' + (go ? '진행중' : s13Fmt(s.completedDate)) + '</td>';
        }).join('')
      + '</tr>';
    return rowA + rowB;
  }).join('');

  var el = document.getElementById('s13-preview');
  if (!el) return;
  el.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
  + '<div><span style="font-size:15px;font-weight:700;color:#1B3A6B">구역 배정 기록</span>'
  + (cong ? '<span style="font-size:12px;color:#64748B;margin-left:10px">| ' + cong + '</span>' : '') + '</div>'
  + '<span style="font-size:12px;color:#374151">'
  + (rlabel ? '검사 기간 <strong>' + rlabel + '</strong>&nbsp;|&nbsp;' : '')
  + '총 <strong>' + rows.length + '</strong>개 구역</span>'
  + '</div>'
  + '<div style="overflow-x:auto">'
  + '<table style="border-collapse:collapse;min-width:680px;width:100%;font-family:\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;border:2px solid #555">'
  + '<thead>' + thead + '</thead><tbody>' + tbody + '</tbody>'
  + '</table></div>'
  + '<div style="font-size:11px;color:#64748B;margin-top:8px;padding:6px 10px;background:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0">'
  + '* 새로운 시트를 사용할 때 이 열을 사용하여 각 구역을 마지막으로 완료한 날짜를 기록하십시오.</div>'
  + '<div style="font-size:11px;color:#3B82F6;margin-top:6px">💡 <strong>진행중</strong> = 현재 배정됐으나 완료 처리 전 &nbsp;|&nbsp; 배정 날짜는 완료 처리 시 기록됩니다.</div>';
};


// ══ 인쇄 / PDF (공식 S-13 양식 기준) ══
window.printS13 = function() {
  var range       = _s13GetRange();
  var cong        = window._congregation || '';
  var serviceYear = _s13ServiceYear(range.end || range.start || null);
  var list        = (window._territories || [])
    .slice()
    .sort(function(a, b) { return parseInt(a.no || 0) - parseInt(b.no || 0); });
  var rows        = list.map(function(t) { return buildS13Row(t, range); });

  // 페이지 분할 (20개씩)
  var pages = [];
  for (var i = 0; i < rows.length; i += _S13_PER_PAGE) {
    pages.push(rows.slice(i, i + _S13_PER_PAGE));
  }
  if (!pages.length) pages.push([]);
  var totalPages = pages.length;

  var pageHtml = pages.map(function(pageRows, pi) {
    // 빈 행으로 채우기
    while (pageRows.length < _S13_PER_PAGE) pageRows.push(null);

    var dataRows = pageRows.map(function(r, ri) {
      var bgA = ri % 2 === 0 ? '#ffffff' : '#F9FAFB';
      var bgB = ri % 2 === 0 ? '#F3F5FF' : '#ECF0FF';

      if (!r) {
        return '<tr class="tr-a" style="background:' + bgA + '">'
          + '<td class="c-no" rowspan="2"></td><td class="c-last" rowspan="2"></td>'
          + '<td class="c-pub g1" colspan="2"></td><td class="c-pub g2" colspan="2"></td>'
          + '<td class="c-pub g3" colspan="2"></td><td class="c-pub g4" colspan="2"></td>'
          + '</tr>'
          + '<tr class="tr-b" style="background:' + bgB + '">'
          + '<td class="c-dt g1"></td><td class="c-dt"></td>'
          + '<td class="c-dt g2"></td><td class="c-dt"></td>'
          + '<td class="c-dt g3"></td><td class="c-dt"></td>'
          + '<td class="c-dt g4"></td><td class="c-dt"></td>'
          + '</tr>';
      }

      var slots = [0,1,2,3].map(function(i) {
        var a = r.assignments[i] || {};
        var go = !!(a.publishers && !a.completedDate);
        return { pub: a.publishers || '', adate: s13FmtShort(a.assignedDate), cdate: go ? '진행중' : s13FmtShort(a.completedDate), go: go };
      });

      return '<tr class="tr-a" style="background:' + bgA + '">'
        + '<td class="c-no" rowspan="2">' + r.no + '</td>'
        + '<td class="c-last" rowspan="2">' + s13FmtShort(r.lastCompleted) + '</td>'
        + slots.map(function(s, si) {
            return '<td class="c-pub g' + (si+1) + (s.go ? ' c-ongoing' : '') + '" colspan="2">' + s.pub + '</td>';
          }).join('')
        + '</tr>'
        + '<tr class="tr-b" style="background:' + bgB + '">'
        + slots.map(function(s, si) {
            return '<td class="c-dt g' + (si+1) + '">' + s.adate + '</td>'
                 + '<td class="c-dt' + (s.go ? ' c-ongoing' : '') + '">' + s.cdate + '</td>';
          }).join('')
        + '</tr>';
    }).join('');

    return '<div' + (pi > 0 ? ' class="pb"' : '') + '>'
      + '<div class="doc-title">구역 배정 기록</div>'
      + '<div class="doc-year-row"><span class="doc-year-label">봉사 연도:</span><span class="doc-year-val">' + serviceYear + '</span></div>'
      + '<table class="s13t">'
      + '<colgroup><col class="col-no"><col class="col-last">'
      + '<col class="col-dt"><col class="col-dt"><col class="col-dt"><col class="col-dt">'
      + '<col class="col-dt"><col class="col-dt"><col class="col-dt"><col class="col-dt">'
      + '</colgroup>'
      + '<thead>'
      + '<tr class="th1">'
      + '<th rowspan="2" class="h-no">구역<br>번호</th>'
      + '<th rowspan="2" class="h-last">마지막으로<br>완료 한 날짜*</th>'
      + '<th colspan="2" class="h-g g1">배정 된 전도인</th>'
      + '<th colspan="2" class="h-g g2">배정 된 전도인</th>'
      + '<th colspan="2" class="h-g g3">배정 된 전도인</th>'
      + '<th colspan="2" class="h-g g4">배정 된 전도인</th>'
      + '</tr>'
      + '<tr class="th2">'
      + '<th class="h-d g1">배정 날짜</th><th class="h-d">완료 날짜</th>'
      + '<th class="h-d g2">배정 날짜</th><th class="h-d">완료 날짜</th>'
      + '<th class="h-d g3">배정 날짜</th><th class="h-d">완료 날짜</th>'
      + '<th class="h-d g4">배정 날짜</th><th class="h-d">완료 날짜</th>'
      + '</tr>'
      + '</thead>'
      + '<tbody>' + dataRows + '</tbody>'
      + '</table>'
      + '<div class="footnote">* 새로운 시트를 사용할 때 이 열을 사용하여 각 구역을 마지막으로 완료한 날짜를 기록하십시오.</div>'
      + '<div class="doc-footer">'
      + '<span class="s13-code">S-13-KO</span>'
      + '<span class="s13-page">' + (pi + 1) + '/' + totalPages + '</span>'
      + '</div>'
      + '</div>';
  }).join('');

  var css = [
    '* { box-sizing:border-box; margin:0; padding:0; }',
    'body { font-family:"KoPub돋움체 Light","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif; font-size:9pt; color:#000; background:#fff; }',
    '@page { size: A4 portrait; margin: 19mm 12.7mm 17mm 12.7mm; }',
    '.pb { page-break-before: always; }',
    '.doc-title { font-family:"KoPub돋움체 Bold","Malgun Gothic",sans-serif; font-size:12.5pt; font-weight:700; text-align:center; margin-bottom:1.5mm; }',
    '.doc-year-row { text-align:left; margin-bottom:2mm; }',
    '.doc-year-label { font-size:10.5pt; font-weight:700; }',
    '.doc-year-val   { font-size:10.5pt; font-weight:700; margin-left:4pt; border-bottom:1pt solid #000; padding-bottom:1pt; display:inline-block; min-width:14mm; }',
    '.s13t { width:100%; border-collapse:collapse; table-layout:fixed; border:2pt solid #000; }',
    '.col-no   { width:6.74%; }',
    '.col-last { width:12.13%; }',
    '.col-dt   { width:10.14%; }',
    '.s13t thead th { background:#D9D9D9; color:#404040; font-size:8pt; font-weight:700; text-align:center; vertical-align:middle; padding:2pt; line-height:1.4; border:0.5pt solid #888; }',
    '.h-no   { border-left:2pt solid #000 !important; border-top:2pt solid #000 !important; }',
    '.h-last { border-left:2pt solid #000 !important; border-top:2pt solid #000 !important; }',
    '.h-g    { border-top:2pt solid #000 !important; }',
    '.h-d    { border-bottom:1.5pt solid #666 !important; }',
    '.g1 { border-left:2pt solid #000 !important; }',
    '.g2,.g3,.g4 { border-left:1.5pt solid #555 !important; }',
    '.s13t tbody td { border:0.5pt solid #B0B8C0; padding:1pt 2pt; vertical-align:middle; }',
    '.c-no   { text-align:center; font-size:9pt; font-weight:700; color:#000; border-left:2pt solid #000 !important; }',
    '.c-last { text-align:center; font-size:8pt; color:#000; border-left:2pt solid #000 !important; }',
    '.c-pub  { font-size:8.5pt; padding:2pt 4pt; }',
    '.c-dt   { text-align:center; font-size:7.5pt; color:#1A1A1A; }',
    '.c-ongoing { color:#92400E; font-weight:700; }',
    '.tr-a { height:16pt; }',
    '.tr-b { height:14pt; }',
    '.s13t tbody tr:last-child td { border-bottom:2pt solid #000 !important; }',
    '.s13t tbody td:last-child    { border-right:2pt solid #000 !important; }',
    '.footnote { font-size:9pt; color:#333; margin-top:2mm; line-height:1.5; }',
    '.doc-footer { display:flex; justify-content:space-between; align-items:center; margin-top:2mm; font-size:8pt; color:#444; }',
    '.s13-code { font-size:9pt; font-weight:600; }',
    '.s13-page { font-size:8pt; color:#888; }'
  ].join('\n');

  var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
    + '<title>구역 배정 기록 S-13 ' + serviceYear + ' 봉사연도</title>'
    + '<style>' + css + '</style></head><body>'
    + pageHtml
    + '<script>window.onload=function(){window.print();setTimeout(function(){window.close();},2500);};<\/script>'
    + '</body></html>';

  var w = window.open('', '_blank', 'width=900,height=750,scrollbars=yes');
  if (!w) { alert('팝업이 차단되었습니다.\n브라우저 주소창 오른쪽의 팝업 허용 후 다시 시도해 주세요.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
};


// ══ Excel 다운로드 ══
window.downloadS13Excel = function() {
  if (typeof XLSX === 'undefined') { alert('Excel 라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
  var range       = _s13GetRange();
  var cong        = window._congregation || '';
  var serviceYear = _s13ServiceYear(range.end || range.start || null);
  var rlabel      = _s13RangeLabel(range);
  var list        = (window._territories || [])
    .slice()
    .sort(function(a, b) { return parseInt(a.no || 0) - parseInt(b.no || 0); });

  var dataRows = [];
  list.forEach(function(t) {
    var r    = buildS13Row(t, range);
    var rowA = [r.no, s13Fmt(r.lastCompleted)];
    var rowB = ['', ''];
    [0,1,2,3].forEach(function(i) {
      var a  = r.assignments[i] || {};
      var go = !!(a.publishers && !a.completedDate);
      rowA.push(a.publishers || '');
      rowA.push('');
      rowB.push(s13Fmt(a.assignedDate));
      rowB.push(go ? '진행중' : s13Fmt(a.completedDate));
    });
    dataRows.push(rowA);
    dataRows.push(rowB);
  });

  var wsData = [
    ['구역 배정 기록 (S-13)'],
    ['회중명: ' + cong, '', '봉사 연도: ' + serviceYear + (rlabel ? '  |  검사 기간: ' + rlabel : '')],
    [],
    ['구역 번호', '마지막으로\n완료 한 날짜*',
      '배정 된 전도인', '', '배정 된 전도인', '', '배정 된 전도인', '', '배정 된 전도인', ''],
    ['', '', '배정 날짜', '완료 날짜', '배정 날짜', '완료 날짜', '배정 날짜', '완료 날짜', '배정 날짜', '완료 날짜']
  ].concat(dataRows).concat([
    [],
    ['* 새로운 시트를 사용할 때 이 열을 사용하여 각 구역을 마지막으로 완료한 날짜를 기록하십시오.']
  ]);

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:8},{wch:16},{wch:16},{wch:14},{wch:16},{wch:14},{wch:16},{wch:14},{wch:16},{wch:14}];
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:9}},
    {s:{r:3,c:2},e:{r:3,c:3}},{s:{r:3,c:4},e:{r:3,c:5}},
    {s:{r:3,c:6},e:{r:3,c:7}},{s:{r:3,c:8},e:{r:3,c:9}},
    {s:{r:3,c:0},e:{r:4,c:0}},{s:{r:3,c:1},e:{r:4,c:1}}
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S-13');
  XLSX.writeFile(wb, 'S-13_' + serviceYear + '봉사연도_' + (cong || '구역배정기록') + '.xlsx');
};


// ══════════════════════════════════════════════════════
// S-13 기록 관리 (편집 / 삭제 / 기간 일괄 삭제)
// ══════════════════════════════════════════════════════

// ── 서브탭 전환 ──
window.s13SwitchSubtab = function(tab) {
  var isPreview = (tab === 'preview');
  document.getElementById('s13-panel-preview').style.display = isPreview ? '' : 'none';
  document.getElementById('s13-panel-manage').style.display  = isPreview ? 'none' : '';

  var stPrev = document.getElementById('s13-st-preview');
  var stMgmt = document.getElementById('s13-st-manage');
  if (stPrev) {
    stPrev.style.color       = isPreview ? '#1B3A6B' : '#94A3B8';
    stPrev.style.borderBottomColor = isPreview ? '#1B3A6B' : 'transparent';
  }
  if (stMgmt) {
    stMgmt.style.color       = isPreview ? '#94A3B8' : '#1B3A6B';
    stMgmt.style.borderBottomColor = isPreview ? 'transparent' : '#1B3A6B';
  }

  // 기록관리 탭 진입 시 날짜 기본값 설정
  if (!isPreview) {
    var ms = document.getElementById('s13m-start');
    var me = document.getElementById('s13m-end');
    if (ms && !ms.value) {
      var today = new Date();
      var sixAgo = new Date(today); sixAgo.setMonth(sixAgo.getMonth() - 6);
      ms.value = _s13ToInputDate(sixAgo);
      me.value = _s13ToInputDate(today);
    }
  }
};

// ── 관리 목록 로드·렌더링 ──
window.renderS13Manager = function() {
  var startVal = (document.getElementById('s13m-start') || {}).value || '';
  var endVal   = (document.getElementById('s13m-end')   || {}).value || '';
  var range    = {
    start: startVal ? new Date(startVal + 'T00:00:00') : null,
    end:   endVal   ? new Date(endVal   + 'T23:59:59') : null
  };

  var territories = (window._territories || []).slice()
    .sort(function(a, b) { return parseInt(a.no || 0) - parseInt(b.no || 0); });

  // 기간 내 cycleHistory 항목을 플랫 리스트로 수집
  var records = [];
  territories.forEach(function(t) {
    var hist = t.cycleHistory || [];
    hist.forEach(function(h, idx) {
      if (!range.start && !range.end) {
        records.push({ terId: t.id, no: t.no||'', name: t.name||'', h: h, histIdx: idx });
        return;
      }
      // 배정일 또는 완료일이 기간 내이면 포함
      var inRange = s13InRange(h.completedAt, range) || s13InRange(h.assignedAt, range);
      if (inRange) records.push({ terId: t.id, no: t.no||'', name: t.name||'', h: h, histIdx: idx });
    });
  });

  var tableEl = document.getElementById('s13m-table');
  var toolbar = document.getElementById('s13m-toolbar');
  if (!tableEl) return;

  if (!records.length) {
    tableEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94A3B8;font-size:13px;border:1.5px dashed #E2E8F0;border-radius:10px">해당 기간에 배정 기록이 없습니다.</div>';
    if (toolbar) toolbar.style.display = 'none';
    return;
  }

  if (toolbar) {
    toolbar.style.display = 'flex';
    document.getElementById('s13m-sel-count').textContent = '총 ' + records.length + '건';
  }

  var rows = records.map(function(r, i) {
    var pubs = Array.isArray(r.h.publishers) ? r.h.publishers.join(', ') : (r.h.publishers || '');
    var aDate = s13Fmt(r.h.assignedAt)  || '—';
    var cDate = r.h.completedAt ? s13Fmt(r.h.completedAt) : '<span style="color:#B45309;font-weight:600">진행중</span>';
    return '<tr style="border-bottom:1px solid #F1F5F9">'
      + '<td style="padding:8px 10px;text-align:center"><input type="checkbox" class="s13m-chk" data-idx="' + i + '" onchange="s13UpdateSelCount()"></td>'
      + '<td style="padding:8px 6px;font-weight:700;color:#1B3A6B;text-align:center">' + r.no + '</td>'
      + '<td style="padding:8px 6px;font-size:12px;color:#374151;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r.name + '">' + r.name + '</td>'
      + '<td style="padding:8px 6px;font-size:12px;color:#1E293B">' + pubs + '</td>'
      + '<td style="padding:8px 6px;font-size:12px;color:#64748B;white-space:nowrap">' + aDate + '</td>'
      + '<td style="padding:8px 6px;font-size:12px;white-space:nowrap">' + cDate + '</td>'
      + '<td style="padding:8px 6px;white-space:nowrap">'
      +   '<button class="btn btn-sm" onclick="s13OpenEdit(' + i + ')" style="font-size:11px;padding:3px 9px;margin-right:4px">✏ 편집</button>'
      +   '<button class="btn btn-sm" onclick="s13DeleteOne(' + i + ')" style="font-size:11px;padding:3px 9px;background:#FEF2F2;color:#991B1B;border-color:#FECACA">🗑</button>'
      + '</td>'
      + '</tr>';
  }).join('');

  tableEl.innerHTML =
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<thead><tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0">'
    + '<th style="padding:8px 10px;text-align:center;width:36px"><input type="checkbox" id="s13m-chk-all" onchange="s13CheckAll(this.checked)"></th>'
    + '<th style="padding:8px 6px;text-align:center;color:#475569;font-size:11px;width:50px">구역</th>'
    + '<th style="padding:8px 6px;text-align:left;color:#475569;font-size:11px">구역명</th>'
    + '<th style="padding:8px 6px;text-align:left;color:#475569;font-size:11px">전도인</th>'
    + '<th style="padding:8px 6px;text-align:left;color:#475569;font-size:11px;white-space:nowrap">배정일</th>'
    + '<th style="padding:8px 6px;text-align:left;color:#475569;font-size:11px;white-space:nowrap">완료일</th>'
    + '<th style="padding:8px 6px;text-align:left;color:#475569;font-size:11px">작업</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>'
    + '<div style="font-size:11px;color:#94A3B8;margin-top:8px;text-align:right">총 ' + records.length + '건</div>';

  // 현재 records를 전역 보관 (편집/삭제 시 참조)
  window._s13mRecords = records;
};

// ── 체크박스 전체 선택 ──
window.s13CheckAll = function(checked) {
  document.querySelectorAll('.s13m-chk').forEach(function(el) { el.checked = checked; });
  s13UpdateSelCount();
};

// ── 선택 카운트 업데이트 ──
window.s13UpdateSelCount = function() {
  var cnt = document.querySelectorAll('.s13m-chk:checked').length;
  var total = (window._s13mRecords || []).length;
  var el = document.getElementById('s13m-sel-count');
  if (el) el.textContent = cnt > 0 ? cnt + '건 선택 / 총 ' + total + '건' : '총 ' + total + '건';
};

// ── 편집 모달 열기 ──
window.s13OpenEdit = function(recordIdx) {
  var r = (window._s13mRecords || [])[recordIdx];
  if (!r) return;
  window._s13EditIdx = recordIdx;

  var subtitle = document.getElementById('s13-edit-subtitle');
  if (subtitle) subtitle.textContent = '구역 ' + r.no + ' · ' + r.name;

  var pubs = Array.isArray(r.h.publishers) ? r.h.publishers.join(', ') : (r.h.publishers || '');
  document.getElementById('s13-edit-pub').value = pubs;
  document.getElementById('s13-edit-assigned').value  = r.h.assignedAt  ? _s13ToInputDate(s13ParseDate(r.h.assignedAt))  : '';
  document.getElementById('s13-edit-completed').value = r.h.completedAt ? _s13ToInputDate(s13ParseDate(r.h.completedAt)) : '';

  openModal('s13-edit-modal');
};

// ── 편집 저장 ──
window.s13SaveEdit = async function() {
  var idx = window._s13EditIdx;
  var r   = (window._s13mRecords || [])[idx];
  if (!r) return;

  var pubStr = (document.getElementById('s13-edit-pub').value || '').trim();
  var aStr   = document.getElementById('s13-edit-assigned').value;
  var cStr   = document.getElementById('s13-edit-completed').value;

  if (!pubStr) { alert('전도인 이름을 입력해 주세요.'); return; }

  var publishers   = pubStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var assignedAt   = aStr ? new Date(aStr + 'T00:00:00') : null;
  var completedAt  = cStr ? new Date(cStr + 'T23:59:59') : null;

  try {
    // 해당 구역의 cycleHistory 전체를 가져와서 idx 항목 교체 후 저장
    var territory = (window._territories || []).find(function(t) { return t._id === r.terId; });
    if (!territory) { alert('구역을 찾을 수 없습니다.'); return; }
    var newHistory = (territory.cycleHistory || []).slice();
    newHistory[r.histIdx] = { publishers: publishers, assignedAt: assignedAt, completedAt: completedAt };

    await window._db_updateTerritory(r.terId, { cycleHistory: newHistory });

    // 로컬 캐시 업데이트
    territory.cycleHistory = newHistory;
    closeModal('s13-edit-modal');
    renderS13Manager();
    alert('✅ 저장됐습니다.');
  } catch(e) {
    console.error('S13 편집 오류:', e);
    alert('저장 중 오류가 발생했습니다: ' + e.message);
  }
};

// ── 단건 삭제 ──
window.s13DeleteOne = async function(recordIdx) {
  var r = (window._s13mRecords || [])[recordIdx];
  if (!r) return;
  var pubs = Array.isArray(r.h.publishers) ? r.h.publishers.join(', ') : (r.h.publishers || '');
  if (!confirm('구역 ' + r.no + ' — ' + pubs + '\n이 기록을 삭제하시겠습니까? 복구할 수 없습니다.')) return;
  await _s13RemoveRecords([r]);
  renderS13Manager();
};

// ── 선택 삭제 ──
window.s13DeleteSelected = async function() {
  var checked = Array.from(document.querySelectorAll('.s13m-chk:checked'));
  if (!checked.length) { alert('삭제할 항목을 선택해 주세요.'); return; }
  var records = window._s13mRecords || [];
  var targets = checked.map(function(el) { return records[parseInt(el.dataset.idx)]; }).filter(Boolean);
  if (!confirm(targets.length + '건의 배정 기록을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;
  await _s13RemoveRecords(targets);
  renderS13Manager();
};

// ── 기간 전체 삭제 ──
window.s13DeleteByRange = async function() {
  var records = window._s13mRecords || [];
  if (!records.length) { alert('조회된 기록이 없습니다.'); return; }
  var startVal = (document.getElementById('s13m-start') || {}).value || '';
  var endVal   = (document.getElementById('s13m-end')   || {}).value || '';
  var label    = (startVal || '시작일 없음') + ' ~ ' + (endVal || '종료일 없음');
  if (!confirm('⚠ 기간 전체 삭제\n\n[' + label + ']\n해당 기간의 배정 기록 ' + records.length + '건을 모두 삭제합니다.\n\n삭제 후 복구할 수 없습니다. 계속하시겠습니까?')) return;
  await _s13RemoveRecords(records);
  renderS13Manager();
  alert('✅ ' + records.length + '건이 삭제됐습니다.');
};

// ── 공통 삭제 로직 (여러 records를 구역별로 묶어 한 번에 업데이트) ──
async function _s13RemoveRecords(targets) {
  // terId별로 삭제할 histIdx 모음
  var byTer = {};
  targets.forEach(function(r) {
    if (!byTer[r.terId]) byTer[r.terId] = [];
    byTer[r.terId].push(r.histIdx);
  });

  var terIds = Object.keys(byTer);
  for (var i = 0; i < terIds.length; i++) {
    var terId = terIds[i];
    var territory = (window._territories || []).find(function(t) { return t._id === terId; });
    if (!territory) continue;

    var removeSet = {};
    byTer[terId].forEach(function(idx) { removeSet[idx] = true; });
    var newHistory = (territory.cycleHistory || []).filter(function(_, idx) { return !removeSet[idx]; });

    try {
      await window._db_updateTerritory(terId, { cycleHistory: newHistory });
      territory.cycleHistory = newHistory;
    } catch(e) {
      console.error('삭제 오류 (구역 ' + terId + '):', e);
      alert('삭제 중 오류: ' + e.message);
    }
  }
}
