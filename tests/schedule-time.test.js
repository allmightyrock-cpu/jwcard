'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ST = require('../js/schedule-time.js');

// ── interval(numSlots) : 1시간 ÷ n ──────────────────────────────────
test('interval: 표준 조 수 → 분 간격', () => {
  assert.equal(ST.interval(1), 60);
  assert.equal(ST.interval(2), 30);
  assert.equal(ST.interval(3), 20);
  assert.equal(ST.interval(4), 15);
  assert.equal(ST.interval(5), 12);
  assert.equal(ST.interval(6), 10);
});

test('interval: 문자열 입력도 처리', () => {
  assert.equal(ST.interval('3'), 20);
});

test('interval: 표에 없는 값은 60/n 으로 폴백', () => {
  assert.equal(ST.interval(8), Math.round(60 / 8)); // 8
  assert.equal(ST.interval(7), Math.round(60 / 7)); // 9
});

test('interval: 비정상 입력은 1조(60분)로 취급', () => {
  assert.equal(ST.interval(0), 60);
  assert.equal(ST.interval(undefined), 60);
  assert.equal(ST.interval(NaN), 60);
});

// ── apHmTo24 : 오전/오후 12시간제 → 24시간제 ────────────────────────
test('apHmTo24: 오후 변환', () => {
  assert.deepEqual(ST.apHmTo24('오후', 7, 0), { h: 19, m: 0 });
  assert.deepEqual(ST.apHmTo24('오후', 12, 30), { h: 12, m: 30 }); // 오후 12시 = 정오
});

test('apHmTo24: 오전 변환', () => {
  assert.deepEqual(ST.apHmTo24('오전', 9, 15), { h: 9, m: 15 });
  assert.deepEqual(ST.apHmTo24('오전', 12, 0), { h: 0, m: 0 });   // 오전 12시 = 자정
});

// ── slotHM : 시작시각 + 슬롯 인덱스 → 시각 ──────────────────────────
test('slotHM: 3조 19:00 시작 → 20분 간격', () => {
  assert.deepEqual(ST.slotHM(19, 0, 3, 0), { h: 19, m: 0 });
  assert.deepEqual(ST.slotHM(19, 0, 3, 1), { h: 19, m: 20 });
  assert.deepEqual(ST.slotHM(19, 0, 3, 2), { h: 19, m: 40 });
});

test('slotHM: 시간 경계 넘김 (분 → 다음 시)', () => {
  assert.deepEqual(ST.slotHM(19, 50, 2, 1), { h: 20, m: 20 }); // 19:50 + 30분
});

test('slotHM: 자정 wrap (24시 → 0시)', () => {
  assert.deepEqual(ST.slotHM(23, 40, 3, 1), { h: 0, m: 0 }); // 23:40 + 20분 = 24:00 → 0:00
});

// ── fmt12h : 24시간제 → "오전/오후 H:MM" ────────────────────────────
test('fmt12h: 오전/오후 경계', () => {
  assert.equal(ST.fmt12h(0, 0), '오전 12:00');   // 자정
  assert.equal(ST.fmt12h(9, 5), '오전 9:05');
  assert.equal(ST.fmt12h(12, 0), '오후 12:00');  // 정오
  assert.equal(ST.fmt12h(13, 30), '오후 1:30');
  assert.equal(ST.fmt12h(19, 40), '오후 7:40');
});

// ── slotLabel : 신청자 화면(publisher) 진입점 ───────────────────────
test('slotLabel: "HH:MM" 시작 문자열 → 슬롯 라벨', () => {
  assert.equal(ST.slotLabel('19:00', 3, 0), '오후 7:00');
  assert.equal(ST.slotLabel('19:00', 3, 1), '오후 7:20');
  assert.equal(ST.slotLabel('19:00', 3, 2), '오후 7:40');
});

// ── calcTime : 인도자 화면(cart) 진입점 ─────────────────────────────
test('calcTime: 오후 7시 3조 → 7:00 / 7:20 / 7:40', () => {
  assert.equal(ST.calcTime('오후', 7, '00', 3, 0), '오후 7:00');
  assert.equal(ST.calcTime('오후', 7, '00', 3, 1), '오후 7:20');
  assert.equal(ST.calcTime('오후', 7, '00', 3, 2), '오후 7:40');
});

// ── 회귀 방지: 인도자(calcTime)와 신청자(slotLabel)가 항상 일치해야 함 ──
// (과거 60/n vs 120/n 으로 어긋났던 버그를 막는 핵심 테스트)
test('회귀: 같은 배정에서 인도자/신청자 표시 시간이 일치', () => {
  const cases = [
    { ap: '오후', h: 7, m: '00', start: '19:00' },
    { ap: '오전', h: 9, m: '30', start: '09:30' },
    { ap: '오후', h: 2, m: '00', start: '14:00' },
  ];
  for (const c of cases) {
    for (let n = 2; n <= 6; n++) {
      for (let idx = 0; idx < n; idx++) {
        const conductor = ST.calcTime(c.ap, c.h, c.m, n, idx);
        const applicant = ST.slotLabel(c.start, n, idx);
        assert.equal(applicant, conductor,
          `불일치 n=${n} idx=${idx}: 인도자=${conductor} 신청자=${applicant}`);
      }
    }
  }
});
