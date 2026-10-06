import { analyze, generate, normalPdf, DEFAULT_OPTIONS, MAX } from './engine.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const LABELS = ['A', 'B', 'C', 'D', 'E'];
const OPTIONS_KEY = 'lotto.options';

let stats = null;
let current = [];
let options = loadOptions();

init();

async function init() {
  try {
    const res = await fetch('data/draws.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    stats = analyze(data.draws);
    renderHeader(data.updated);
    renderWindows();
    renderCarry();
    setupOptions();
    $('generateBtn').disabled = false;
    $('generateBtn').addEventListener('click', onGenerate);
    $('copyBtn').addEventListener('click', onCopy);
    onGenerate();
    drawProbChart(); // 크기 감지 이벤트를 기다리지 않고 먼저 그린다
    observeCharts();
  } catch (e) {
    showError('당첨번호 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.');
    $('drawInfo').textContent = '데이터 불러오기 실패';
  }
}

function renderHeader(updated) {
  const { latest } = stats;
  $('drawInfo').textContent = `제${latest.r}회 (${fmtDate(latest.d)}) 추첨까지 ${stats.total.toLocaleString()}회 반영`;
  $('nextRound').textContent = `제${latest.r + 1}회`;
  $('updated').textContent = `데이터 확인 ${fmtDate(updated.slice(0, 10))}`;
  $('sumSub').textContent =
    `역대 ${stats.total.toLocaleString()}회 당첨번호 6개 합계의 평균은 ${stats.mean.toFixed(1)}, 표준편차(σ)는 ${stats.sd.toFixed(1)}예요. ` +
    `색칠한 띠가 평균 ±1σ(${Math.round(stats.mean - stats.sd)}~${Math.round(stats.mean + stats.sd)}) 범위예요.`;
}

function onGenerate() {
  hideError();
  try {
    current = generate(stats, { options });
  } catch (e) {
    showError(e.message);
    return;
  }
  renderSets();
  drawSumChart();
  $('copyBtn').disabled = false;
}

function renderSets() {
  const list = $('sets');
  list.replaceChildren(
    ...current.map((s, i) => {
      const li = el('li', 'set');
      li.style.animationDelay = `${i * 60}ms`;
      li.setAttribute('aria-label', `${LABELS[i]}세트: ${s.nums.join(', ')}`);
      const balls = el('div', 'balls');
      s.nums.forEach((n, j) => {
        const b = ball(n);
        if (s.carry.includes(n)) {
          b.classList.add('carry');
          b.title = '직전 회차 번호';
        }
        b.style.animationDelay = `${i * 60 + j * 40}ms`;
        balls.append(b);
      });
      const meta = el('div', 'set-meta');
      meta.append(...[
        `직전 회차 ${s.carry.join(', ')}`,
        `합계 ${s.sum} (평균${fmtZ(s.z)}σ)`,
        `홀짝 ${s.odd}:${s.even}`,
        `저고 ${s.low}:${s.high}`,
      ].map((t) => el('span', '', t)));
      li.append(el('span', 'set-label', LABELS[i]), balls, meta);
      return li;
    }),
  );
}

async function onCopy() {
  const text = [
    `로또 제${stats.latest.r + 1}회 추천 번호`,
    ...current.map((s, i) => `${LABELS[i]}: ${s.nums.map((n) => String(n).padStart(2, '0')).join(' ')}`),
  ].join('\n');
  const btn = $('copyBtn');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '복사됨';
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    btn.textContent = ok ? '복사됨' : '복사 실패';
  }
  setTimeout(() => (btn.textContent = '복사'), 1500);
}

function setupOptions() {
  document.querySelectorAll('[data-opt]').forEach((input) => {
    input.checked = options[input.dataset.opt];
    input.addEventListener('change', () => {
      options = { ...options, [input.dataset.opt]: input.checked };
      try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch {}
    });
  });
}

