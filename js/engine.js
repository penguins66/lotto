// 로또 6/45 번호 생성 엔진 — 브라우저와 Node(테스트) 양쪽에서 쓰는 순수 함수 모음.
// draws: [{ r, d, n:[6개], b, ... }]  (순서 무관, 내부에서 최신순 정렬)

export const MAX = 45;
export const PICK = 6;

// 최신 회차 기준 구간. from/to는 "최근 몇 번째 회차"(1 = 가장 최근).
// 1번째(직전 회차)는 구간에 넣지 않고, 그 6개 중 정확히 1개를 각 세트에 포함시킨다.
// 단, 그 1개는 2번째 회차에도 나온 번호면 안 된다.
export const WINDOWS = [
  { from: 2, to: 50, top: 5, weight: 0.30 },
  { from: 51, to: 100, top: 5, weight: 0.30 },
  { from: 101, to: Infinity, top: 6, weight: 0.40 },
];

// 직전 회차 번호 중 세트에 넣을 개수
export const CARRY = 1;

// 각 구간 비중 중 빈출 상위 번호에 몰아주는 몫. 나머지는 구간 내 출현 빈도대로 45개 전체에 나눈다.
export const FOCUS = 0.5;

// 합계가 평균에서 이만큼(σ 단위) 넘게 벗어나면 무조건 제외
export const SUM_HARD_LIMIT = 2;
// 5세트끼리 겹칠 수 있는 최대 번호 수
export const MAX_SHARED = 3;

export const DEFAULT_OPTIONS = {
  oddEven: true,     // 홀짝 6:0 / 0:6 제외
  lowHigh: true,     // 저(1~22)·고(23~45) 6:0 / 0:6 제외
  consecutive: true, // 3개 이상 연속 번호 제외
  birthday: true,    // 모두 31 이하(생일 조합) 제외 — 1등 시 당첨금 분할 위험 회피
};

export const comboKey = (nums) => [...nums].sort((a, b) => a - b).join(',');

export function analyze(draws) {
  const recent = [...draws].sort((a, b) => b.r - a.r);

  const windows = WINDOWS.map((w) => {
    const slice = recent.slice(w.from - 1, w.to);
    const counts = new Array(MAX + 1).fill(0);
    const lastSeen = new Array(MAX + 1).fill(Infinity);
    slice.forEach((d, i) => {
      for (const n of d.n) {
        counts[n]++;
        if (lastSeen[n] === Infinity) lastSeen[n] = i;
      }
    });
    // 동률이면 더 최근에 나온 번호, 그다음 작은 번호 우선
    const ranked = range().sort(
      (a, b) => counts[b] - counts[a] || lastSeen[a] - lastSeen[b] || a - b,
    );
    const top = ranked.slice(0, w.top);
    return {
      ...w,
      to: w.from - 1 + slice.length,
      size: slice.length,
      rounds: slice.length ? [slice[slice.length - 1].r, slice[0].r] : null,
      counts,
      top,
    };
  }).filter((w) => w.size > 0);

  // 데이터가 짧아 빈 구간이 생기면 남은 구간 비중을 다시 100%로 맞춘다
  const totalWeight = windows.reduce((s, w) => s + w.weight, 0);

  const prob = new Array(MAX + 1).fill(0);
  const contrib = range().map(() => []); // 번호별: 어느 구간 빈출 목록에 들었는지
  for (const w of windows) {
    const weight = w.weight / totalWeight;
    w.effectiveWeight = weight;
    const balls = w.size * PICK;
    for (const n of range()) prob[n] += weight * (1 - FOCUS) * (w.counts[n] / balls);
    for (const n of w.top) {
      prob[n] += (weight * FOCUS) / w.top.length; // 구간이 겹치면 비중이 더해진다
      contrib[n - 1].push(w);
    }
  }

  const sums = recent.map((d) => d.n.reduce((s, x) => s + x, 0));
  const mean = sums.reduce((s, x) => s + x, 0) / sums.length;
  const sd = Math.sqrt(sums.reduce((s, x) => s + (x - mean) ** 2, 0) / (sums.length - 1));

  return {
    latest: recent[0],
    latestNums: recent[0].n,
    // 세트에 넣을 수 있는 직전 회차 번호 (2번째 회차와 겹치는 번호 제외)
    carry: recent[0].n.filter((n) => !(recent[1]?.n ?? []).includes(n)),
    total: recent.length,
    windows,
    prob, // prob[1..45], 합 = 1
    topOf: (n) => contrib[n - 1],
    sums,
    mean,
    sd,
    past: new Set(recent.map((d) => comboKey(d.n))),
  };
}

