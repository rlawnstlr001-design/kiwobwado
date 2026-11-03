// 손 돌봄 — 빗질·화장실·패드·약욕을 버튼 한 번이 아니라 손으로 직접 한다(10/19 사용자 결정, 경쟁 앱 조사 후보 ③)
// 방 위에 확대 화면을 띄우고, 끝까지 하면 { ok: true }, '그만두기'면 { ok: false }. rough = 세게 빗은 횟수(빗질)
// 그림: 아이 = art/sprite/<성향>_<단계>_idle.webp(배경 없음), 화장실·패드 = art/prop/*.webp
// 근거: 장모 고양이 매일 빗질·엉킨 털 가위 금지(vca_longhair), 화장실 하루 1번 이상(aspca_litter), 약욕 거품 10~15분(iscaid2025·merck_pyoderma)

import { RIG } from './rig.js?v=202611031016';
import { sfx } from './sound.js?v=202611031016';

const TITLE = { brush: '빗질', litter: '화장실 치우기', potty: '패드 갈기', bath: '약욕', tug: '터그 놀이', wand: '낚싯대 놀이' };
const FAST = 1 / 220;  // 빗이 1ms에 아이 키의 이 비율보다 빨리 움직이면 '세게'(작은 화면에서도 같은 느낌) — 엉킨 털이 당겨진다
const HIT_GAP = 160;   // 같은 엉킨 털을 다시 빗을 수 있는 간격(ms) — 한 번 쓸 때 한 번만
const WAIT_S = 10;     // 약욕 기다리기: 체험에선 10초(= 10분)

const SVG = {
  comb: '<svg viewBox="0 0 48 48"><rect x="6" y="8" width="36" height="9" rx="3"/><path d="M10 17v20M15 17v20M20 17v20M25 17v20M30 17v20M35 17v20M40 17v20"/></svg>',
  scoop: '<svg viewBox="0 0 48 48"><path d="M8 18h22l-3 14H11z"/><path d="M12 22h14M13 26h12" /><path d="M30 22l12-12"/></svg>',
  hand: '<svg viewBox="0 0 48 48"><path d="M14 44c-4-4-7-10-8-15-1-3 3-4 4-2l3 4V12c0-3 4-3 4 0v12h1V8c0-3 4-3 4 0v16h1V10c0-3 4-3 4 0v14h1v-9c0-3 4-3 4 0v15c0 6-1 10-4 14z"/></svg>',
  sponge: '<svg viewBox="0 0 48 48"><rect x="8" y="14" width="32" height="20" rx="7"/><circle cx="16" cy="22" r="2"/><circle cx="27" cy="20" r="1.6"/><circle cx="31" cy="27" r="2"/><circle cx="20" cy="28" r="1.4"/></svg>',
  shower: '<svg viewBox="0 0 48 48"><path d="M10 10h16a8 8 0 0 1 8 8v2H18v-2"/><path d="M20 26l-2 6M26 26v7M32 26l2 6M23 36l-1 4M29 36l1 4"/></svg>',
  bag: '<svg viewBox="0 0 64 64"><path d="M14 22h36l-4 34H18z"/><path d="M24 22c0-6 4-10 8-10s8 4 8 10"/><path d="M22 32h20"/></svg>',
  knot: '<svg viewBox="0 0 40 40"><path d="M8 22c4-10 18-12 22-4s-8 14-14 8 2-14 10-10 6 12-2 14M12 14c6 2 4 8 10 6M26 28c-4-2-8 2-12-1"/></svg>',
};

