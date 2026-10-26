// 경주 미니게임 2종 — 10/26 2차: '아이 바로 뒤에서 앞으로 달려가는' 시점(사용자 참고 영상 = 가족이되어주세요 경주)
// ① 반려 경주: 봇 3마리와 100m 직선 경주. 아이 뒷모습(2걸음 그림)이 화면 아래, 트랙은 가운데 소실점으로 모이고
//    결승선의 보호자 4명이 정면에서 팔 벌리고 다가오며 커진다. 아래 발바닥 발판 두 개를 '번갈아' 누르면 한 걸음 —
//    같은 발판을 두 번 누르면 발이 꼬여 잠깐 느려진다(참고 앱의 핵심 조작).
// ② 장애물 경주: 실제 어질리티 대회 코스 — ↑ 허들 · ↓ 터널 · ←→ 위브 폴(지그재그) · ↑↓ A자 경사로(오르막 올라 내려가기).
//    장애물 앞 '바로 그때' 누르면 완벽, 조금 어긋나면 좋아요, 틀리거나 놓치면 ♥ −1. 끝까지 가면 보호자 품으로.
// 한 장의 캔버스에 지면 원근 투영(카메라 높이 HC, 아이까지 Z0)으로 길·사람·장애물을 먼 것부터 그린다.
// 나중에 여럿이 겨루기: 봇 속도·코스는 seed로 정해지는 결정적 값 → 같은 seed면 같은 판(기록 경쟁·고스트 대전 확장용)
// 그림: 아이 뒷모습 art/sprite/<성향>_<단계>_back0·back1.webp(tools/make_tricks.py --back, 목록 backs.json — 없으면 같은 성향 다른 단계로),
//       보호자 art/race/owner0~3.webp(tools/make_owners.py)

import { sfx } from './sound.js?v=202610261237';
import { rng } from './engine.js?v=202610261237';