export function checkCombo(nums, stats, options = DEFAULT_OPTIONS) {
  const sorted = [...nums].sort((a, b) => a - b);
  const fromLatest = sorted.filter((n) => stats.latestNums.includes(n));
  if (fromLatest.length !== CARRY || !fromLatest.every((n) => stats.carry.includes(n))) return 'carry';
  if (stats.past.has(sorted.join(','))) return 'past';
  const z = (sum(sorted) - stats.mean) / stats.sd;
  if (Math.abs(z) > SUM_HARD_LIMIT) return 'sum';
  const odd = sorted.filter((n) => n % 2).length;
  if (options.oddEven && (odd === 0 || odd === PICK)) return 'oddEven';
  const low = sorted.filter((n) => n <= 22).length;
  if (options.lowHigh && (low === 0 || low === PICK)) return 'lowHigh';
  if (options.consecutive && longestRun(sorted) >= 3) return 'consecutive';
  if (options.birthday && sorted[PICK - 1] <= 31) return 'birthday';
  return null;
}

export function generate(stats, { count = 5, options = DEFAULT_OPTIONS, rng = cryptoRandom } = {}) {
  const sets = [];
  const seen = new Set();
  const maxAttempts = 200000;
  for (let attempt = 0; sets.length < count && attempt < maxAttempts; attempt++) {
    const nums = sampleCombo(stats, rng);
    const key = nums.join(',');
    if (seen.has(key) || checkCombo(nums, stats, options)) continue;
    // 정규분포 기반 채택: 합계가 평균에 가까울수록 채택 확률이 높다 (z=0 → 100%, z=1 → 61%, z=2 → 14%)
    const z = (sum(nums) - stats.mean) / stats.sd;
    if (rng() > Math.exp((-z * z) / 2)) continue;
    // 이미 뽑은 세트와 너무 비슷하면 다시
    if (sets.some((s) => s.nums.filter((n) => nums.includes(n)).length > MAX_SHARED)) continue;
    seen.add(key);
    sets.push(describe(nums, stats));
  }
  if (sets.length < count) throw new Error('조건을 만족하는 조합을 충분히 찾지 못했습니다. 옵션을 완화해 보세요.');
  return sets;
}

// 직전 회차 번호에서 CARRY개, 나머지 번호에서 PICK-CARRY개를 각각 확률대로 뽑는다
export function sampleCombo(stats, rng) {
  const inCarry = stats.prob.map((p, n) => (stats.carry.includes(n) ? p : 0));
  const outCarry = stats.prob.map((p, n) => (stats.latestNums.includes(n) ? 0 : p));
  return [
    ...weightedSample(inCarry, CARRY, rng),
    ...weightedSample(outCarry, PICK - CARRY, rng),
  ].sort((a, b) => a - b);
}

export function describe(nums, stats) {
  const s = sum(nums);
  const odd = nums.filter((n) => n % 2).length;
  const low = nums.filter((n) => n <= 22).length;
  return {
    nums,
    carry: nums.filter((n) => stats.carry.includes(n)),
    sum: s,
    z: (s - stats.mean) / stats.sd,
    odd,
    even: PICK - odd,
    low,
    high: PICK - low,
  };
}

// 가중치에 비례해 중복 없이 k개 추출
export function weightedSample(prob, k, rng) {
  const w = prob.slice();
  w[0] = 0;
  const out = [];
  for (let i = 0; i < k; i++) {
    let total = 0;
    for (let n = 1; n <= MAX; n++) total += w[n];
    let x = rng() * total;
    let pick = 0;
    for (let n = 1; n <= MAX; n++) {
      if (w[n] <= 0) continue;
      pick = n; // 부동소수 오차로 끝까지 가면 마지막 후보
      x -= w[n];
      if (x < 0) break;
    }
    out.push(pick);
    w[pick] = 0;
  }
  return out;
}

export function normalPdf(x, mean, sd) {
  return Math.exp(-(((x - mean) / sd) ** 2) / 2) / (sd * Math.sqrt(2 * Math.PI));
}

export function cryptoRandom() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

function longestRun(sorted) {
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

const sum = (a) => a.reduce((s, x) => s + x, 0);
const range = () => Array.from({ length: MAX }, (_, i) => i + 1);