// 아이 그림에서 몸(불투명, 목 아래) 자리 후보를 뽑는다. 그림 픽셀 좌표 → 0~1 비율
async function bodyPoints(src, name) {
  const im = new Image();
  // decode()는 화면이 가려져 있으면 끝나지 않을 때가 있어 load를 기다린다
  await new Promise((res) => { im.onload = im.onerror = res; im.src = src; if (im.complete) res(); });
  const W = im.naturalWidth, H = im.naturalHeight;
  if (!W) return { pts: [], W: 1, H: 1 };
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  let data;
  try { data = g.getImageData(0, 0, W, H).data; } catch { return { pts: [], W, H }; }
  const cfg = RIG[name];
  const ed = cfg ? Math.abs(cfg.eyes[1][0] - cfg.eyes[0][0]) : W * 0.2;
  const top = cfg ? cfg.neck[1] + ed * 0.3 : H * 0.38;
  const bottom = cfg?.ground ? cfg.ground - ed * 0.4 : H * 0.92;
  const tb = cfg?.tail?.box;
  const pts = [];
  const step = Math.max(3, Math.round(W / 70));
  for (let y = Math.round(top); y < bottom; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] < 220) continue;
      if (tb && x > tb[0] - 6 && x < tb[2] + 6 && y > tb[1] - 6 && y < tb[3] + 6) continue;   // 꼬리는 피한다
      // 가장자리에서 조금 안쪽만(엉킨 털·거품이 몸 밖에 걸쳐 보이지 않게)
      const m = step * 2;
      const inside = [[m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dy]) => (data[((y + dy) * W + (x + dx)) * 4 + 3] ?? 0) > 200);
      if (inside) pts.push([x / W, y / H]);
    }
  }
  return { pts, W, H };
}