function loadOptions() {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

function renderWindows() {
  $('windowRows').replaceChildren(
    ...stats.windows.map((w) => {
      const tr = document.createElement('tr');
      const name = el('td');
      name.append(el('div', '', windowLabel(w)), el('span', 'muted', `제${w.rounds[0]}~${w.rounds[1]}회`));
      const chips = el('div', 'chips');
      for (const n of w.top) {
        const chip = el('span', 'chip');
        chip.append(ball(n, true), document.createTextNode(`${w.counts[n]}회`));
        chips.append(chip);
      }
      const topCell = el('td');
      topCell.append(chips);
      tr.append(name, el('td', 'num', `${Math.round(w.effectiveWeight * 100)}%`), topCell);
      return tr;
    }),
  );
}

function renderCarry() {
  $('carryTitle').textContent = `직전 회차(제${stats.latest.r}회) 번호`;
  $('carryBalls').replaceChildren(...stats.latestNums.map((n) => {
    const b = ball(n, true);
    if (!stats.carry.includes(n)) {
      b.classList.add('excluded');
      b.title = '그 전 회차에도 나온 번호라 제외';
    }
    return b;
  }));
  const excluded = stats.latestNums.filter((n) => !stats.carry.includes(n));
  $('carryNote').textContent = excluded.length
    ? `세트마다 이 중 1개가 꼭 들어가요. ${excluded.join('·')}번은 제${stats.latest.r - 1}회에도 나와서 제외`
    : '세트마다 이 중 1개가 꼭 들어가요';
}

function windowLabel(w) {
  return w.to >= stats.total && w.from > 1 ? `최근 ${w.from}회~처음` : `최근 ${w.from}~${w.to}회`;
}

/* ---------- 차트 ---------- */

function observeCharts() {
  let lastWidth = $('probChart').clientWidth;
  const ro = new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w === lastWidth) return;
    lastWidth = w;
    drawProbChart();
    drawSumChart();
  });
  ro.observe($('probChart'));
}

