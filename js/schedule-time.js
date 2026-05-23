// ══ 전시대봉사 시간 계산 공유 모듈 ══
// 인도자 앱(cart.html)과 신청자 구역카드(publisher.html)가 동일한 슬롯 시간을
// 보이도록 계산 로직을 한 곳으로 모은다. (과거 두 앱이 60/n vs 120/n 으로 달라
// 같은 배정인데 표시 시간이 어긋나는 버그가 있었음)
//
// 규칙: 한 시간(60분)을 numSlots 등분해 매시간 반복 편성.
//   2조→30분, 3조→20분, 4조→15분, 5조→12분, 6조→10분 간격.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ScheduleTime = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INTERVALS = { 1: 60, 2: 30, 3: 20, 4: 15, 5: 12, 6: 10 };

  // numSlots → 슬롯 간 간격(분)
  function interval(n) {
    n = parseInt(n) || 1;
    return INTERVALS[n] || Math.round(60 / n);
  }

  // "오전/오후" + 12시간제 시각 → 24시간제 { h, m }
  function apHmTo24(ap, h, m) {
    var hr = parseInt(h) || 0;
    if (ap === '오후' && hr !== 12) hr += 12;
    if (ap === '오전' && hr === 12) hr = 0;
    return { h: hr, m: parseInt(m) || 0 };
  }

  // 시작 시각(24h) + 슬롯 인덱스 → 해당 슬롯 시각(24h) { h, m }
  function slotHM(startH, startM, n, idx) {
    var tot = (parseInt(startH) || 0) * 60 + (parseInt(startM) || 0) + interval(n) * (parseInt(idx) || 0);
    return { h: Math.floor(tot / 60) % 24, m: tot % 60 };
  }

  // 24시간제 (h, m) → "오전/오후 H:MM"
  function fmt12h(h, m) {
    var ap = h < 12 ? '오전' : '오후';
    var h12 = h % 12 || 12;
    return ap + ' ' + h12 + ':' + String(m).padStart(2, '0');
  }

  // 시작시각 "HH:MM" + 슬롯 인덱스 → "오전/오후 H:MM" (신청자 화면용)
  function slotLabel(startStr, n, idx) {
    var parts = String(startStr || '').split(':');
    var t = slotHM(parts[0], parts[1], n, idx);
    return fmt12h(t.h, t.m);
  }

  // "오전/오후" 12시간제 시작 + 슬롯 인덱스 → "오전/오후 H:MM" (인도자 화면용)
  function calcTime(ap, h, m, n, idx) {
    var s = apHmTo24(ap, h, m);
    var t = slotHM(s.h, s.m, n, idx);
    return fmt12h(t.h, t.m);
  }

  // ── 주간 세션 식별 (인도자/신청자 양쪽이 같은 cartSessions 문서를 가리켜야 함) ──

  // 일정 타입 → 요일(0=일~6=토). id 접두사(mon/tue…) 우선, 없으면 label("월요일"…). 못 찾으면 -1
  function schedTypeToDow(t) {
    var ID_DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    var prefix = ((t && t.id) || '').split('_')[0].toLowerCase();
    if (ID_DOW[prefix] !== undefined) return ID_DOW[prefix];
    var LABEL_DOW = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
    var lbl = (t && t.label) || '';
    for (var k in LABEL_DOW) {
      if (lbl.indexOf(k + '요일') !== -1) return LABEL_DOW[k];
    }
    return -1;
  }

  // 해당 날짜가 속한 주의 월요일(00:00). 일요일은 그 주의 마지막 날로 보고 6일 뺌.
  function weekMonday(now) {
    now = now || new Date();
    var d = now.getDay();
    var m = new Date(now);
    m.setHours(0, 0, 0, 0);
    m.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
    return m;
  }

  // 주차 키 "YYYYMMDD" — 로컬 날짜 기준(UTC 변환 시 +9 지역에서 하루 밀림 방지)
  function weekKey(date) {
    return date.getFullYear()
      + String(date.getMonth() + 1).padStart(2, '0')
      + String(date.getDate()).padStart(2, '0');
  }

  return {
    INTERVALS: INTERVALS,
    interval: interval,
    apHmTo24: apHmTo24,
    slotHM: slotHM,
    fmt12h: fmt12h,
    slotLabel: slotLabel,
    calcTime: calcTime,
    schedTypeToDow: schedTypeToDow,
    weekMonday: weekMonday,
    weekKey: weekKey
  };
});