const TYPES = ['small', 'medium', 'large', 'short', 'long'];
const SIZE = { small: 0.5, medium: 0.6, large: 0.7, short: 0.48, long: 0.5 };     // 달릴 때 키(m) — 원근 크기 계산용
const BOT_NAMES = ['초코', '몽이', '까미', '쿠키', '라떼', '호떡', '감자', '모찌', '탄이', '별이'];
const shuffleR = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
let BACKS = null;
const backs = () => (BACKS ??= fetch('art/sprite/backs.json?v=202610261237').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
// 뒷모습 2장(없는 단계면 같은 성향의 가장 가까운 단계)
async function backFrames(type, stage) {
  const have = await backs();
  const order = { baby: ['baby', 'teen', 'adult'], teen: ['teen', 'adult', 'baby'], adult: ['adult', 'teen', 'baby'] }[stage] ?? ['baby'];
  const st = order.find((s) => have[`${type}_${s}`]) ?? stage;
  const [a, b] = await Promise.all([loadImg(`art/sprite/${type}_${st}_back0.webp`), loadImg(`art/sprite/${type}_${st}_back1.webp`)]);
  if (a && b) return [a, b];
  const idle = await loadImg(`art/sprite/${type}_${stage}_idle.webp`);
  return [idle, idle];
}
const owners = () => Promise.all([0, 1, 2, 3].map((i) => loadImg(`art/race/owner${i}.webp`)));

// ---------- 지면 원근 ----------
// 카메라는 아이 뒤 Z0m, 높이 HC m. 화면 아래쪽 BOT(높이 비율)에 아이 발이 오고 HOR(비율)이 지평선
function makeView(cv) {
  const g = cv.getContext('2d');
  const V = { g, W: 0, H: 0, HOR: 0, F: 0, Z0: 3.2, HC: 1.15, camX: 0 };
  V.size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    V.W = cv.clientWidth; V.H = cv.clientHeight;
    cv.width = V.W * dpr; cv.height = V.H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    V.HOR = V.H * 0.34;
    V.F = (V.H * 0.9 - V.HOR) * V.Z0 / V.HC;
  };
  // (x m 옆, z m 앞, y m 높이) → 화면. 카메라 뒤(z<0.6)는 null
  V.p = (x, z, y = 0) => (z < 0.6 ? null : { x: V.W / 2 + V.F * (x - V.camX) / z, y: V.HOR + V.F * (V.HC - y) / z, k: V.F / z });
  V.sky = () => {
    const { W, H, HOR } = V;
    const s = g.createLinearGradient(0, 0, 0, HOR);
    s.addColorStop(0, '#9FD3F0'); s.addColorStop(1, '#E3F3F6');
    g.fillStyle = s; g.fillRect(0, 0, W, HOR + 1);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const [cx, cy, r] of [[0.15, 0.12, 0.05], [0.22, 0.13, 0.035], [0.72, 0.09, 0.045], [0.8, 0.11, 0.03]]) { g.beginPath(); g.ellipse(W * cx, H * cy, W * r * 1.6, H * r * 0.7, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#B9D7A2';
    g.beginPath(); g.moveTo(0, HOR); g.quadraticCurveTo(W * 0.2, HOR - H * 0.09, W * 0.42, HOR); g.quadraticCurveTo(W * 0.7, HOR - H * 0.12, W, HOR); g.closePath(); g.fill();
    g.fillStyle = '#7FB06A'; g.fillRect(0, HOR - 2, W, 4);   // 멀리 울타리 같은 띠
    const gr = g.createLinearGradient(0, HOR, 0, H);
    gr.addColorStop(0, '#C9E2AE'); gr.addColorStop(1, '#94C177');
    g.fillStyle = gr; g.fillRect(0, HOR, W, H - HOR);
  };
  // 땅 위 사각형(x0~x1, z0~z1) 채우기
  V.quad = (x0, x1, z0, z1, fill, y0 = 0, y1 = y0) => {
    const a = V.p(x0, z0, y0), b = V.p(x1, z0, y0), c = V.p(x1, z1, y1), d = V.p(x0, z1, y1);
    if (!a || !b || !c || !d) return;
    g.fillStyle = fill; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
  };
  V.line = (x0, z0, x1, z1, color, w, y = 0) => {
    const a = V.p(x0, z0, y), b = V.p(x1, z1, y);
    if (!a || !b) return;
    g.strokeStyle = color; g.lineWidth = Math.max(1, w * (a.k + b.k) / 2); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  // 서 있는 그림(발 = x, z, y) — 키 hm(m)
  V.sprite = (im, x, z, hm, y = 0, alpha = 1) => {
    const p = V.p(x, z, y);
    if (!p || !im) return null;
    const h = hm * p.k, w = h * im.naturalWidth / im.naturalHeight;
    if (h < 2) return p;
    g.globalAlpha = alpha;
    g.drawImage(im, p.x - w / 2, p.y - h, w, h);
    g.globalAlpha = 1;
    return { ...p, w, h };
  };
  V.shadow = (x, z, r) => {
    const p = V.p(x, z);
    if (!p) return;
    g.fillStyle = 'rgba(60,40,20,.14)'; g.beginPath(); g.ellipse(p.x, p.y, r * 0.7 * p.k, r * 0.7 * p.k * 0.26, 0, 0, Math.PI * 2); g.fill();
  };
  V.emoji = (e, x, z, hm) => {
    const p = V.p(x, z);
    if (!p || hm * p.k < 4 || hm * p.k > V.H * 0.45) return;
    g.fillStyle = '#000'; g.globalAlpha = 1;   // 그림 글자도 fillStyle 투명도를 탄다
    g.font = `${Math.round(hm * p.k)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(e, p.x, p.y);
  };
  V.size();
  return V;
}
// 길·잔디 줄무늬·길가 장식. sNow = 카메라 기준 거리, lanes = 줄 수, LW = 줄 폭
function drawTrack(V, sNow, lanes, LW, len) {
  const half = (lanes / 2) * LW, FAR = 260;
  V.quad(-half - 0.35, half + 0.35, 0.7, FAR, '#E0C08C');
  V.quad(-half - 0.35, -half - 0.2, 0.7, FAR, '#FFFFFF');
  V.quad(half + 0.2, half + 0.35, 0.7, FAR, '#FFFFFF');
  for (let i = 1; i < lanes; i++) { const x = -half + i * LW; V.quad(x - 0.03, x + 0.03, 0.7, FAR, 'rgba(255,255,255,.75)'); }
  // 가로 줄무늬 4m마다(속도감) + 10m 표시
  const z0 = V.Z0 - sNow;   // 출발선이 있는 z
  for (let s = Math.ceil((sNow - V.Z0) / 4) * 4; s < sNow + 120; s += 4) {
    const z = z0 + s; if (z < 0.8) continue;
    V.quad(-half - 0.2, half + 0.2, z, z + 0.25, s % 20 === 0 ? 'rgba(160,110,60,.28)' : 'rgba(160,110,60,.12)');
  }
  if (len) {
    // 출발선·결승선
    for (const [s, chk] of [[0, false], [len, true]]) {
      const z = z0 + s; if (z < 0.8) continue;
      const n = 16;
      for (let i = 0; i < n; i++) V.quad(-half + (2 * half) * i / n, -half + (2 * half) * (i + 1) / n, z, z + 0.45, chk ? (i % 2 ? '#2D2A26' : '#fff') : '#fff');
      if (chk) V.quad(-half, half, z + 0.45, z + 0.9, 'transparent');
    }
  }
  // 길가: 나무·꽃·관중 깃발(6m마다)
  for (let s = Math.ceil((sNow - V.Z0) / 6) * 6 - 3; s < sNow + 160; s += 6) {
    const z = z0 + s; if (z < 1) continue;
    const k = Math.abs(Math.round(s / 6)) % 4;
    const side = Math.max(1.6, 3.2 - half);   // 좁은 코스는 장식을 더 멀리
    V.emoji(['🌳', '🌼', '🌲', '🚩'][k], -half - side, z, [1.3, 0.45, 1.3, 0.9][k]);
    V.emoji(['🌲', '🚩', '🌳', '🌼'][k], half + side, z, [1.3, 0.9, 1.3, 0.45][k]);
  }
}
// 결승 아치(GOAL) — 두 기둥 + 현수막
function drawGoal(V, z, half) {
  if (z < 0.8) return;
  const H = 2.4, l = V.p(-half - 0.25, z), r = V.p(half + 0.25, z), lt = V.p(-half - 0.25, z, H), rt = V.p(half + 0.25, z, H);
  if (!l || !r) return;
  const g = V.g;
  g.strokeStyle = '#7A5A3A'; g.lineWidth = Math.max(2, 0.12 * l.k);
  g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(lt.x, lt.y); g.moveTo(r.x, r.y); g.lineTo(rt.x, rt.y); g.stroke();
  const bh = 0.45 * l.k;
  g.fillStyle = '#E8657A'; g.fillRect(lt.x, lt.y, rt.x - lt.x, bh);
  g.fillStyle = '#fff'; g.font = `900 ${Math.round(bh * 0.72)}px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GOAL!', (lt.x + rt.x) / 2, lt.y + bh / 2);
}

// ---------- ① 반려 경주 ----------
export function raceGame(body, ctx, done) {
  const r = rng(`race:${Date.now()}`);
  const L = 100, LANES = 4, LW = 1.1;
  const A = 1.45, K = 1.0, VMAX = 10.5;            // 한 걸음 힘·감속·최고 속도 → 1초에 6걸음 ≈ 8.7m/s
  body.innerHTML = `<div class="race2" id="race"><canvas id="race-cv"></canvas>
    <div class="r2-top"><b id="r2-time">0.00</b><span id="r2-rank"></span></div><div class="r2-prog" id="r2-prog"></div>
    <p class="r2-tip" id="r2-tip">발판을 번갈아 가며 눌러 주세요!</p><div class="race-count" id="r2-count">3</div><div class="race-msg" id="r2-msg" hidden></div>
    <button class="r2-pad l" data-p="0" type="button" aria-label="왼발"><span>🐾</span></button><button class="r2-pad r" data-p="1" type="button" aria-label="오른발"><span>🐾</span></button></div>`;
  const el = body.querySelector('#race'), cv = el.querySelector('#race-cv');
  const $time = el.querySelector('#r2-time'), $rank = el.querySelector('#r2-rank'), $prog = el.querySelector('#r2-prog'), $count = el.querySelector('#r2-count'), $msg = el.querySelector('#r2-msg');
  const V = makeView(cv);
  const others = shuffleR(TYPES.filter((t) => t !== ctx.type), r).slice(0, 3);
  const names = shuffleR(BOT_NAMES.filter((n) => n !== ctx.petName), r);
  const ownerIdx = shuffleR([0, 1, 2, 3], r);
  const base = shuffleR([7.2, 7.8, 8.35], r);
  const meLane = 1;
  const botLanes = [0, 2, 3];
  const racers = [
    ...others.map((t, i) => ({ name: names[i], type: t, lane: botLanes[i], me: false, base: base[i] + (r() - 0.5) * 0.3, phase: r() * 6 })),
    { name: ctx.petName, type: ctx.type, lane: meLane, me: true },
  ].map((x) => ({ ...x, s: 0, v: 0, frame: 0, ft: 0, hop: 0, fin: null, x: (x.lane - (LANES - 1) / 2) * LW }));
  const me = racers.find((x) => x.me);
  V.camX = me.x;
  $prog.innerHTML = racers.map((x) => `<i class="${x.me ? 'me' : ''}"></i>`).join('');
  const dots = [...$prog.children];
  let IM = null, OWN = [];
  Promise.all([Promise.all(racers.map((x) => backFrames(x.type, ctx.stage))), owners()]).then(([fr, ow]) => { racers.forEach((x, i) => { x.im = fr[i]; }); OWN = ow; IM = true; });

  let t = 0, last = 0, raf = 0, over = false, started = false, lastPad = -1, trip = 0, finAt = null, steps = 0;
  const result = { score: 0 };
  const flash = (m, ms = 800) => { $msg.textContent = m; $msg.hidden = false; $msg.classList.remove('big'); clearTimeout(flash.t); flash.t = setTimeout(() => { $msg.hidden = true; }, ms); };
  const step = (pad) => {
    if (over || !started || me.fin != null) return;
    if (t < trip) return;
    if (pad === lastPad) { trip = t + 0.45; me.v *= 0.6; flash('발이 꼬였어요! 번갈아 눌러요'); sfx.tap(); return; }
    lastPad = pad;
    me.v = Math.min(VMAX, me.v + A);
    me.frame = pad; me.hop = 1; steps++;
    if (steps === 1) el.querySelector('#r2-tip')?.remove();
  };
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-p]');
    e.preventDefault();
    if (b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 90); step(Number(b.dataset.p)); }
    else step(e.clientX < el.clientWidth / 2 ? 0 : 1);   // 화면 왼쪽·오른쪽 반도 발판처럼
  });
  const onKey = (e) => {
    const p = { ArrowLeft: 0, KeyF: 0, KeyA: 0, ArrowRight: 1, KeyJ: 1, KeyD: 1 }[e.code];
    if (p != null) { e.preventDefault(); step(p); }
  };
  addEventListener('keydown', onKey);
  const onResize = () => V.size();
  addEventListener('resize', onResize);

  const frame = (ts) => {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts; t += dt;
    if (!started) {
      const left = Math.ceil(3 - t);
      $count.textContent = left > 0 ? String(left) : '출발!';
      if (t >= 3 && IM) { started = true; t = 0; sfx.fanfare(); setTimeout(() => $count.remove(), 600); }
    } else {
      if (me.fin == null) { me.v *= Math.exp(-K * dt); if (t < trip) me.v = Math.min(me.v, 3); } else me.v = Math.max(0, me.v - 5 * dt);
      for (const b of racers) {
        if (b.me) continue;
        if (b.fin != null) { b.v = Math.max(0, b.v - 5 * dt); continue; }
        let tv = b.base * (1 + 0.05 * Math.sin(t * 1.4 + b.phase));
        if (b.s > L * 0.72) tv *= 1.05;
        tv *= 1 + clamp((me.s - b.s) / 45, -0.07, 0.07);
        b.v += (tv - b.v) * Math.min(1, dt * (t < 1.2 ? 2.2 : 1.4));
        b.ft += dt * b.v * 0.75;                                 // 봇 걸음: 빠를수록 자주
        if (b.ft >= 1) { b.ft = 0; b.frame ^= 1; b.hop = 1; }
      }
      for (const x of racers) {
        x.s += x.v * dt;
        x.hop = Math.max(0, x.hop - dt * 6);
        if (x.fin == null && x.s >= L) { x.fin = t - (x.s - L) / Math.max(0.1, x.v); if (x.me) { finAt = t; win(); } }
        if (x.fin != null) x.s = Math.min(x.s, L + 1.2);
      }
      const order = [...racers].sort((a, b) => (a.fin ?? 1e9) - (b.fin ?? 1e9) || b.s - a.s);
      $rank.textContent = `${order.indexOf(me) + 1}위`;
      racers.forEach((x, i) => { dots[i].style.left = `${clamp(x.s / L, 0, 1) * 100}%`; });
      if (me.fin == null) $time.textContent = t.toFixed(2);
    }
    // 그리기 — 먼 것부터
    const camS = Math.min(me.s, L + 0.2);
    V.sky();
    drawTrack(V, camS, LANES, LW, L);
    const zGoal = V.Z0 + (L - camS);
    const half = (LANES / 2) * LW;
    const items = [];
    racers.forEach((x) => items.push({ z: V.Z0 + (L + 1.6 - camS), draw: () => V.sprite(OWN[ownerIdx[x.lane]], x.x, V.Z0 + (L + 1.6 - camS), 1.05) }));
    items.push({ z: zGoal + 0.01, draw: () => drawGoal(V, zGoal, half) });
    for (const x of racers) {
      const z = V.Z0 + (x.s - camS);
      items.push({ z, draw: () => {
        if (!x.im) return;
        V.shadow(x.x, z, SIZE[x.type] * 0.55);
        const sp = V.sprite(x.im[x.frame], x.x, z, SIZE[x.type], x.hop * 0.06);
        if (sp && !x.me && sp.h > 14) { const g = V.g; g.font = `900 ${Math.max(10, Math.round(sp.h * 0.16))}px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(45,42,38,.75)'; g.fillText(x.name, sp.x, sp.y - sp.h - 2); }
      } });
    }
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    if (finAt != null && t - finAt > 2.4 && !over) { over = true; cleanup(); done(result.score); return; }
    raf = requestAnimationFrame(frame);
  };
  const win = () => {
    const placeNo = 1 + racers.filter((x) => !x.me && x.fin != null && x.fin < me.fin).length;
    result.score = [100, 70, 50, 30][placeNo - 1] + Math.max(0, Math.round((16 - me.fin) * 5));
    ctx.note = `${placeNo}등 · ${me.fin.toFixed(2)}초`;
    $time.textContent = me.fin.toFixed(2);
    if (placeNo === 1) sfx.fanfare(); else sfx.coin();
    $msg.innerHTML = `<b>${placeNo}등!</b><span>${placeNo === 1 ? '보호자 품으로 1등 골인!' : '보호자 품으로 골인!'} ${me.fin.toFixed(2)}초</span>`;
    $msg.hidden = false; $msg.classList.add('big');
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(flash.t); };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}

// ---------- ② 장애물 경주(어질리티) ----------
// 코스 조각: hurdle(↑) · tunnel(↓) · weave(←→ 6개 지그재그) · aframe(↑ 올라가서 ↓ 내려오기)
const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const COLOR = { up: '#E8657A', down: '#4F8FC0', left: '#C98A2E', right: '#3F6B4F' };
export function agilityGame(body, ctx, done) {
  const r = rng(`agility:${Date.now()}`);
  const dog = ctx.species === 'dog';
  // 코스 만들기: 조각마다 판정점(at m, dir)들
  const parts = [], checks = [];
  let at = 16;
  const kinds = ['hurdle', 'tunnel', 'weave', 'aframe', 'hurdle', 'tunnel', 'hurdle', 'weave', 'aframe', 'hurdle', 'tunnel', 'weave', 'hurdle', 'aframe'];
  shuffleR(kinds, r);
  for (const k of kinds) {
    if (k === 'hurdle') { parts.push({ k, at }); checks.push({ at, dir: 'up', k }); at += 9; }
    if (k === 'tunnel') { parts.push({ k, at, len: 3 }); checks.push({ at, dir: 'down', k }); at += 11; }
    if (k === 'weave') {
      const first = r() < 0.5 ? 'left' : 'right';
      const poles = [];
      for (let i = 0; i < 6; i++) { const dir = i % 2 ? (first === 'left' ? 'right' : 'left') : first; poles.push({ at: at + i * 1.6, dir }); checks.push({ at: at + i * 1.6, dir, k }); }
      parts.push({ k, at, poles }); at += 6 * 1.6 + 8;
    }
    if (k === 'aframe') { parts.push({ k, at, len: 6 }); checks.push({ at, dir: 'up', k }); checks.push({ at: at + 3, dir: 'down', k }); at += 6 + 9; }
  }
  const END = at + 4;
  body.innerHTML = `<div class="race2 ag2" id="ag"><canvas id="ag-cv"></canvas>
    <div class="r2-top"><span id="ag-life">♥♥♥</span><b id="ag-score">0점</b><span id="ag-combo"></span></div><div class="r2-prog ag-prog2"><i id="ag-bar"></i></div>
    <div class="ag-judge" id="ag-judge"></div>
    <div class="ag-legend">${dog ? '<span><b style="--c:#E8657A">↑</b>허들·경사로 오르기</span><span><b style="--c:#4F8FC0">↓</b>터널·경사로 내려가기</span><span><b style="--c:#C98A2E">←</b><b style="--c:#3F6B4F">→</b>위브 폴 지그재그</span>' : '<span><b style="--c:#E8657A">↑</b>허들·경사로 오르기</span><span><b style="--c:#4F8FC0">↓</b>터널·경사로 내려가기</span><span><b style="--c:#C98A2E">←</b><b style="--c:#3F6B4F">→</b>폴 사이 지그재그</span>'}</div>
    <div class="ag-pad" id="ag-pad">${['up', 'left', 'down', 'right'].map((d) => `<button type="button" data-d="${d}" class="ag-${d}" style="--c:${COLOR[d]}">${ARROW[d]}</button>`).join('')}</div>
    <div class="race-count" id="ag-count">3</div></div>`;
  const el = body.querySelector('#ag'), cv = el.querySelector('#ag-cv');
  const $life = el.querySelector('#ag-life'), $score = el.querySelector('#ag-score'), $combo = el.querySelector('#ag-combo'), $bar = el.querySelector('#ag-bar'), $judge = el.querySelector('#ag-judge'), $count = el.querySelector('#ag-count');
  const V = makeView(cv);
  V.Z0 = 3.4; V.size();
  let IM = null, OWN = null;
  Promise.all([backFrames(ctx.type, ctx.stage), owners()]).then(([fr, ow]) => { IM = fr; OWN = ow[Math.floor(r() * 4)]; });
  let t = 0, last = 0, raf = 0, over = false, started = false, s = 0, lives = 3, score = 0, combo = 0, maxCombo = 0, perfect = 0, good = 0, ended = false;
  let frameNo = 0, ft = 0, jump = 0, duck = 0, sway = 0, swayTo = 0;
  const speed = () => 5.2 + Math.min(2.4, (s / END) * 2.4);
  const judge = (txt, cls) => { $judge.textContent = txt; $judge.className = `ag-judge on ${cls}`; clearTimeout(judge.t); judge.t = setTimeout(() => { $judge.className = 'ag-judge'; }, 650); };
  const groundY = (pos) => {   // A자 경사로 위면 높이
    for (const p of parts) if (p.k === 'aframe' && pos > p.at && pos < p.at + p.len) { const u = (pos - p.at) / p.len; return 1.0 * (1 - Math.abs(u * 2 - 1)); }
    return 0;
  };
  const act = (d, c) => {
    if (d === 'up' && c.k === 'hurdle') jump = 1;
    if (d === 'down' && c.k === 'tunnel') duck = 1;
    if (d === 'left' || d === 'right') swayTo = d === 'left' ? -0.32 : 0.32;
  };
  const press = (d) => {
    if (!started || over || ended) return;
    const c = checks.find((q) => !q.state);
    if (!c) return;
    const dm = c.at - s;
    if (dm > 2.4) return;                              // 너무 이르면 무시
    if (d !== c.dir) { miss(c, '방향이 달라요!'); return; }
    c.state = 'ok';
    act(d, c);
    combo++; maxCombo = Math.max(maxCombo, combo);
    const err = Math.abs(dm - 0.8);                     // 장애물 0.8m 앞이 딱 좋다
    if (err < 0.5) { perfect++; score += 100 + combo * 5; judge('완벽!', 'perfect'); sfx.coin(); }
    else { good++; score += 60 + combo * 3; judge('좋아요', 'good'); sfx.pop(); }
  };
  const miss = (c, why) => { c.state = 'miss'; combo = 0; lives--; judge(why, 'miss'); sfx.tap(); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); };
  el.querySelector('#ag-pad').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-d]'); if (b) { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 90); press(b.dataset.d); } });
  let down = null;
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ag-pad')) down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.hypot(dx, dy) < 26) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const onKey = (e) => { const d = KEY[e.code]; if (d) { e.preventDefault(); press(d); } };
  el.__state = () => ({ s, next: checks.find((c) => !c.state) });   // 시험용(자동 입력으로 끝까지 돌려 보기)
  addEventListener('keydown', onKey);
  const onResize = () => V.size();
  addEventListener('resize', onResize);
  const LW = 2.0;
  const drawPart = (p) => {
    const z = V.Z0 + (p.at - s);
    if (p.k === 'hurdle') {
      if (z < 0.8 || z > 120) return;
      for (const x of [-0.75, 0.75]) { const a = V.p(x, z), b = V.p(x, z, 0.75); if (a && b) { V.g.strokeStyle = '#7A5A3A'; V.g.lineWidth = Math.max(2, 0.06 * a.k); V.g.beginPath(); V.g.moveTo(a.x, a.y); V.g.lineTo(b.x, b.y); V.g.stroke(); } }
      const a = V.p(-0.75, z, 0.45), b = V.p(0.75, z, 0.45);
      if (a && b) { const n = 6; for (let i = 0; i < n; i++) { V.g.strokeStyle = i % 2 ? '#fff' : '#E8657A'; V.g.lineWidth = Math.max(3, 0.08 * a.k); V.g.beginPath(); V.g.moveTo(a.x + (b.x - a.x) * i / n, a.y); V.g.lineTo(a.x + (b.x - a.x) * (i + 1) / n, b.y); V.g.stroke(); } }
    }
    if (p.k === 'tunnel') {
      const z1 = z + p.len;
      if (z1 < 0.8 || z > 140) return;
      const ring = (zz, fill, stroke) => { const c = V.p(0, zz, 0.42); if (!c) return; const rx = 0.62 * c.k, ry = 0.46 * c.k; V.g.fillStyle = fill; V.g.strokeStyle = stroke; V.g.lineWidth = Math.max(2, 0.08 * c.k); V.g.beginPath(); V.g.ellipse(c.x, c.y + ry * 0.08, rx, ry, 0, Math.PI, 0); V.g.lineTo(c.x + rx, V.p(0, zz).y); V.g.lineTo(c.x - rx, V.p(0, zz).y); V.g.closePath(); V.g.fill(); if (stroke) V.g.stroke(); };
      const inside = s > p.at - 0.2 && s < p.at + p.len;
      if (inside) { const ze = V.Z0 + (p.at + p.len - s); if (ze > 1.2) ring(ze, 'rgba(111,168,216,.55)', '#3D78A8'); }   // 안에 있으면 나가는 구멍만
      if (z > V.Z0 + 0.3) { ring(Math.max(z, 0.8), '#6FA8D8', '#3D78A8'); const c = V.p(0, z, 0.38); if (c) { V.g.fillStyle = 'rgba(30,60,90,.65)'; V.g.beginPath(); V.g.ellipse(c.x, c.y + 0.1 * c.k, 0.48 * c.k, 0.34 * c.k, 0, Math.PI, 0); V.g.lineTo(c.x + 0.48 * c.k, V.p(0, z).y); V.g.lineTo(c.x - 0.48 * c.k, V.p(0, z).y); V.g.closePath(); V.g.fill(); } }
    }
    if (p.k === 'weave') {
      for (const q of p.poles) {
        const zz = V.Z0 + (q.at - s); if (zz < 0.8 || zz > 120) continue;
        const x = q.dir === 'left' ? 0.28 : -0.28;     // 왼쪽으로 돌아야 하는 폴은 오른쪽에 서 있다
        const a = V.p(x, zz), b = V.p(x, zz, 1.0);
        if (!a || !b) continue;
        const w = Math.max(2, 0.05 * a.k);
        for (let i = 0; i < 5; i++) { V.g.strokeStyle = i % 2 ? '#fff' : '#F2A93B'; V.g.lineWidth = w; V.g.beginPath(); V.g.moveTo(a.x, a.y + (b.y - a.y) * i / 5); V.g.lineTo(a.x, a.y + (b.y - a.y) * (i + 1) / 5); V.g.stroke(); }
      }
    }
    if (p.k === 'aframe') {
      const zA = V.Z0 + (p.at - s), zP = zA + p.len / 2, zB = zA + p.len;
      if (zB < 0.8 || zA > 140) return;
      const z0 = Math.max(zA, 0.8), y0 = z0 > zA ? groundY(s + (z0 - V.Z0)) : 0;
      V.quad(-0.62, 0.62, zP, zB, '#B5763D', 1.0, 0);
      V.quad(-0.62, 0.62, z0, zP, '#D9894A', y0, 1.0);
      V.quad(-0.62, 0.62, Math.max(zA, 0.8), Math.max(zA + 0.6, 0.9), '#F2D24B', y0, Math.min(1, y0 + 0.2));   // 접촉 구역(노랑)
      for (let i = 1; i < 6; i++) { const zz = zA + i * 0.5; if (zz > 0.8 && zz < zP) V.line(-0.6, zz, 0.6, zz, 'rgba(90,50,20,.45)', 0.03, ((zz - zA) / (p.len / 2))); }
    }
  };
  const frame = (ts) => {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts; t += dt;
    if (!started) {
      const left = Math.ceil(3 - t);
      $count.textContent = left > 0 ? String(left) : '출발!';
      if (t >= 3 && IM) { started = true; t = 0; setTimeout(() => $count.remove(), 600); }
    } else if (!ended) {
      s += speed() * dt;
      for (const c of checks) if (!c.state && c.at - s < -0.4) miss(c, '놓쳤어요!');
      if (lives <= 0) finish(false);
      else if (s >= END - 2.5) finish(true);
    }
    ft += dt * speed() * 0.9; if (ft >= 1) { ft = 0; frameNo ^= 1; }
    jump = Math.max(0, jump - dt * 1.9); duck = Math.max(0, duck - dt * 1.4);
    sway += (swayTo - sway) * Math.min(1, dt * 10); swayTo *= Math.exp(-dt * 3);
    // 그리기
    V.camX = 0;
    V.sky();
    drawTrack(V, s, 1, LW, 0);
    const items = [];
    for (const p of parts) {
      let z = V.Z0 + (p.at - s);
      if (p.k === 'aframe') z = s > p.at - 0.5 && s < p.at + p.len ? V.Z0 + 0.01 : z + 3;   // 경사로 위에 있을 땐 늘 아이 밑에
      items.push({ z, draw: () => drawPart(p) });
    }
    // 화살표 표시(다음 3개)
    checks.filter((c) => !c.state).slice(0, 3).forEach((c, i) => {
      const z = V.Z0 + (c.at - s);
      items.push({ z: z - 0.01, draw: () => { const p = V.p(c.k === 'weave' ? (c.dir === 'left' ? 0.28 : -0.28) : 0, z, c.k === 'tunnel' ? 1.1 : c.k === 'aframe' ? 1.6 : 1.25); if (!p) return; const rr = Math.max(9, Math.min(30, 0.22 * p.k)); V.g.globalAlpha = i ? 0.6 : 1; V.g.fillStyle = COLOR[c.dir]; V.g.beginPath(); V.g.arc(p.x, p.y, rr, 0, Math.PI * 2); V.g.fill(); V.g.strokeStyle = '#fff'; V.g.lineWidth = 3; V.g.stroke(); V.g.fillStyle = '#fff'; V.g.font = `900 ${Math.round(rr * 1.3)}px sans-serif`; V.g.textAlign = 'center'; V.g.textBaseline = 'middle'; V.g.fillText(ARROW[c.dir], p.x, p.y + 1); V.g.globalAlpha = 1; } });
    });
    const zEnd = V.Z0 + (END - s);
    if (OWN) items.push({ z: zEnd, draw: () => { drawGoal(V, zEnd, 0.9); V.sprite(OWN, 0, zEnd + 0.4, 1.05); } });
    // 아이(뒷모습): 점프·숙이기·지그재그·경사로 높이
    items.push({ z: V.Z0 - 0.001, draw: () => {
      if (!IM) return;
      const hy = groundY(s) + Math.sin(jump * Math.PI) * 0.55 * (jump > 0 ? 1 : 0);
      V.shadow(sway, V.Z0, SIZE[ctx.type] * 0.55);
      const h = SIZE[ctx.type] * (1 - Math.sin(duck * Math.PI) * 0.35);
      const inTunnel = parts.some((p) => p.k === 'tunnel' && s > p.at && s < p.at + p.len);
      V.sprite(IM[frameNo], sway, V.Z0, h, hy, inTunnel ? 0.55 : 1);
    } });
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    $life.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $bar.style.width = `${clamp(s / END, 0, 1) * 100}%`;
    $combo.textContent = combo >= 3 ? `${combo} 콤보` : '';
    $score.textContent = `${score}점`;
    raf = requestAnimationFrame(frame);
  };
  const finish = (clear) => {
    if (ended) return;
    ended = true;
    const total = score + maxCombo * 10 + (clear ? 200 + lives * 50 : 0);
    ctx.note = clear ? `완주! 완벽 ${perfect} · 좋아요 ${good} · 최대 ${maxCombo}콤보` : `${checks.filter((c) => c.state).length}/${checks.length}에서 넘어졌어요`;
    if (clear) { sfx.fanfare(); judge(`완주! 완벽 ${perfect} · 좋아요 ${good}`, 'perfect'); }
    else judge('넘어졌어요… 다음엔 끝까지!', 'miss');
    // 완주면 보호자 품까지 마저 달린다
    const t0 = t;
    const run = () => { if (over) return; if (clear && s < END - 0.4) { s += 3 * 0.016; } if (t - t0 < (clear ? 2.2 : 1.4)) return setTimeout(run, 16); over = true; cleanup(); done(total); };
    run();
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(judge.t); };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}