// 서로 떨어진 점 n개(가까우면 다시 뽑는다)
function spread(pts, n, gap) {
  const out = [];
  const pool = pts.slice().sort(() => Math.random() - 0.5);
  for (const p of pool) {
    if (out.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > gap)) out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

export function handCare(kind, { type, stage, cat, longHair = false } = {}) {
  return new Promise((resolve) => {
    const name = `${type}_${stage}`;
    const root = document.getElementById('game') ?? document.body;
    const el = document.createElement('div');
    el.className = `hc hc-${kind}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', TITLE[kind]);
    el.innerHTML = `<div class="hc-top"><b>${TITLE[kind]}</b><span class="hc-say" id="hc-say"></span>
        <i class="hc-bar" aria-hidden="true"><i id="hc-fill"></i></i><button class="hc-x" type="button">그만두기</button></div>
      <div class="hc-stage" id="hc-stage"></div>
      <div class="hc-tool" id="hc-tool" hidden></div>`;
    root.appendChild(el);
    document.body.classList.add('handcare');   // 여는 동안 앱의 1분 다시 그리기를 멈춘다(app.js quiet) — 안 멈추면 화면째 사라진다
    requestAnimationFrame(() => el.classList.add('on'));
    const alive = setInterval(() => { if (!el.isConnected) finish(false); }, 1000);   // 화면이 다른 데서 지워지면 '그만두기'로(앱이 BUSY로 굳지 않게)
    const stage_ = el.querySelector('#hc-stage');
    const sayEl = el.querySelector('#hc-say');
    const fill = el.querySelector('#hc-fill');
    const tool = el.querySelector('#hc-tool');
    const say = (t) => { sayEl.textContent = t; };
    const prog = (p) => { fill.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`; };
    const setTool = (k) => { tool.innerHTML = SVG[k]; tool.dataset.k = k; };
    let done = false;
    let cleanup = () => {};
    const finish = (ok, extra = {}) => {
      if (done) return;
      done = true;
      cleanup();
      document.body.classList.remove('handcare');
      clearInterval(alive);
      el.classList.remove('on');
      setTimeout(() => el.remove(), 250);
      resolve({ ok, ...extra });
    };
    el.querySelector('.hc-x').addEventListener('click', () => finish(false));
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    const baseCleanup = () => document.removeEventListener('keydown', onKey);
    cleanup = baseCleanup;

    // 손(도구)이 손가락을 따라다닌다
    const follow = (e) => {
      const r = el.getBoundingClientRect();
      tool.hidden = false;
      tool.style.left = `${e.clientX - r.left}px`;
      tool.style.top = `${e.clientY - r.top}px`;
    };
    el.addEventListener('pointermove', follow);
    el.addEventListener('pointerdown', follow);
    el.addEventListener('pointerleave', () => { tool.hidden = true; });

    const puff = (x, y, cls, txt = '') => {
      const r = el.getBoundingClientRect();
      const p = document.createElement('i');
      p.className = cls;
      p.textContent = txt;
      p.style.left = `${x - r.left}px`; p.style.top = `${y - r.top}px`;
      el.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    };
    const end = (text, extra) => { say(text); prog(1); sfx.ding(); el.classList.add('hc-done'); setTimeout(() => finish(true, extra), 1300); };

    if (kind === 'brush' || kind === 'bath') return petMode();
    if (kind === 'litter') return litterMode();
    if (kind === 'potty') return padMode();
    if (kind === 'tug') return tugMode();
    if (kind === 'wand') return wandMode();
    finish(true);

    // ---------- 아이 확대(빗질·약욕) ----------
    async function petMode() {
      const src = `art/sprite/${name}_idle.webp`;
      stage_.innerHTML = `<div class="hc-pet" id="hc-pet"><img src="${src}" alt="" draggable="false"><div class="hc-layer" id="hc-layer"></div></div>`;
      const wrap = stage_.querySelector('#hc-pet');
      const layer = stage_.querySelector('#hc-layer');
      const { pts } = await bodyPoints(src, name);
      if (done) return;
      if (!pts.length) { say('잘했어요!'); return setTimeout(() => finish(true), 800); }
      const at = (e) => { const r = wrap.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; };
      if (kind === 'brush') return brush(wrap, layer, pts, at);
      return bath(wrap, layer, pts, at);
    }

    function brush(wrap, layer, pts, at) {
      setTool('comb');
      const n = longHair ? 6 : 4;
      const knots = spread(pts, n, 0.13).map(([x, y]) => {
        const k = document.createElement('i');
        k.className = 'hc-knot';
        k.innerHTML = SVG.knot;
        k.style.left = `${x * 100}%`; k.style.top = `${y * 100}%`;
        layer.appendChild(k);
        return { x, y, hp: 3, last: 0, el: k };
      });
      const total = knots.length;
      say(longHair ? '엉킨 털을 살살 여러 번 빗어 풀어요 — 털이 길어 매일 빗어야 해요' : '엉킨 털을 살살 여러 번 빗어 풀어요');
      prog(0);
      let rough = 0, lastP = null, speed = 0, fluff = 0, warned = 0;
      const move = (e) => {
        if (!(e.buttons & 1) && e.pointerType === 'mouse') { lastP = null; return; }
        const [fx, fy, r] = at(e);
        const t = performance.now();
        if (lastP) {
          const d = Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y);
          const dt = Math.max(8, t - lastP.t);
          speed = speed * 0.4 + (d / dt) * 0.6;
          fluff += d;
          if (fluff > 90) { fluff = 0; puff(e.clientX, e.clientY, 'hc-fluff'); }
        }
        lastP = { x: e.clientX, y: e.clientY, t };
        const rad = 0.075 * Math.max(1, r.height / r.width);
        for (const k of knots) {
          if (k.hp <= 0 || t - k.last < HIT_GAP) continue;
          if (Math.hypot((fx - k.x) * r.width, (fy - k.y) * r.height) > rad * r.height) continue;
          k.last = t;
          if (speed > Math.max(1.2, r.height * FAST)) {
            rough++;
            wrap.classList.remove('flinch'); void wrap.offsetWidth; wrap.classList.add('flinch');
            puff(e.clientX, e.clientY - 20, 'hc-ouch', '아야!');
            if (t - warned > 1500) { warned = t; say('너무 세요! 엉킨 털이 당겨져 아파해요 — 천천히 짧게 빗어요'); }
            continue;
          }
          k.hp--;
          k.el.style.setProperty('--hp', k.hp / 3);
          sfx.pop();
          if (k.hp <= 0) { k.el.classList.add('gone'); puff(e.clientX, e.clientY, 'hc-fluff big'); }
          const left = knots.filter((q) => q.hp > 0).length;
          prog((total - left) / total);
          if (!left) {
            stopPtr();
            return end(rough ? '다 풀었어요! 다음엔 더 살살 빗어 줘요' : '보송보송해졌어요! 살살 빗어 줘서 편안해해요', { rough });
          }
        }
      };
      const up = () => { lastP = null; speed = 0; };
      const stopPtr = ptr(wrap, move, up);
    }

    function bath(wrap, layer, pts, at) {
      // 몸을 칸으로 나눠 거품이 덮은 칸을 센다
      const G = 9;
      const cells = new Set(pts.map(([x, y]) => `${Math.floor(x * G)},${Math.floor(y * G * 1.4)}`));
      const covered = new Set();
      const bubbles = [];
      let phase = 'lather', lastB = null;
      setTool('sponge');
      say('약용 샴푸 거품을 몸 구석구석 문질러 발라요');
      prog(0);
      const move = (e) => {
        if (!(e.buttons & 1) && e.pointerType === 'mouse') { lastB = null; return; }
        const [fx, fy, r] = at(e);
        if (phase === 'lather') {
          const key = `${Math.floor(fx * G)},${Math.floor(fy * G * 1.4)}`;
          if (!cells.has(key)) return;
          if (lastB && Math.hypot(e.clientX - lastB[0], e.clientY - lastB[1]) < 18) return;
          lastB = [e.clientX, e.clientY];
          const b = document.createElement('i');
          b.className = 'hc-bubble';
          const s = 0.06 + Math.random() * 0.05;
          b.style.left = `${fx * 100}%`; b.style.top = `${fy * 100}%`; b.style.width = `${s * 100}%`;
          layer.appendChild(b);
          bubbles.push({ x: fx, y: fy, el: b });
          if (!covered.has(key)) { covered.add(key); if (covered.size % 4 === 0) sfx.bubbles(); }
          const p = covered.size / cells.size;
          prog(p / 0.8 * 0.4);
          if (p >= 0.8) { phase = 'wait'; wait(); }
        } else if (phase === 'rinse') {
          let hit = 0;
          for (const b of bubbles) {
            if (b.gone) continue;
            if (Math.hypot((fx - b.x) * r.width, (fy - b.y) * r.height) < r.width * 0.09) { b.gone = true; b.el.classList.add('gone'); hit++; }
          }
          if (hit) {
            const left = bubbles.filter((b) => !b.gone).length;
            prog(0.6 + 0.4 * (1 - left / bubbles.length));
            if (left <= Math.floor(bubbles.length * 0.05)) {
              bubbles.forEach((b) => b.el.classList.add('gone'));
              phase = 'end'; stopPtr();
              end('타월로 톡톡 — 다 했어요! 주 2번 이상, 나을 때까지 계속해요');
            }
          }
        }
      };
      const wait = () => {
        tool.hidden = true; setTool('hand');
        let s = WAIT_S;
        const tick = () => {
          if (done) return;
          if (s <= 0) { phase = 'rinse'; setTool('shower'); say('이제 미지근한 물로 거품을 깨끗이 헹궈요'); prog(0.6); return; }
          say(`약이 피부에 닿도록 거품을 그대로 둬요 — ${s}분 남았어요(체험에선 1초 = 1분)`);
          prog(0.4 + 0.2 * (1 - s / WAIT_S));
          s--; setTimeout(tick, 1000);
        };
        tick();
      };
      const stopPtr = ptr(wrap, move, () => { lastB = null; });
    }

    // ---------- 화장실(고양이): 덩어리를 떠서 봉투에 ----------
    function litterMode() {
      setTool('scoop');
      stage_.innerHTML = `<div class="hc-box" id="hc-box"><img src="art/prop/litter_clean.webp" alt="" draggable="false"><div class="hc-layer" id="hc-layer"></div></div>
        <div class="hc-bag" id="hc-bag">${SVG.bag}<small>봉투</small></div>`;
      const box = stage_.querySelector('#hc-box'), layer = stage_.querySelector('#hc-layer'), bag = stage_.querySelector('#hc-bag');
      // 모래 자리(그림 속 사각형 네 꼭짓점, 비율) — 그 안에서 고르게
      const Q = [[0.33, 0.27], [0.76, 0.33], [0.67, 0.52], [0.18, 0.47]];
      const inQ = (u, v) => {
        const top = [Q[0][0] + (Q[1][0] - Q[0][0]) * u, Q[0][1] + (Q[1][1] - Q[0][1]) * u];
        const bot = [Q[3][0] + (Q[2][0] - Q[3][0]) * u, Q[3][1] + (Q[2][1] - Q[3][1]) * u];
        return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
      };
      const n = 3 + Math.floor(Math.random() * 2);
      const cand = [];
      for (let i = 0; i < 40; i++) cand.push(inQ(0.12 + Math.random() * 0.76, 0.18 + Math.random() * 0.64));
      const clumps = spread(cand, n, 0.14).map(([x, y], i) => {
        const c = document.createElement('i');
        c.className = `hc-clump${i === 0 ? ' poop' : ''}`;
        if (i) c.style.setProperty('--rot', `${Math.round(Math.random() * 70 - 35)}deg`);
        c.style.left = `${x * 100}%`; c.style.top = `${y * 100}%`;
        layer.appendChild(c);
        return { x, y, el: c };
      });
      say('뭉친 모래를 떠서 봉투에 담아요 — 하루 한 번 이상 치워요');
      prog(0);
      let held = null, got = 0;
      const move = (e) => {
        if (!(e.buttons & 1) && e.pointerType === 'mouse') return;
        const r = box.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        if (!held) {
          const c = clumps.find((q) => !q.got && Math.hypot((fx - q.x) * r.width, (fy - q.y) * r.height) < r.width * 0.07);
          if (c) { held = c; c.el.classList.add('held'); sfx.rustle(); }
        }
        if (held) {
          held.el.style.left = `${fx * 100}%`; held.el.style.top = `${fy * 100}%`;
          const b = bag.getBoundingClientRect();
          if (e.clientX > b.left - 10 && e.clientX < b.right + 10 && e.clientY > b.top - 10 && e.clientY < b.bottom + 10) {
            held.got = true; held.el.remove(); held = null; got++;
            sfx.pop(); bag.classList.remove('gulp'); void bag.offsetWidth; bag.classList.add('gulp');
            prog(got / clumps.length);
            if (got === clumps.length) { stopPtr(); end('깨끗해졌어요! 치우면서 소변·대변 상태도 같이 살펴봐요'); }
          }
        }
      };
      const up = () => {
        if (!held) return;
        held.el.classList.remove('held');
        held.el.style.left = `${held.x * 100}%`; held.el.style.top = `${held.y * 100}%`;
        held = null;
      };
      const stopPtr = ptr(stage_, move, up);
    }

    // ---------- 패드(강아지): 쓴 패드를 말아 봉투에 → 새 패드 깔기 ----------
    function padMode() {
      setTool('hand');
      stage_.innerHTML = `<div class="hc-box hc-padbox" id="hc-box"><img id="hc-pad" src="art/prop/pad_used.webp" alt="" draggable="false"></div>
        <div class="hc-bag" id="hc-bag">${SVG.bag}<small>봉투</small></div>`;
      const box = stage_.querySelector('#hc-box'), pad = stage_.querySelector('#hc-pad'), bag = stage_.querySelector('#hc-bag');
      say('쓴 패드를 손으로 여러 번 쓸어 돌돌 말아요');
      prog(0);
      let phase = 'roll', dist = 0, last = null, held = false;
      const move = (e) => {
        if (!(e.buttons & 1) && e.pointerType === 'mouse') { last = null; return; }
        const r = box.getBoundingClientRect();
        if (phase === 'roll') {
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { last = null; return; }
          if (last) dist += Math.hypot(e.clientX - last[0], e.clientY - last[1]);
          last = [e.clientX, e.clientY];
          const p = Math.min(1, dist / Math.max(500, r.width * 1.6));
          pad.style.setProperty('--roll', p.toFixed(3));
          prog(p * 0.45);
          if (p >= 1) { phase = 'carry'; box.classList.add('rolled'); sfx.rustle(); say('돌돌 만 패드를 봉투로 옮겨요'); }
        } else if (phase === 'carry') {
          if (!held) {
            const pr = pad.getBoundingClientRect();
            if (e.clientX > pr.left - 20 && e.clientX < pr.right + 20 && e.clientY > pr.top - 30 && e.clientY < pr.bottom + 30) { held = true; pad.classList.add('held'); }
          }
          if (held) {
            pad.style.translate = `${e.clientX - (r.left + r.width / 2)}px ${e.clientY - (r.top + r.height * 0.7)}px`;
            const b = bag.getBoundingClientRect();
            if (e.clientX > b.left - 10 && e.clientX < b.right + 10 && e.clientY > b.top - 10 && e.clientY < b.bottom + 10) {
              phase = 'lay'; held = false;
              sfx.pop(); bag.classList.remove('gulp'); void bag.offsetWidth; bag.classList.add('gulp');
              pad.hidden = true; pad.style.translate = ''; box.classList.remove('rolled'); pad.style.setProperty('--roll', 0);
              box.classList.add('empty');
              prog(0.75);
              say('빈자리를 눌러 새 패드를 깔아요');
            }
          }
        }
      };
      const up = () => { last = null; if (held) { held = false; pad.classList.remove('held'); pad.style.translate = ''; } };
      const tap = () => {
        if (phase !== 'lay') return;
        phase = 'end';
        pad.src = 'art/prop/pad_clean.webp'; pad.hidden = false; pad.classList.remove('held'); pad.classList.add('drop');
        box.classList.remove('empty');
        sfx.rustle();
        stopPtr();
        end('새 패드 완료! 쓴 패드는 바로 치워야 다른 데 실수하지 않아요');
      };
      box.addEventListener('click', tap);
      const stopPtr = ptr(stage_, move, up);
    }

    // 누르고 끄는 동안 move, 뗄 때 up. 손가락은 붙잡아(setPointerCapture) 화면 밖으로 나가도 이어지게
    function ptr(target, move, up) {
      const down = (e) => { if (e.pointerType !== 'mouse') target.setPointerCapture?.(e.pointerId); move(e); };
      const mv = (e) => { if (e.pointerType !== 'mouse' && e.buttons === 0) return; move(e); };
      target.addEventListener('pointerdown', down);
      target.addEventListener('pointermove', mv);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
      const off = () => {
        target.removeEventListener('pointerdown', down);
        target.removeEventListener('pointermove', mv);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
      };
      cleanup = () => { baseCleanup(); off(); };
      return off;
    }
    // ---------- 터그 놀이(강아지, 11/3 사용자 "터그놀이를 터치로 같이 놀아주는 느낌") ----------
    // 줄 끝을 손가락으로 잡고 뒤로 당긴다. 아이가 머리를 흔들며 당겨 올 때 버티면 게이지가 찬다(너무 세게 당기면 '살살').
    // 흥분해서 '잠깐!'이 뜨면 손을 떼야 한다 — 흥분이 오르면 잠깐 멈췄다가 다시(RSPCA·Blue Cross 놀이 안내).
    // 끝은 아이가 이기게 줄을 놓아 준다. rough = 너무 세게 당기거나 '잠깐'을 무시한 횟수
    function tugMode() {
      const src = `art/sprite/${name}_idle.webp`;
      const cfg = RIG[name];
      stage_.innerHTML = `<div class="hc-pet hc-tugpet" id="hc-pet"><img src="${src}" alt="" draggable="false"></div><svg class="hc-rope" id="hc-rope"><path/><circle r="9"/></svg>`;
      const wrap = stage_.querySelector('#hc-pet'), rope = stage_.querySelector('#hc-rope'), path = rope.querySelector('path'), knob = rope.querySelector('circle');
      setTool('hand');
      say('줄 끝을 손가락으로 잡고 뒤로 당겨 보세요');
      const im = wrap.querySelector('img');
      // 입 자리(원본 픽셀 → 화면): 두 눈 가운데 아래, 턱 쪽
      const mouth = () => {
        const r = wrap.getBoundingClientRect(), s = stage_.getBoundingClientRect();
        const W = im.naturalWidth || 300, H = im.naturalHeight || 420;
        const mx = cfg ? (cfg.eyes[0][0] + cfg.eyes[1][0]) / 2 : W / 2, my = cfg ? cfg.eyes[0][1] + (cfg.neck[1] - cfg.eyes[0][1]) * 0.8 : H * 0.45;
        return [r.left - s.left + (mx / W) * r.width, r.top - s.top + (my / H) * r.height, r.height];
      };
      const waits = [0.4, 0.75];
      let hold = null, p = 0, rough = 0, yank = 0, nextYank = 900, wait = null, last = performance.now(), raf = 0, shake = 0, hard = false;
      const pos = (e) => { const s = stage_.getBoundingClientRect(); return [e.clientX - s.left, e.clientY - s.top]; };
      const draw = (now) => {
        const dt = Math.min(50, now - last); last = now;
        const [mx, my, ph] = mouth();
        const rest = [mx + ph * 0.05, my + ph * 0.42];
        const [hx, hy] = hold ?? rest;
        const dist = Math.hypot(hx - mx, hy - my), slack = ph * 0.32, pull = Math.max(0, Math.min(1.3, (dist - slack) / (ph * 0.45)));
        // 아이가 당겨 오기: 머리를 흔들며(좌우) 몸을 뒤로
        nextYank -= dt;
        if (nextYank <= 0 && !wait) { yank = 1; nextYank = 700 + Math.random() * 700; shake = Math.random() < 0.5 ? -1 : 1; sfx.pop?.(); }
        yank = Math.max(0, yank - dt / 420);
        const lean = hold ? Math.min(1, pull) : 0;
        wrap.style.transform = `translate(${(hx - mx) * 0.06 * lean}px, ${-yank * 8}px) rotate(${shake * yank * 7 + (hx - mx) * 0.02 * lean}deg)`;
        // 버티기: 당겨 올 때 적당히(0.25~1.1) 잡고 있으면 찬다 · 너무 세면 살살
        if (!wait && hold && yank > 0.5) {
          if (pull > 1.1) { if (!hard) { hard = true; rough++; say('너무 세게 당기면 이빨·목이 다칠 수 있어요 — 살살'); wrap.classList.add('flinch'); setTimeout(() => wrap.classList.remove('flinch'), 350); } }
          else if (pull > 0.25) { p += dt / 1500; hard = false; if (Math.random() < 0.05) say(['좋아요, 버텨요!', '으르릉 — 신났어요', '당겼다 풀었다!'][Math.floor(Math.random() * 3)]); }
        }
        // 흥분 신호: '잠깐!' — 손을 떼면(가만히) 차분해진다
        if (!wait && waits.length && p >= waits[0]) { waits.shift(); wait = { at: now }; el.classList.add('hc-wait'); say('✋ 너무 흥분했어요 — 손을 떼고 잠깐 멈춰요'); sfx.tap?.(); }
        if (wait) {
          if (!hold && now - wait.at > 300) { wait = null; el.classList.remove('hc-wait'); p += 0.06; say('잘했어요 — 차분해졌으면 다시 잡아요'); sfx.ding?.(); }
          else if (now - wait.at > 1800) { wait = null; el.classList.remove('hc-wait'); rough++; say('흥분했을 땐 잠깐 멈췄다 다시 하는 게 좋아요'); }
        }
        prog(p);
        const cx = (mx + hx) / 2, cy = Math.max(my, hy) + ph * 0.12 * Math.max(0, 1 - pull);   // 느슨하면 아래로 처진다
        path.setAttribute('d', `M${mx} ${my} Q${cx} ${cy} ${hx} ${hy}`);
        knob.setAttribute('cx', hx); knob.setAttribute('cy', hy);
        if (p >= 1) { cancelAnimationFrame(raf); el.classList.remove('hc-wait'); wrap.style.transform = ''; hold = null; return end('이번엔 이기게 해 줬어요 — 신나게 놀았어요!', { rough }); }
        raf = requestAnimationFrame(draw);
      };
      const down = (e) => {
        const [x, y] = pos(e), [mx, my, ph] = mouth(), k = [mx + ph * 0.05, my + ph * 0.42];
        if (!hold && Math.hypot(x - k[0], y - k[1]) > ph * 0.35) return;   // 줄 끝 근처를 잡아야 한다
        hold = [x, y]; stage_.setPointerCapture?.(e.pointerId);
      };
      const mv = (e) => { if (hold) hold = pos(e); };
      const up = () => { hold = null; };
      stage_.addEventListener('pointerdown', down); stage_.addEventListener('pointermove', mv); stage_.addEventListener('pointerup', up); stage_.addEventListener('pointercancel', up);
      raf = requestAnimationFrame(draw);
      cleanup = () => { baseCleanup(); cancelAnimationFrame(raf); el.classList.remove('hc-wait'); };
    }

    // ---------- 낚싯대 놀이(고양이, 11/3 사용자 "낚시대는 터치 좌우로 같이 놀아주는 느낌") ----------
    // 손가락을 좌우로 움직이면 깃털이 따라오고 아이가 눈으로 쫓다 다가온다. 깃털을 아이 가까이에서 멈추면 몸을 낮췄다 덮친다.
    // 먹잇감처럼 '움직였다 멈췄다'가 좋고, 계속 빠르게 흔들기만 하면 흥미를 잃는다. 마지막엔 꼭 잡게 해 준다(iCatCare 놀이 안내)
    function wandMode() {
      const src = `art/sprite/${name}_idle.webp`;
      stage_.innerHTML = `<div class="hc-wand" id="hc-wand"><svg class="hc-line"><path/></svg><img class="hc-feather" src="art/prop/feather.webp" alt="" draggable="false"><div class="hc-pet hc-cat" id="hc-pet"><img src="${src}" alt="" draggable="false"></div></div>`;
      const box = stage_.querySelector('#hc-wand'), cat_ = stage_.querySelector('#hc-pet'), fe = stage_.querySelector('.hc-feather'), line = stage_.querySelector('.hc-line path');
      setTool('hand');
      say('손가락을 좌우로 움직여 깃털을 흔들고, 아이 앞에서 잠깐 멈춰 보세요');
      let fx = 0.75, tx = fx, cx = 0.3, p = 0, still = 0, fast = 0, pounce = 0, caught = 0, last = performance.now(), raf = 0, lastFx = fx, bored = 0;
      const fy = 0.3;   // 깃털 높이(상자 비율) — 아이 머리 위, 덮치면 닿는 높이
      const draw = (now) => {
        const dt = Math.min(50, now - last) / 1000; last = now;
        fx += (tx - fx) * Math.min(1, dt * 14);
        const speed = Math.abs(fx - lastFx) / Math.max(dt, 0.001); lastFx = fx;
        still = speed < 0.08 ? still + dt : 0;
        fast = speed > 1.6 ? fast + dt : Math.max(0, fast - dt * 2);
        if (fast > 2.2 && !bored) { bored = 1.5; fast = 0; say('너무 빨리 흔들기만 하면 흥미를 잃어요 — 숨었다 멈췄다, 먹잇감처럼'); cat_.classList.add('hc-bored'); }
        bored = Math.max(0, bored - dt); if (!bored) cat_.classList.remove('hc-bored');
        // 아이: 깃털 쪽으로 천천히(덮칠 땐 한 번에)
        if (!pounce && !bored) cx += Math.max(-0.35 * dt, Math.min(0.35 * dt, (fx - cx) * dt * 1.4));
        const near = Math.abs(fx - cx) < 0.16;
        if (!pounce && near && still > 0.35 && !bored) { pounce = 0.001; cat_.classList.add('hc-crouch'); say('몸을 낮췄어요…'); }
        if (pounce) {
          const before = pounce; pounce += dt;
          if (before < 0.9 && pounce >= 0.9) { cat_.classList.remove('hc-crouch'); cat_.classList.add('hc-jump'); cx += (fx - cx) * 0.9; sfx.pop?.(); }
          if (pounce > 1.35) {
            cat_.classList.remove('hc-jump');
            const got = Math.abs(fx - cx) < 0.12;
            p += got ? 0.2 : 0.06; caught = got ? 0.7 : 0; pounce = 0; still = 0;
            say(got ? '잡았다! 🐾' : '앗, 놓쳤어요 — 그래도 신났어요'); if (got) sfx.ding?.();
          }
        } else if (speed > 0.15 && speed < 1.6 && Math.abs(fx - cx) < 0.4) p += dt * 0.03;   // 눈으로 쫓기만 해도 조금
        caught = Math.max(0, caught - dt);
        prog(p);
        const W = box.clientWidth, H = box.clientHeight;
        const fxp = fx * W, fyp = (fy + (caught ? 0.18 : Math.sin(now / 160) * 0.015)) * H;
        fe.style.left = `${fxp}px`; fe.style.top = `${fyp}px`;
        line.setAttribute('d', `M${W * 0.5} 0 Q${(W * 0.5 + fxp) / 2} ${fyp * 0.35} ${fxp} ${fyp - 10}`);
        cat_.style.left = `${cx * 100}%`;
        cat_.classList.toggle('face-left', fx < cx);
        if (p >= 1) { cancelAnimationFrame(raf); return end('마지막엔 꼭 잡게 해 줬어요 — 사냥 놀이 성공!'); }
        raf = requestAnimationFrame(draw);
      };
      const mv = (e) => { const r = box.getBoundingClientRect(); tx = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width)); };
      box.addEventListener('pointermove', mv); box.addEventListener('pointerdown', mv);
      raf = requestAnimationFrame(draw);
      cleanup = () => { baseCleanup(); cancelAnimationFrame(raf); };
    }

  });
}
