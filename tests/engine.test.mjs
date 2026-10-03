// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyze, generate, checkCombo, weightedSample, comboKey, WINDOWS, DEFAULT_OPTIONS, MAX_SHARED,
} from '../js/engine.js';

const { draws } = JSON.parse(readFileSync(new URL('../data/draws.json', import.meta.url), 'utf8'));
const stats = analyze(draws);

// 재현 가능한 난수 (mulberry32)
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('데이터: 1회부터 연속, 번호 6개', () => {
  draws.forEach((d, i) => {
    assert.equal(d.r, i + 1);
    assert.equal(new Set(d.n).size, 6);
  });
});

test('구간: 최신 회차 기준으로 정확히 나뉜다', () => {
  const latest = stats.latest.r;
  assert.deepEqual(stats.windows.map((w) => w.rounds), [
    [latest - 9, latest],
    [latest - 29, latest - 10],
    [latest - 59, latest - 30],
    [latest - 99, latest - 60],
    [latest - 199, latest - 100],
    [1, latest - 200],
  ]);
  stats.windows.forEach((w, i) => assert.equal(w.top.length, WINDOWS[i].top));
});

test('빈출 번호: 구간에서 가장 많이 나온 번호가 선정된다', () => {
  for (const w of stats.windows) {
    const maxCount = Math.max(...w.counts.slice(1));
    assert.equal(w.counts[w.top[0]], maxCount);
    for (let n = 1; n <= 45; n++) {
      if (!w.top.includes(n)) assert.ok(w.counts[n] <= w.counts[w.top.at(-1)]);
    }
  }
});

test('확률: 합이 1이고, 빈출 번호는 기본(1/45)보다 높다', () => {
  const total = stats.prob.slice(1).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  for (const w of stats.windows) for (const n of w.top) assert.ok(stats.prob[n] > 1 / 45);
});

test('확률: 여러 구간 빈출이면 비중이 더해진다', () => {
  for (let n = 1; n <= 45; n++) {
    const boost = stats.topOf(n).reduce((s, w) => s + (w.effectiveWeight * 0.5) / w.top.length, 0);
    const base = stats.windows.reduce(
      (s, w) => s + w.effectiveWeight * 0.5 * (w.counts[n] / (w.size * 6)), 0);
    assert.ok(Math.abs(stats.prob[n] - (base + boost)) < 1e-12);
  }
});

test('합계 정규분포: 평균/표준편차', () => {
  assert.ok(stats.mean > 130 && stats.mean < 145);
  assert.ok(stats.sd > 25 && stats.sd < 35);
});

test('생성: 5세트, 모든 규칙 충족 (여러 시드)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sets = generate(stats, { rng: seeded(seed) });
    assert.equal(sets.length, 5);
    const keys = new Set();
    for (const s of sets) {
      assert.equal(s.nums.length, 6);
      assert.equal(new Set(s.nums).size, 6);
      assert.deepEqual(s.nums, [...s.nums].sort((a, b) => a - b));
      assert.ok(s.nums.every((n) => n >= 1 && n <= 45));
      assert.equal(checkCombo(s.nums, stats, DEFAULT_OPTIONS), null);
      assert.ok(!stats.past.has(comboKey(s.nums)));
      keys.add(comboKey(s.nums));
    }
    assert.equal(keys.size, 5);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const shared = sets[i].nums.filter((n) => sets[j].nums.includes(n)).length;
      assert.ok(shared <= MAX_SHARED);
    }
  }
});

test('과거 1등 조합은 거절된다', () => {
  assert.equal(checkCombo(draws.at(-1).n, stats, {}), 'past');
  assert.equal(checkCombo(draws[0].n, stats, {}), 'past');
});

test('옵션 필터', () => {
  assert.equal(checkCombo([1, 3, 15, 27, 33, 41], stats, { oddEven: true }), 'oddEven');
  assert.equal(checkCombo([2, 5, 9, 14, 18, 22], stats, { lowHigh: true }), 'sum'); // 합 70: 합계 범위 밖
  assert.equal(checkCombo([12, 15, 17, 19, 20, 22], stats, { lowHigh: true }), 'lowHigh');
  assert.equal(checkCombo([5, 13, 14, 15, 30, 44], stats, { consecutive: true }), 'consecutive');
  assert.equal(checkCombo([4, 11, 18, 23, 27, 31], stats, { birthday: true }), 'birthday');
  assert.equal(checkCombo([4, 11, 18, 23, 27, 31], stats, { birthday: false }), null);
});

test('가중 추출: 확률에 비례한다', () => {
  const prob = new Array(46).fill(0);
  prob[1] = 0.7; prob[2] = 0.2; prob[3] = 0.1;
  const rng = seeded(7);
  const hits = [0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) hits[weightedSample(prob, 1, rng)[0]]++;
  assert.ok(Math.abs(hits[1] / 20000 - 0.7) < 0.02);
  assert.ok(Math.abs(hits[3] / 20000 - 0.1) < 0.02);
  assert.deepEqual(weightedSample(prob, 3, rng).sort(), [1, 2, 3]);
});

test('생성된 번호 분포가 확률을 따른다', () => {
  const rng = seeded(42);
  const hits = new Array(46).fill(0);
  for (let i = 0; i < 400; i++) for (const s of generate(stats, { rng })) for (const n of s.nums) hits[n]++;
  const top = stats.windows.flatMap((w) => w.top);
  const avgTop = top.reduce((s, n) => s + hits[n], 0) / top.length;
  const others = [...Array(45).keys()].map((i) => i + 1).filter((n) => !top.includes(n));
  const avgOther = others.reduce((s, n) => s + hits[n], 0) / others.length;
  assert.ok(avgTop > avgOther * 1.5, `top ${avgTop} vs other ${avgOther}`);
});
