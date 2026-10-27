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

import { sfx } from './sound.js?v=202610271756';
import { rng } from './engine.js?v=202610271756';

const TYPES = ['small', 'medium', 'large', 'short', 'long'];
const SIZE = { small: 0.5, medium: 0.6, large: 0.7, short: 0.48, long: 0.5 };     // 달릴 때 키(m) — 원근 크기 계산용
const BOT_NAMES = ['초코', '몽이', '까미', '쿠키', '라떼', '호떡', '감자', '모찌', '탄이', '별이'];
const shuffleR = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// '#RRGGBB'를 f배 어둡게(f<1)·밝게(f>1)
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const ch = (v) => Math.round(clamp(f > 1 ? v + (255 - v) * (f - 1) : v * f, 0, 255)); return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
let BACKS = null;
const backs = () => (BACKS ??= fetch('art/sprite/backs.json?v=202610271756').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
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
  // 역동성(10/26 3차): dolly(<1이면 카메라가 아이에게 다가가며 화각이 넓어져 배경이 빨려 들어감) · pitch(지평선 이동) · roll · bobY · trauma(흔들림) · 입자
  const V = { g, W: 0, H: 0, HOR: 0, F: 0, Z0: 3.2, Z0b: 3.2, HC: 1.15, HCb: 1.15, camX: 0, dpr: 1, baseF: 0, baseHOR: 0, dolly: 1, pitch: 0, roll: 0, bobY: 0, trauma: 0, parts: [] };
  V.size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    V.dpr = dpr;
    V.W = cv.clientWidth; V.H = cv.clientHeight;
    cv.width = V.W * dpr; cv.height = V.H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    V.baseHOR = V.HOR = V.H * 0.34;
    V.baseF = V.F = (V.H * 0.9 - V.HOR) * V.Z0b / V.HCb;
    V.Z0 = V.Z0b;
  };
  // 한 장면 시작: 카메라 효과를 캔버스 변환으로
  V.begin = (dt) => {
    V.trauma = Math.max(0, V.trauma - dt * 1.7);
    const sh = V.trauma * V.trauma;
    V.Z0 = V.Z0b * V.dolly; V.F = V.baseF * V.dolly; V.HOR = V.baseHOR + V.pitch;
    g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    g.translate(V.W / 2, V.H * 0.82);
    g.rotate(V.roll + sh * (Math.random() * 2 - 1) * 0.025);
    g.scale(1.05, 1.05);   // 기울어도 가장자리가 비지 않게
    g.translate(-V.W / 2 + (Math.random() * 2 - 1) * sh * 20, -V.H * 0.82 + (Math.random() * 2 - 1) * sh * 14 + V.bobY);
  };
  V.end = () => g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  V.kick = (a) => { V.trauma = Math.min(1, V.trauma + a); };
  // 입자: dust(흙먼지) · spark(반짝) · confetti(색종이) — 화면 좌표
  V.emit = (x, y, o = {}) => {
    for (let i = 0; i < (o.n ?? 6); i++) {
      const a = (o.ang ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI), sp = (o.speed ?? 80) * (0.5 + Math.random());
      V.parts.push({ x: x + (Math.random() - 0.5) * (o.w ?? 0), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (o.life ?? 0.6) * (0.7 + Math.random() * 0.6), r: (o.size ?? 6) * (0.6 + Math.random() * 0.8), c: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : (o.color ?? 'rgba(240,222,190,.6)'), kind: o.kind ?? 'dust', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, gr: o.grav ?? 0 });
    }
  };
  V.drawParts = (dt) => {
    for (let i = V.parts.length - 1; i >= 0; i--) {
      const q = V.parts[i];
      q.life += dt;
      if (q.life > q.max) { V.parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.gr * dt; q.vx *= 0.97; q.rot += q.vr * dt;
      const a = 1 - q.life / q.max;
      if (q.kind === 'confetti') { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 1.6); g.fillStyle = q.c; g.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2); g.restore(); }
      else if (q.kind === 'spark') { g.globalAlpha = a; g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r * a + 1, 0, Math.PI * 2); g.fill(); }
      else { g.globalAlpha = a * 0.5; g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r * (0.8 + (q.life / q.max) * 1.2), 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
  };
  // 바람 줄기: 소실점에서 바깥으로 흐르는 흰 선(속도감)
  V.speedLines = (amt, t) => {
    if (amt <= 0.03) return;
    const cx = V.W / 2, cy = V.HOR + (V.H - V.HOR) * 0.1;
    g.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.sin(i * 12.9) * 0.08;
      const ph = ((t * (2.2 + amt * 2) + i * 0.37) % 1);
      const r0 = V.W * (0.22 + ph * 0.55), len = V.W * (0.05 + amt * 0.14);
      g.strokeStyle = `rgba(255,255,255,${(0.6 * amt * (1 - ph)).toFixed(3)})`;
      g.lineWidth = 1.5 + (i % 3);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.62); g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.62); g.stroke();
    }
  };
  // 찌그러짐(sq: 1 = 그대로)·기울기(rot)를 준 아이 그림
  V.spriteFx = (im, x, z, hm, y = 0, alpha = 1, sq = 1, rot = 0) => {
    const p = V.p(x, z, y);
    if (!p || !im) return null;
    const h = hm * p.k, w = h * im.naturalWidth / im.naturalHeight;
    if (h < 2) return p;
    g.save(); g.globalAlpha = alpha; g.translate(p.x, p.y); g.rotate(rot); g.scale(1 + (1 - sq) * 0.6, sq); g.drawImage(im, -w / 2, -h, w, h); g.restore();
    return { ...p, w, h };
  };
  V.vignette = (color, a) => {
    if (a <= 0.01) return;
    const gr = g.createRadialGradient(V.W / 2, V.H / 2, V.H * 0.3, V.W / 2, V.H / 2, V.W * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, color.replace('A', a.toFixed(3)));
    g.fillStyle = gr; g.fillRect(-V.W * 0.1, -V.H * 0.1, V.W * 1.2, V.H * 1.2);
  };
  // (x m 옆, z m 앞, y m 높이) → 화면. 카메라 뒤(z<0.6)는 null
  V.p = (x, z, y = 0) => (z < 0.6 ? null : { x: V.W / 2 + V.F * (x - V.camX) / z, y: V.HOR + V.F * (V.HC - y) / z, k: V.F / z });
  V.sky = () => {
    const { W, H, HOR } = V;
    const s = g.createLinearGradient(0, 0, 0, HOR);
    s.addColorStop(0, '#9FD3F0'); s.addColorStop(1, '#E3F3F6');
    g.fillStyle = s; g.fillRect(-W * 0.1, -H * 0.2, W * 1.2, HOR + H * 0.2 + 1);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const [cx, cy, r] of [[0.15, 0.12, 0.05], [0.22, 0.13, 0.035], [0.72, 0.09, 0.045], [0.8, 0.11, 0.03]]) { g.beginPath(); g.ellipse(W * cx, H * cy, W * r * 1.6, H * r * 0.7, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#B9D7A2';
    g.beginPath(); g.moveTo(-W * 0.1, HOR); g.quadraticCurveTo(W * 0.2, HOR - H * 0.09, W * 0.42, HOR); g.quadraticCurveTo(W * 0.7, HOR - H * 0.12, W * 1.1, HOR); g.closePath(); g.fill();
    g.fillStyle = '#7FB06A'; g.fillRect(-W * 0.1, HOR - 2, W * 1.2, 4);   // 멀리 울타리 같은 띠
    const gr = g.createLinearGradient(0, HOR, 0, H);
    gr.addColorStop(0, '#C9E2AE'); gr.addColorStop(1, '#94C177');
    g.fillStyle = gr; g.fillRect(-W * 0.1, HOR, W * 1.2, H * 1.2 - HOR);
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
  V.shadow = (x, z, r, y = 0) => {
    const p = V.p(x, z, y);
    if (!p) return;
    g.fillStyle = 'rgba(60,40,20,.14)'; g.beginPath(); g.ellipse(p.x, p.y, r * 0.7 * p.k, r * 0.7 * p.k * 0.26, 0, 0, Math.PI * 2); g.fill();
  };
  // 3D 점들로 된 면 하나
  V.poly = (pts, fill) => {
    const q = pts.map(([x, z, y]) => V.p(x, z, y));
    if (q.some((v) => !v)) return;
    g.fillStyle = fill; g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath(); g.fill();
  };
  // 상자(x0~x1, z0~z1, y0~y1): 카메라에서 보이는 면만 — 앞면 = 본색, 윗면 밝게, 옆면 어둡게
  V.box = (x0, x1, z0, z1, y0, y1, col) => {
    z0 = Math.max(z0, 0.65);
    if (z1 <= z0) return;
    if (V.camX < x0) V.poly([[x0, z0, y0], [x0, z1, y0], [x0, z1, y1], [x0, z0, y1]], shade(col, 0.7));
    if (V.camX > x1) V.poly([[x1, z0, y0], [x1, z1, y0], [x1, z1, y1], [x1, z0, y1]], shade(col, 0.78));
    if (y1 < V.HC) V.poly([[x0, z0, y1], [x1, z0, y1], [x1, z1, y1], [x0, z1, y1]], shade(col, 1.15));
    V.poly([[x0, z0, y0], [x1, z0, y0], [x1, z0, y1], [x0, z0, y1]], col);
  };
  // 원기둥(줄무늬 + 좌우 음영 + 둥근 머리)
  V.pole = (x, z, h, rad, cols) => {
    const a = V.p(x, z), b = V.p(x, z, h);
    if (!a || !b) return;
    const w = Math.max(2, rad * 2 * a.k), n = 6;
    for (let i = 0; i < n; i++) { const y0 = a.y + ((b.y - a.y) * i) / n, y1 = a.y + ((b.y - a.y) * (i + 1)) / n; g.fillStyle = cols[i % cols.length]; g.fillRect(a.x - w / 2, y1, w, y0 - y1 + 0.5); }
    const gr = g.createLinearGradient(a.x - w / 2, 0, a.x + w / 2, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.3)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = gr; g.fillRect(a.x - w / 2, b.y, w, a.y - b.y);
    g.fillStyle = cols[0]; g.beginPath(); g.ellipse(b.x, b.y, w / 2, w / 4, 0, 0, Math.PI * 2); g.fill();
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
// 어질리티 경기장(10/26 입체): 깎은 잔디 줄무늬 · 코스 흰 선 · 광고판 같은 색 펜스(두께 있는 판) · 먼 안개
function drawArena(V, sNow) {
  const FAR = 220, z0 = V.Z0 - sNow, g = V.g;
  V.quad(-8, 8, 0.7, FAR, '#86BE63');
  for (let s = Math.floor((sNow - V.Z0) / 3) * 3; s < sNow + 100; s += 3) {
    if (Math.abs(Math.round(s / 3)) % 2) continue;
    const z = z0 + s; if (z + 3 < 0.7) continue;
    V.quad(-8, 8, Math.max(z, 0.7), z + 3, '#77B055');
  }
  V.quad(-1.3, -1.24, 0.7, FAR, 'rgba(255,255,255,.75)'); V.quad(1.24, 1.3, 0.7, FAR, 'rgba(255,255,255,.75)');
  const fog = g.createLinearGradient(0, V.HOR - 4, 0, V.HOR + V.H * 0.09);
  fog.addColorStop(0, 'rgba(227,243,246,.7)'); fog.addColorStop(1, 'rgba(227,243,246,0)');
  g.fillStyle = fog; g.fillRect(-V.W * 0.1, V.HOR - 4, V.W * 1.2, V.H * 0.09 + 4);
  const C = ['#E8657A', '#FFFFFF', '#4F8FC0', '#F2D24B'];
  const boards = [];
  for (let s = Math.floor((sNow - V.Z0) / 2.4) * 2.4; s < sNow + 90; s += 2.4) boards.push(s);
  for (const s of boards.reverse()) {
    const z = z0 + s; if (z + 2.3 < 0.7) continue;
    const c = C[Math.abs(Math.round(s / 2.4)) % 4];
    V.box(-2.75, -2.62, z, z + 2.3, 0, 0.55, c); V.box(2.62, 2.75, z, z + 2.3, 0, 0.55, c);
  }
  for (let s = Math.ceil((sNow + 150) / 6) * 6 - 3; s > sNow - V.Z0; s -= 6) {
    const z = z0 + s; if (z < 1) continue;
    const k = Math.abs(Math.round(s / 6)) % 3;
    V.emoji(['🌳', '🌲', '🚩'][k], -4.2, z, [1.6, 1.6, 1.0][k]);
    V.emoji(['🌲', '🚩', '🌳'][k], 4.2, z, [1.6, 1.0, 1.6][k]);
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
  const SPURT = 12;                                 // 리듬 맞춘 걸음이 이만큼 쌓이면 스퍼트(2.5초 동안 +15%)
  body.innerHTML = `<div class="race2" id="race"><canvas id="race-cv"></canvas>
    <div class="r2-top"><b id="r2-time">0.00</b><span id="r2-rank"></span></div><div class="r2-prog" id="r2-prog"></div>
    <div class="r2-rhythm" id="r2-rhythm"><span>리듬</span><i><i id="r2-rh"></i></i></div>
    <p class="r2-tip" id="r2-tip">발판을 번갈아 가며 눌러 주세요!</p><div class="race-count" id="r2-count">3</div><div class="race-msg" id="r2-msg" hidden></div>
    <div class="r2-pop" id="r2-pop"></div><div class="r2-goal" id="r2-goal">GOAL!</div>
    <button class="r2-pad l" data-p="0" type="button" aria-label="왼발"><span>🐾</span></button><button class="r2-pad r" data-p="1" type="button" aria-label="오른발"><span>🐾</span></button></div>`;
  const el = body.querySelector('#race'), cv = el.querySelector('#race-cv');
  const $ = (q) => el.querySelector(q);
  const $time = $('#r2-time'), $rank = $('#r2-rank'), $prog = $('#r2-prog'), $count = $('#r2-count'), $msg = $('#r2-msg'), $pop = $('#r2-pop'), $rh = $('#r2-rh'), $goal = $('#r2-goal');
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
  let lastStepT = -1, rhythm = 0, spurtUntil = 0, prevRank = 4, cheered = false, leap = 0, lastCount = '';
  const result = { score: 0 };
  const flash = (m, ms = 800) => { $msg.textContent = m; $msg.hidden = false; $msg.classList.remove('big'); clearTimeout(flash.t); flash.t = setTimeout(() => { $msg.hidden = true; }, ms); };
  const pop = (txt, cls = '') => { $pop.textContent = txt; $pop.className = `r2-pop on ${cls}`; clearTimeout(pop.t); pop.t = setTimeout(() => { $pop.className = 'r2-pop'; }, 900); };
  const footPt = (x) => V.p(x.x, V.Z0 + (x.s - Math.min(me.s, L + 0.2)));
  const step = (pad) => {
    if (over || !started || me.fin != null) return;
    if (t < trip) return;
    if (pad === lastPad) { trip = t + 0.45; me.v *= 0.6; rhythm = 0; flash('발이 꼬였어요! 번갈아 눌러요'); sfx.tap(); V.kick(0.35); return; }
    lastPad = pad;
    const spurt = t < spurtUntil;
    me.v = Math.min(VMAX * (spurt ? 1.15 : 1), me.v + A * (spurt ? 1.15 : 1));
    me.frame = pad; me.hop = 1; steps++;
    // 리듬: 걸음 간격 0.10~0.24초면 쌓이고, 느려지면 깎인다
    const gap = t - lastStepT; lastStepT = t;
    if (gap > 0.1 && gap < 0.24) rhythm = Math.min(SPURT, rhythm + 1); else if (gap >= 0.24) rhythm = Math.max(0, rhythm - 2);
    if (rhythm >= SPURT && !spurt) { spurtUntil = t + 2.5; rhythm = 0; pop('스퍼트!', 'gold'); sfx.whoosh(); V.kick(0.3); }
    sfx.step();
    const p = footPt(me);
    if (p) V.emit(p.x + (pad ? 10 : -10), p.y, { n: 4, size: (7 * p.k) / 100 + 4, speed: 70, spread: 1.6, ang: -Math.PI / 2 + (pad ? 0.6 : -0.6), life: 0.5 });
    if (steps === 1) $('#r2-tip')?.remove();
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
  el.__state = () => ({ t, s: me.s, v: me.v, rhythm, spurt: t < spurtUntil });   // 시험용

  const frame = (ts) => {
    const raw = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    // 결승 3m 앞 슬로모션
    const slow = started && me.fin == null && me.s > L - 3 ? 0.4 : 1;
    const dt = raw * slow;
    t += dt;
    if (!started) {
      const left = Math.ceil(3 - t);
      const txt = left > 0 ? String(left) : '출발!';
      if (txt !== lastCount) { lastCount = txt; $count.textContent = txt; $count.classList.remove('pop'); void $count.offsetWidth; $count.classList.add('pop'); if (left > 0) sfx.tap(); }
      if (t >= 3 && IM) {
        started = true; t = 0; sfx.fanfare(); V.kick(0.5);
        for (const x of racers) { const p = footPt(x); if (p) V.emit(p.x, p.y, { n: 10, size: (9 * p.k) / 100 + 3, speed: 120, spread: 2.6, life: 0.7 }); }
        setTimeout(() => $count.remove(), 600);
      }
    } else {
      const spurt = t < spurtUntil;
      if (me.fin == null) { me.v *= Math.exp(-K * dt); if (t < trip) me.v = Math.min(me.v, 3); } else me.v = Math.max(0, me.v - 5 * dt);
      for (const b of racers) {
        if (b.me) continue;
        if (b.fin != null) { b.v = Math.max(0, b.v - 5 * dt); continue; }
        let tv = b.base * (1 + 0.05 * Math.sin(t * 1.4 + b.phase));
        if (b.s > L * 0.72) tv *= 1.05;
        tv *= 1 + clamp((me.s - b.s) / 45, -0.07, 0.07);
        b.v += (tv - b.v) * Math.min(1, dt * (t < 1.2 ? 2.2 : 1.4));
        b.ft += dt * b.v * 0.75;                                 // 봇 걸음: 빠를수록 자주
        if (b.ft >= 1) {
          b.ft = 0; b.frame ^= 1; b.hop = 1;
          const z = V.Z0 + (b.s - me.s);
          if (z > 0.8 && z < 14) { const p = footPt(b); if (p) V.emit(p.x, p.y, { n: 2, size: (6 * p.k) / 100 + 2, speed: 50, life: 0.45 }); }
        }
      }
      for (const x of racers) {
        x.s += x.v * dt;
        x.hop = Math.max(0, x.hop - dt * 6);
        if (x.fin == null && x.s >= L) { x.fin = t - (x.s - L) / Math.max(0.1, x.v); if (x.me) { finAt = t; win(); } }
        if (x.fin != null) x.s = Math.min(x.s, L + 1.2);
      }
      const order = [...racers].sort((a, b) => (a.fin ?? 1e9) - (b.fin ?? 1e9) || b.s - a.s);
      const rank = order.indexOf(me) + 1;
      if (rank < prevRank && me.fin == null && t > 1) { pop(rank === 1 ? '선두로!' : '추월!', rank === 1 ? 'gold' : ''); sfx.whoosh(); V.kick(0.2); }
      prevRank = rank;
      $rank.textContent = `${rank}위`;
      racers.forEach((x, i) => { dots[i].style.left = `${clamp(x.s / L, 0, 1) * 100}%`; });
      if (me.fin == null) $time.textContent = t.toFixed(2);
      if (!cheered && me.s > L - 22) { cheered = true; sfx.cheer(); }
      $rh.style.width = `${spurt ? 100 : (rhythm / SPURT) * 100}%`;
      $rh.parentElement.parentElement.classList.toggle('full', spurt);
      // 카메라: 빠를수록 다가가며 화각 넓게(배경이 빨려 들어감), 걸음마다 출렁·좌우 기울기
      const sp = clamp(me.v / VMAX, 0, 1.2);
      V.dolly += (1 - 0.24 * sp - (spurt ? 0.07 : 0) - V.dolly) * Math.min(1, raw * 4);
      V.roll += ((me.frame ? 1 : -1) * 0.011 * sp - V.roll) * Math.min(1, raw * 8);
      V.bobY = -Math.sin(me.hop * Math.PI) * 6 * sp;
    }
    if (me.fin != null) leap = Math.min(1, leap + raw * 1.4);
    // 그리기 — 먼 것부터
    V.begin(raw);
    const camS = Math.min(me.s, L + 0.2);
    V.sky();
    drawTrack(V, camS, LANES, LW, L);
    V.speedLines(clamp((me.v - 6.2) / 3.5, 0, 1) * (me.fin == null ? 1 : 0) + (t < spurtUntil ? 0.35 : 0), t);
    const zGoal = V.Z0 + (L - camS);
    const half = (LANES / 2) * LW;
    const items = [];
    racers.forEach((x) => items.push({ z: V.Z0 + (L + 1.6 - camS), draw: () => {
      const hug = x.me && leap > 0.6 ? Math.sin(((leap - 0.6) / 0.4) * Math.PI) * 0.04 : 0;
      V.spriteFx(OWN[ownerIdx[x.lane]], x.x, V.Z0 + (L + 1.6 - camS), 1.05, 0, 1, 1 + hug, 0);
    } }));
    items.push({ z: zGoal + 0.01, draw: () => drawGoal(V, zGoal, half) });
    for (const x of racers) {
      // 골인한 내 아이는 보호자 품으로 폴짝
      const lz = x.me && leap > 0 ? Math.sin(leap * Math.PI) * 0.35 : 0;
      const z = V.Z0 + (x.s - camS) + (x.me ? leap * 0.25 : 0);
      items.push({ z, draw: () => {
        if (!x.im) return;
        V.shadow(x.x, z, SIZE[x.type] * 0.55);
        const sq = 1 - 0.07 * x.hop + 0.06 * Math.sin(x.hop * Math.PI);
        const rot = (x.frame ? 1 : -1) * 0.05 * (0.35 + 0.65 * x.hop) * clamp(x.v / 6, 0, 1);
        const sway = (x.frame ? 1 : -1) * 0.025 * clamp(x.v / 6, 0, 1);
        const sp = V.spriteFx(x.im[x.frame], x.x + sway, z, SIZE[x.type], x.hop * 0.07 + lz, 1, sq, rot);
        if (sp && !x.me && sp.h > 14) { const g = V.g; g.font = `900 ${Math.max(10, Math.round(sp.h * 0.16))}px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(45,42,38,.75)'; g.fillText(x.name, sp.x, sp.y - sp.h - 2); }
        if (x.me && t < spurtUntil && sp) { const g = V.g; g.globalAlpha = 0.3 + 0.15 * Math.sin(t * 20); g.fillStyle = '#FFD45E'; g.beginPath(); g.ellipse(sp.x, sp.y - sp.h * 0.45, sp.w * 0.62, sp.h * 0.6, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      } });
    }
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    V.drawParts(raw);
    V.vignette('rgba(255,200,80,A)', t < spurtUntil ? 0.28 : 0);
    V.end();
    if (finAt != null && t - finAt > 2.6 && !over) { over = true; cleanup(); done(result.score); return; }
    raf = requestAnimationFrame(frame);
  };
  const win = () => {
    const placeNo = 1 + racers.filter((x) => !x.me && x.fin != null && x.fin < me.fin).length;
    result.score = [100, 70, 50, 30][placeNo - 1] + Math.max(0, Math.round((16 - me.fin) * 5));
    ctx.note = `${placeNo}등 · ${me.fin.toFixed(2)}초`;
    $time.textContent = me.fin.toFixed(2);
    if (placeNo === 1) sfx.fanfare(); else sfx.coin();
    sfx.cheer();
    V.kick(0.45);
    $goal.classList.add('on');
    // 색종이: 화면 위쪽 전체에서 쏟아진다
    V.emit(V.W / 2, V.H * 0.05, { n: placeNo === 1 ? 140 : 70, kind: 'confetti', speed: 260, spread: Math.PI * 1.2, ang: Math.PI / 2, life: 2.4, size: 11, grav: 220, w: V.W, color: ['#E8657A', '#FFD45E', '#4F8FC0', '#3F6B4F', '#F2A93B', '#fff'] });
    setTimeout(() => {
      $msg.innerHTML = `<b>${placeNo}등!</b><span>${placeNo === 1 ? '보호자 품으로 1등 골인!' : '보호자 품으로 골인!'} ${me.fin.toFixed(2)}초</span>`;
      $msg.hidden = false; $msg.classList.add('big');
    }, 700);
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(flash.t); clearTimeout(pop.t); };
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
    if (k === 'tunnel') { parts.push({ k, at, len: 4, bend: (r() < 0.5 ? -1 : 1) * 0.8 }); checks.push({ at, dir: 'down', k }); at += 12; }
    if (k === 'weave') {
      const first = r() < 0.5 ? 'left' : 'right';
      const poles = [];
      for (let i = 0; i < 6; i++) { const dir = i % 2 ? (first === 'left' ? 'right' : 'left') : first; poles.push({ at: at + i * 1.6, dir }); checks.push({ at: at + i * 1.6, dir, k }); }
      parts.push({ k, at, poles }); at += 6 * 1.6 + 8;
    }
    if (k === 'aframe') { parts.push({ k, at, len: 6 }); checks.push({ at, dir: 'up', k }); checks.push({ at: at + 3, dir: 'down', k }); at += 6 + 9; }
  }
  const END = at + 4;
  const AH = 1.5;   // A자 경사로 꼭대기(m) — 실제 대회 1.7m 안팎
  body.innerHTML = `<div class="race2 ag2" id="ag"><canvas id="ag-cv"></canvas>
    <div class="r2-top"><span id="ag-life">♥♥♥</span><b id="ag-score">0점</b><span id="ag-combo"></span></div><div class="r2-prog ag-prog2"><i id="ag-bar"></i></div>
    <div class="ag-judge" id="ag-judge"></div>
    <div class="ag-legend">${dog ? '<span><b style="--c:#E8657A">↑</b>허들·경사로 오르기</span><span><b style="--c:#4F8FC0">↓</b>터널·경사로 내려가기</span><span><b style="--c:#C98A2E">←</b><b style="--c:#3F6B4F">→</b>위브 폴 지그재그</span>' : '<span><b style="--c:#E8657A">↑</b>허들·경사로 오르기</span><span><b style="--c:#4F8FC0">↓</b>터널·경사로 내려가기</span><span><b style="--c:#C98A2E">←</b><b style="--c:#3F6B4F">→</b>폴 사이 지그재그</span>'}</div>
    <div class="ag-pad" id="ag-pad">${['up', 'left', 'down', 'right'].map((d) => `<button type="button" data-d="${d}" class="ag-${d}" style="--c:${COLOR[d]}">${ARROW[d]}</button>`).join('')}</div>
    <div class="race-count" id="ag-count">3</div></div>`;
  const el = body.querySelector('#ag'), cv = el.querySelector('#ag-cv');
  const $life = el.querySelector('#ag-life'), $score = el.querySelector('#ag-score'), $combo = el.querySelector('#ag-combo'), $bar = el.querySelector('#ag-bar'), $judge = el.querySelector('#ag-judge'), $count = el.querySelector('#ag-count');
  const V = makeView(cv);
  V.Z0b = 3.4; V.size();
  let IM = null, OWN = null;
  Promise.all([backFrames(ctx.type, ctx.stage), owners()]).then(([fr, ow]) => { IM = fr; OWN = ow[Math.floor(r() * 4)]; });
  let t = 0, last = 0, raf = 0, over = false, started = false, s = 0, lives = 3, score = 0, combo = 0, maxCombo = 0, perfect = 0, good = 0, ended = false;
  let frameNo = 0, ft = 0, jump = 0, duck = 0, sway = 0, swayTo = 0, slowUntil = 0, hitT = -9;
  const speed = () => 5.2 + Math.min(2.4, (s / END) * 2.4);
  const judge = (txt, cls) => { $judge.textContent = txt; $judge.className = `ag-judge on ${cls}`; clearTimeout(judge.t); judge.t = setTimeout(() => { $judge.className = 'ag-judge'; }, 650); };
  const groundY = (pos) => {   // A자 경사로 위면 높이
    for (const p of parts) if (p.k === 'aframe' && pos > p.at && pos < p.at + p.len) { const u = (pos - p.at) / p.len; return AH * (1 - Math.abs(u * 2 - 1)); }
    return 0;
  };
  const act = (d, c) => {
    if (d === 'up' && c.k === 'hurdle') jump = 1;
    if (d === 'down' && c.k === 'tunnel') duck = 1;
    if (d === 'left' || d === 'right') swayTo = d === 'left' ? -0.46 : 0.46;
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
    const pp = V.p(sway, V.Z0, groundY(s) + 0.4);
    if (err < 0.5) {
      perfect++; score += 100 + combo * 5; judge(combo >= 5 ? `완벽! ×${combo}` : '완벽!', 'perfect'); sfx.coin();
      slowUntil = t + 0.12; V.kick(0.12);
      if (pp) V.emit(pp.x, pp.y - 30, { n: 16, kind: 'spark', speed: 220, spread: Math.PI * 2, life: 0.5, size: 5, color: ['#FFD45E', '#FFF3B0', '#fff'] });
    } else {
      good++; score += 60 + combo * 3; judge('좋아요', 'good'); sfx.pop();
      if (pp) V.emit(pp.x, pp.y - 30, { n: 7, kind: 'spark', speed: 140, spread: Math.PI * 2, life: 0.4, size: 4, color: ['#BFE3C6', '#fff'] });
    }
  };
  const miss = (c, why) => { c.state = 'miss'; combo = 0; lives--; judge(why, 'miss'); sfx.tap(); V.kick(0.6); hitT = t; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); };
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
  const TR = 0.45, AW = 0.6;   // 터널 반지름(실제 지름 60cm 안팎) · 경사로 반폭
  const tunnelX = (p, pos) => p.bend * Math.sin(Math.PI * clamp((pos - p.at) / p.len, 0, 1));   // 휘어진 터널의 가운데 선
  const tunnelNow = () => parts.find((p) => p.k === 'tunnel' && s > p.at && s < p.at + p.len);
  const G = V.g;
  const drawAframe = (zA, zP, zB) => {
    const yAt = (zz) => (zz <= zA || zz >= zB ? 0 : AH * (1 - Math.abs(((zz - zA) / (zB - zA)) * 2 - 1)));
    const run = (zB - zA) / 2, zone = run * (1.06 / Math.hypot(run, AH));   // 접촉 구역: 경사면 따라 1.06m
    V.quad(-AW - 0.2, AW + 0.2, Math.max(zA, 0.7), zB + 0.5, 'rgba(60,40,20,.15)');
    // 한쪽 면: 판 + 노란 접촉 구역 + 미끄럼 방지 살 + 양옆 난간
    const slope = (z0, z1, top, c0, c1) => {
      z0 = Math.max(z0, 0.7);
      if (z1 <= z0) return;
      V.quad(-AW, AW, z0, z1, top, yAt(z0), yAt(z1));
      const a = Math.max(c0, z0), b = Math.min(c1, z1);
      if (b > a) V.quad(-AW, AW, a, b, '#F2D24B', yAt(a), yAt(b));
      for (let zz = zA + 0.15; zz < zB; zz += 0.3) if (zz > z0 && zz + 0.05 < z1) { const y = yAt(zz); V.box(-AW + 0.05, AW - 0.05, zz, zz + 0.05, y, y + 0.025, zz > c0 && zz < c1 ? '#D9B42C' : shade(top, 0.82)); }
      for (const [x0, x1, xi] of [[-AW - 0.02, -AW + 0.05, -AW + 0.05], [AW - 0.05, AW + 0.02, AW - 0.05]]) {
        V.poly([[xi, z0, yAt(z0)], [xi, z1, yAt(z1)], [xi, z1, yAt(z1) + 0.08], [xi, z0, yAt(z0) + 0.08]], '#6E4220');
        V.poly([[x0, z0, yAt(z0) + 0.08], [x1, z0, yAt(z0) + 0.08], [x1, z1, yAt(z1) + 0.08], [x0, z1, yAt(z1) + 0.08]], '#8A5A30');
      }
    };
    slope(zP, zB, '#C98446', zB - zone, zB);   // 먼 쪽(내려가는 면)
    slope(zA, zP, '#D9894A', zA, zA + zone);   // 오르는 면
    if (zP > 0.75) V.box(-AW - 0.02, AW + 0.02, zP - 0.04, zP + 0.04, AH, AH + 0.05, '#6E4220');   // 꼭대기 이음새
  };
  // 장애물 → 그릴 거리(z)별 조각들. 터널은 고리 14개로 나눠 아이 앞뒤를 제대로 가린다
  const addPart = (p, items) => {
    const z = V.Z0 + (p.at - s);
    if (p.k === 'hurdle') {
      if (z < 0.7 || z > 120) return;
      items.push({ z, draw: () => {
        V.quad(-0.8, 0.8, z + 0.05, z + 0.32, 'rgba(60,40,20,.13)');
        for (const [x0, x1] of [[-1.04, -0.8], [0.8, 1.04]]) { V.box(x0, x1, z - 0.03, z + 0.05, 0, 0.92, '#4F8FC0'); V.box(x0, x1, z - 0.03, z + 0.05, 0.92, 0.98, '#FFFFFF'); }   // 날개 판
        V.box(-0.8, 0.8, z, z + 0.05, 0.42, 0.48, '#FFFFFF');
        for (let i = 0; i < 6; i += 2) {
          const a = -0.8 + (1.6 * i) / 6, b = -0.8 + (1.6 * (i + 1)) / 6;
          V.poly([[a, z, 0.42], [b, z, 0.42], [b, z, 0.48], [a, z, 0.48]], '#E8657A');
          V.poly([[a, z, 0.48], [b, z, 0.48], [b, z + 0.05, 0.48], [a, z + 0.05, 0.48]], '#F08A9A');
        }
      } });
    }
    if (p.k === 'tunnel') {
      const N = 14;
      for (let i = N; i >= 0; i--) {
        const ps = p.at + (p.len * i) / N, zz = V.Z0 + (ps - s);
        if (zz < 0.8 || zz > 140) continue;
        const xc = tunnelX(p, ps);
        items.push({ z: zz + 0.002, draw: () => {
          const c = V.p(xc, zz, TR);
          if (!c) return;
          const rr = TR * c.k, front = zz < V.Z0 - 0.05;   // 아이보다 카메라 쪽 고리는 반투명(천 너머로 아이가 비친다)
          if (front) {   // 카메라 쪽: 천은 아주 옅게, 뼈대 고리만 또렷이 — 안의 아이가 보이게
            const fa = clamp((zz - 0.8) / 1.4, 0, 1);
            if (fa < 0.02) return;
            G.globalAlpha = 0.04 * fa; G.fillStyle = '#4F8FC0'; G.beginPath(); G.arc(c.x, c.y, rr, 0, Math.PI * 2); G.fill();
            G.globalAlpha = 0.75 * fa; G.strokeStyle = '#2F5F8A'; G.lineWidth = Math.max(2, 0.05 * c.k); G.stroke();
            G.globalAlpha = 1;
            return;
          }
          const inside = s > p.at - 0.1 && s < p.at + p.len;   // 아이가 안에 있으면 먼 고리는 안쪽 벽(더 어둡게)
          G.globalAlpha = 1;
          G.fillStyle = inside ? (i % 2 ? '#2F5F8A' : '#285378') : (i % 2 ? '#4F8FC0' : '#3D78A8');
          G.beginPath(); G.arc(c.x, c.y, rr, 0, Math.PI * 2); G.fill();
          G.strokeStyle = 'rgba(20,50,80,.5)'; G.lineWidth = Math.max(1, 0.03 * c.k); G.stroke();
          G.fillStyle = 'rgba(255,255,255,.2)'; G.beginPath(); G.ellipse(c.x - rr * 0.25, c.y - rr * 0.6, rr * 0.5, rr * 0.2, -0.3, 0, Math.PI * 2); G.fill();
          if (i === 0 && !front) {   // 입구: 깊은 구멍
            const gr = G.createRadialGradient(c.x, c.y, rr * 0.1, c.x, c.y, rr * 0.84);
            gr.addColorStop(0, '#0B1622'); gr.addColorStop(1, '#2A4866');
            G.fillStyle = gr; G.beginPath(); G.arc(c.x, c.y, rr * 0.84, 0, Math.PI * 2); G.fill();
          }
          G.globalAlpha = 1;
        } });
      }
    }
    if (p.k === 'weave') {
      const zA = V.Z0 + (p.poles[0].at - s) - 0.4, zB = V.Z0 + (p.poles[p.poles.length - 1].at - s) + 0.4;
      if (zB > 0.7 && zA < 120) items.push({ z: zB + 0.01, draw: () => V.box(-0.04, 0.04, zA, zB, 0, 0.03, '#9AA3AD') });   // 바닥 레일
      for (const q of p.poles) {
        const zz = V.Z0 + (q.at - s);
        if (zz < 0.7 || zz > 120) continue;
        items.push({ z: zz, draw: () => { V.shadow(0.08, zz + 0.06, 0.28); V.pole(0, zz, 1.0, 0.028, ['#F2A93B', '#FFFFFF']); } });
      }
    }
    if (p.k === 'aframe') {
      const zA = z, zP = zA + p.len / 2, zB = zA + p.len;
      if (zB < 0.7 || zA > 140) return;
      const on = s > p.at - 0.5 && s < p.at + p.len;
      items.push({ z: on ? V.Z0 + 0.01 : zA + 3, draw: () => drawAframe(zA, zP, zB) });   // 경사로 위에 있을 땐 늘 아이 밑에
    }
  };
  let lastCount = '';
  const frame = (ts) => {
    const raw = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    const dt = raw * (t < slowUntil ? 0.4 : 1);   // 완벽이면 아주 잠깐 슬로모션
    t += dt;
    if (!started) {
      const left = Math.ceil(3 - t);
      const txt = left > 0 ? String(left) : '출발!';
      if (txt !== lastCount) { lastCount = txt; $count.textContent = txt; $count.classList.remove('pop'); void $count.offsetWidth; $count.classList.add('pop'); if (left > 0) sfx.tap(); }
      if (t >= 3 && IM) { started = true; t = 0; sfx.fanfare(); V.kick(0.4); setTimeout(() => $count.remove(), 600); }
    } else if (!ended) {
      s += speed() * dt;
      for (const c of checks) if (!c.state && c.at - s < -0.4) miss(c, '놓쳤어요!');
      if (lives <= 0) finish(false);
      else if (s >= END - 2.5) finish(true);
    }
    ft += dt * speed() * 0.9;
    if (ft >= 1) {
      ft = 0; frameNo ^= 1;
      if (started && jump <= 0 && groundY(s) === 0) { sfx.step(); const fp = V.p(sway, V.Z0); if (fp) V.emit(fp.x + (frameNo ? 10 : -10), fp.y, { n: 3, size: 6, speed: 60, spread: 1.4, ang: -Math.PI / 2 + (frameNo ? 0.6 : -0.6), life: 0.45 }); }
    }
    jump = Math.max(0, jump - dt * 1.9); duck = Math.max(0, duck - dt * 1.4);
    const inWeave = parts.some((p) => p.k === 'weave' && s > p.at - 1.5 && s < p.at + p.poles.length * 1.6);
    sway += (swayTo - sway) * Math.min(1, dt * 10); if (!inWeave) swayTo *= Math.exp(-dt * 3);   // 위브 중엔 다음 폴까지 그 쪽에 머문다
    const tp = tunnelNow(); if (tp) { sway = tunnelX(tp, s); swayTo = sway; }   // 휘어진 터널은 길 따라
    // 카메라: 빠를수록 다가가며 화각 넓게 · 점프·경사로면 따라 오르고 · 지그재그면 기울기
    const hj = jump > 0 ? Math.sin(jump * Math.PI) * 0.55 : 0;
    const spN = clamp((speed() - 5.2) / 2.4, 0, 1);
    V.dolly += (1 - 0.12 - 0.14 * spN - (combo >= 8 ? 0.05 : 0) - V.dolly) * Math.min(1, raw * 3);
    V.HC += (V.HCb + groundY(s) * 0.85 + hj * 0.3 - V.HC) * Math.min(1, raw * 7);   // 경사로·점프면 카메라도 실제로 같이 올라간다
    V.pitch += (hj * V.H * 0.05 - V.pitch) * Math.min(1, raw * 6);
    V.camX += (sway * (tp ? 0.75 : inWeave ? 0.12 : 0.35) - V.camX) * Math.min(1, raw * 6);   // 좌우로 따라가며 가까운 것·먼 것이 다르게 움직인다(시차)
    V.roll += (sway * 0.07 + (frameNo ? 1 : -1) * 0.004 - V.roll) * Math.min(1, raw * 8);
    V.bobY = -Math.abs(Math.sin(ft * Math.PI)) * 4;
    // 그리기
    V.begin(raw);
    V.sky();
    drawArena(V, s);
    V.speedLines(0.25 + spN * 0.35 + (combo >= 8 ? 0.35 : 0), t);
    const items = [];
    for (const p of parts) addPart(p, items);
    // 화살표 표시(다음 3개)
    checks.filter((c) => !c.state).slice(0, 3).forEach((c, i) => {
      const z = V.Z0 + (c.at - s);
      items.push({ z: z - 0.01, draw: () => { const p = V.p(c.k === 'weave' ? (c.dir === 'left' ? -0.46 : 0.46) : 0, z, c.k === 'tunnel' ? 1.25 : c.k === 'aframe' ? groundY(c.at + 0.01) + 0.95 : 1.3); if (!p) return; const rr = Math.max(9, Math.min(30, 0.22 * p.k)); V.g.globalAlpha = i ? 0.6 : 1; V.g.fillStyle = COLOR[c.dir]; V.g.beginPath(); V.g.arc(p.x, p.y, rr, 0, Math.PI * 2); V.g.fill(); V.g.strokeStyle = '#fff'; V.g.lineWidth = 3; V.g.stroke(); V.g.fillStyle = '#fff'; V.g.font = `900 ${Math.round(rr * 1.3)}px sans-serif`; V.g.textAlign = 'center'; V.g.textBaseline = 'middle'; V.g.fillText(ARROW[c.dir], p.x, p.y + 1); V.g.globalAlpha = 1; } });
    });
    const zEnd = V.Z0 + (END - s);
    if (OWN) items.push({ z: zEnd, draw: () => { drawGoal(V, zEnd, 0.9); V.sprite(OWN, 0, zEnd + 0.4, 1.05); } });
    // 아이(뒷모습): 점프·숙이기·지그재그·경사로 높이
    items.push({ z: V.Z0 - 0.001, draw: () => {
      if (!IM) return;
      const hy = groundY(s) + Math.sin(jump * Math.PI) * 0.55 * (jump > 0 ? 1 : 0);
      const gy = groundY(s);
      V.shadow(sway, V.Z0, SIZE[ctx.type] * 0.55 * (1 - (hy - gy) * 0.6), gy);   // 뛰면 그림자가 작아진다
      const inTunnel = !!tunnelNow();
      const h = SIZE[ctx.type] * (1 - Math.sin(duck * Math.PI) * 0.35) * (inTunnel ? 0.82 : 1);
      const ph = Math.abs(Math.sin(ft * Math.PI));
      const sq = jump > 0 ? 1 + Math.sin(jump * Math.PI) * 0.08 : 1 - 0.05 * ph;
      V.spriteFx(IM[frameNo], sway, V.Z0, h, hy, 1, sq, (frameNo ? 1 : -1) * 0.04 + sway * 0.4);
    } });
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    V.drawParts(raw);
    const camIn = parts.some((p) => p.k === 'tunnel' && s - V.Z0 * 0.6 > p.at && s - V.Z0 * 0.6 < p.at + p.len);
    V.vignette('rgba(20,40,70,A)', camIn ? 0.45 : 0);
    V.vignette('rgba(230,60,60,A)', Math.max(0, 0.45 - (t - hitT) * 1.2));
    V.vignette('rgba(255,170,60,A)', combo >= 8 ? 0.22 : 0);
    V.end();
    $life.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $bar.style.width = `${clamp(s / END, 0, 1) * 100}%`;
    $combo.textContent = combo >= 3 ? `${combo >= 8 ? '🔥 ' : ''}${combo} 콤보` : '';
    $combo.classList.toggle('fire', combo >= 8);
    $score.textContent = `${score}점`;
    raf = requestAnimationFrame(frame);
  };
  const finish = (clear) => {
    if (ended) return;
    ended = true;
    const total = score + maxCombo * 10 + (clear ? 200 + lives * 50 : 0);
    ctx.note = clear ? `완주! 완벽 ${perfect} · 좋아요 ${good} · 최대 ${maxCombo}콤보` : `${checks.filter((c) => c.state).length}/${checks.length}에서 넘어졌어요`;
    if (clear) {
      sfx.fanfare(); sfx.cheer(); V.kick(0.4); judge(`완주! 완벽 ${perfect} · 좋아요 ${good}`, 'perfect');
      V.emit(V.W / 2, V.H * 0.05, { n: 120, kind: 'confetti', speed: 260, spread: Math.PI * 1.2, ang: Math.PI / 2, life: 2.4, size: 11, grav: 220, w: V.W, color: ['#E8657A', '#FFD45E', '#4F8FC0', '#3F6B4F', '#F2A93B', '#fff'] });
    }
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