function drawProbChart() {
  const host = $('probChart');
  const width = host.clientWidth;
  if (!width) return;
  const narrow = width < 480;
  const m = { top: 12, right: 8, bottom: 24, left: 36 };
  const height = narrow ? 200 : 240;
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const maxP = Math.max(...stats.prob.slice(1));
  const yMax = Math.ceil((maxP * 100) / 2) * 2 / 100;
  const y = (p) => m.top + ih - (p / yMax) * ih;
  const step = iw / MAX;
  const gap = 2;
  const bw = Math.max(step - gap, 2);

  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': '1~45번 번호별 추천 확률 막대 그래프' });

  for (let t = 0; t <= yMax + 1e-9; t += 0.02) {
    svg.append(svgEl('line', { class: 'gridline', x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }));
    svg.append(svgEl('text', { x: m.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, `${Math.round(t * 100)}%`));
  }
  const strong = new Set(stats.windows.flatMap((w) => w.top));
  for (let n = 1; n <= MAX; n++) {
    const x = m.left + (n - 1) * step + gap / 2;
    const p = stats.prob[n];
    const col = svgEl('rect', { class: 'hover-col', x: x - gap / 2, y: m.top, width: step, height: ih });
    const excluded = stats.latestNums.includes(n) && !stats.carry.includes(n);
    const cls = `bar${strong.has(n) ? ' strong' : ''}${excluded ? ' excluded' : ''}`;
    const bar = svgEl('path', { class: cls, d: barPath(x, y(p), bw, y(0) - y(p)) });
    svg.append(col, bar);
    bindTip(col, () => probTip(n));
    if (n === 1 || n % 5 === 0) {
      svg.append(svgEl('text', { x: x + bw / 2, y: height - 6, 'text-anchor': 'middle' }, String(n)));
    }
  }
  svg.append(svgEl('line', { class: 'axis', x1: m.left, x2: width - m.right, y1: y(0), y2: y(0) }));
  // 기본 확률 1/45 기준선
  const base = svgEl('line', { class: 'mean-line', x1: m.left, x2: width - m.right, y1: y(1 / 45), y2: y(1 / 45) });
  svg.append(base);
  host.replaceChildren(svg);
}

function probTip(n) {
  const p = stats.prob[n];
  const wins = stats.topOf(n);
  const frag = document.createDocumentFragment();
  frag.append(el('strong', '', `${n}번 · ${(p * 100).toFixed(2)}%`));
  if (stats.latestNums.includes(n) && !stats.carry.includes(n)) {
    frag.append(el('div', '', `이번 회차 제외 (제${stats.latest.r - 1}·${stats.latest.r}회 연속 출현)`));
  }
  frag.append(el('div', 'muted', `기본 확률의 ${(p * 45).toFixed(1)}배`));
  frag.append(el('div', 'muted', wins.length
    ? `빈출 구간: ${wins.map(windowLabel).join(', ')}`
    : '빈출 구간 없음'));
  return frag;
}

function drawSumChart() {
  const host = $('sumChart');
  const width = host.clientWidth;
  if (!width || !stats) return;
  const narrow = width < 480;
  const m = { top: 16, right: 8, bottom: 26, left: 36 };
  const height = narrow ? 200 : 240;
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const binW = 10;
  const lo = Math.floor(Math.min(...stats.sums) / binW) * binW;
  const hi = Math.ceil((Math.max(...stats.sums) + 1) / binW) * binW;
  const bins = [];
  for (let s = lo; s < hi; s += binW) bins.push({ from: s, count: 0 });
  for (const s of stats.sums) bins[Math.floor((s - lo) / binW)].count++;

  const expected = (s) => stats.total * binW * normalPdf(s, stats.mean, stats.sd);
  const yMax = niceMax(Math.max(...bins.map((b) => b.count), expected(stats.mean)));
  const x = (s) => m.left + ((s - lo) / (hi - lo)) * iw;
  const y = (c) => m.top + ih - (c / yMax) * ih;

  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': `당첨번호 합계 분포. 평균 ${stats.mean.toFixed(1)}, 표준편차 ${stats.sd.toFixed(1)}` });

  const tick = niceStep(yMax);
  for (let t = 0; t <= yMax; t += tick) {
    svg.append(svgEl('line', { class: 'gridline', x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }));
    svg.append(svgEl('text', { x: m.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  }
  svg.append(svgEl('rect', { class: 'band', x: x(stats.mean - stats.sd), y: m.top,
    width: x(stats.mean + stats.sd) - x(stats.mean - stats.sd), height: ih }));

  const gap = 2;
  for (const b of bins) {
    const bx = x(b.from) + gap / 2;
    const bw = x(b.from + binW) - x(b.from) - gap;
    const col = svgEl('rect', { class: 'hover-col', x: x(b.from), y: m.top, width: bw + gap, height: ih });
    const bar = svgEl('path', { class: 'bar', d: barPath(bx, y(b.count), bw, y(0) - y(b.count)) });
    svg.append(col, bar);
    bindTip(col, () => {
      const f = document.createDocumentFragment();
      f.append(el('strong', '', `${b.count}회`));
      f.append(el('div', 'muted', `합계 ${b.from}~${b.from + binW - 1}`));
      return f;
    });
  }

  let d = '';
  for (let s = lo; s <= hi; s += 1) d += `${d ? 'L' : 'M'}${x(s).toFixed(1)},${y(expected(s)).toFixed(1)}`;
  svg.append(svgEl('path', { class: 'curve', d }));
  svg.append(svgEl('line', { class: 'mean-line', x1: x(stats.mean), x2: x(stats.mean), y1: m.top, y2: y(0) }));
  svg.append(svgEl('line', { class: 'axis', x1: m.left, x2: width - m.right, y1: y(0), y2: y(0) }));

  const labelStep = narrow ? 40 : 20;
  for (let s = Math.ceil(lo / labelStep) * labelStep; s <= hi; s += labelStep) {
    svg.append(svgEl('text', { x: x(s), y: height - 8, 'text-anchor': 'middle' }, String(s)));
  }

  current.forEach((set, i) => {
    const dot = svgEl('circle', { class: 'mark', cx: x(set.sum), cy: y(expected(set.sum)), r: 6 });
    svg.append(dot);
    bindTip(dot, () => {
      const f = document.createDocumentFragment();
      f.append(el('strong', '', `${LABELS[i]}세트 · 합계 ${set.sum}`));
      f.append(el('div', 'muted', `평균에서 ${set.z >= 0 ? '+' : ''}${set.z.toFixed(2)}σ`));
      f.append(el('div', 'muted', set.nums.join(' · ')));
      return f;
    }, 10);
  });

  host.replaceChildren(svg);
}

/* ---------- 툴팁 ---------- */

function bindTip(target, content, pad = 0) {
  const tip = $('tooltip');
  const show = (e) => {
    tip.replaceChildren(content());
    tip.hidden = false;
    move(e);
    target.classList.add('active');
  };
  const move = (e) => {
    const r = tip.getBoundingClientRect();
    let left = e.clientX + 14 + pad;
    let top = e.clientY - r.height - 12;
    if (left + r.width > window.innerWidth - 8) left = e.clientX - r.width - 14 - pad;
    if (top < 8) top = e.clientY + 16;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => {
    tip.hidden = true;
    target.classList.remove('active');
  };
  target.addEventListener('pointerenter', show);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerleave', hide);
  target.addEventListener('pointerdown', show);
}

/* ---------- 헬퍼 ---------- */

function ball(n, small = false) {
  const b = el('span', `ball${small ? ' sm' : ''}`, String(n));
  b.dataset.g = String(Math.min(Math.ceil(n / 10), 5));
  return b;
}

function el(tag, cls = '', text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgEl(tag, attrs, text) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

// 윗모서리만 둥근 막대 (반경 최대 4px)
function barPath(x, top, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
}

function niceStep(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw);
}

function niceMax(max) {
  const step = niceStep(max);
  return Math.ceil(max / step) * step;
}

function fmtZ(z) {
  const t = Math.abs(z).toFixed(1);
  return t === '0.0' ? '±0.0' : `${z > 0 ? '+' : '-'}${t}`;
}

function fmtDate(iso) {
  return iso.replaceAll('-', '.');
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = false;
}

function hideError() {
  $('error').hidden = true;
}
