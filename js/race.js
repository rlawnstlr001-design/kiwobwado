// 경주 미니게임 2종(10/26 사용자 — '가족이되어주세요' 경주 오마주)
// ① 반려 경주: 봇 3마리와 100m. 결승선에서 각자의 보호자가 팔을 벌리고 기다리고, 가까워질수록 커진다(원근).
//    화면을 톡톡 눌러 속도를 올린다 — 너무 빨리 누르면 숨이 차서(체력 0) 잠깐 느려진다 → 리듬이 실력.
// ② 장애물 경주: 다가오는 장애물에 맞춰 ↑ 허들 뛰어넘기 · ↓ 터널 기어가기 · → 웅덩이 멀리뛰기 · ← 기다려 테이블.
//    해낸 '바로 그때' 누르면 완벽, 조금 어긋나면 좋아요, 틀리거나 놓치면 넘어짐(♥ −1). 끝까지 가면 보호자 품으로.
// 나중에 여럿이 겨루기: 봇 속도·코스는 seed로 정해지는 결정적 값 → 같은 seed면 같은 판(기록 경쟁·고스트 대전으로 키우기 쉽게)
// 그림: 아이·봇 = art/clip/<성향>_<단계>_walk.webp(오른쪽을 보고 걷는 움직이는 그림), 보호자 = art/race/owner0~3.webp(tools/make_owners.py)

import { sfx } from './sound.js?v=202610261149';
import { clipInfo } from './room.js?v=202610261149';
import { rng } from './engine.js?v=202610261149';

const TYPES = ['small', 'medium', 'large', 'short', 'long'];
const SIZE = { small: 0.8, medium: 0.95, large: 1.1, short: 0.82, long: 0.86 };
const BOT_NAMES = ['초코', '몽이', '까미', '쿠키', '라떼', '호떡', '감자', '모찌', '탄이', '별이'];
const shuffleR = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const img = (src, cls) => { const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = cls; i.draggable = false; return i; };

// ---------- ① 반려 경주 ----------
export function raceGame(body, ctx, done) {
  const seed = `${Date.now()}`;
  const r = rng(`race:${seed}`);
  const L = 100;                         // 경주 거리(m)
  const Z0 = 4;                          // 카메라 ~ 내 아이 거리(m)
  const VMAX = 9.6, K = 1.15, A = 1.75;  // 최고 속도·감속·한 번 누를 때 힘
  const COST = 7, REGEN = 42;            // 숨: 한 번 누를 때 −7, 1초에 +42 → 1초에 6번 리듬이 최적
  const stage = ctx.stage;
  body.innerHTML = `<div class="race" id="race"><canvas class="race-cv" id="race-cv"></canvas><div class="race-layer" id="race-layer"></div>
    <div class="race-hud"><b class="race-rank" id="race-rank">-</b><div class="race-prog" id="race-prog"></div></div>
    <div class="race-stam"><span>숨</span><i><i id="race-stam"></i></i></div>
    <p class="race-tip" id="race-tip">화면을 리듬 있게 톡톡! 너무 빨리 누르면 숨이 차요</p>
    <div class="race-count" id="race-count">3</div><div class="race-msg" id="race-msg" hidden></div></div>`;
  const el = body.querySelector('#race'), cv = el.querySelector('#race-cv'), g = cv.getContext('2d'), layer = el.querySelector('#race-layer');
  const $rank = el.querySelector('#race-rank'), $prog = el.querySelector('#race-prog'), $stam = el.querySelector('#race-stam'), $count = el.querySelector('#race-count'), $msg = el.querySelector('#race-msg');
  let W = 0, H = 0, dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { W = el.clientWidth; H = el.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  // 출전: 나(맨 앞 줄 = 3번 줄) + 다른 성향 3마리(같은 단계)
  const others = shuffleR(TYPES.filter((t) => t !== ctx.type), r).slice(0, 3);
  const names = shuffleR(BOT_NAMES.filter((n) => n !== ctx.petName), r);
  const owners = shuffleR([0, 1, 2, 3], r);
  const base = shuffleR([7.35, 7.85, 8.35], r);
  const racers = [
    ...others.map((t, i) => ({ name: names[i], type: t, lane: i, me: false, base: base[i] + (r() - 0.5) * 0.3, phase: r() * 6 })),
    { name: ctx.petName, type: ctx.type, lane: 3, me: true },
  ].map((x) => {
    const c = clipInfo(`${x.type}_${stage}`, 'walk') ?? { src: `art/sprite/${x.type}_${stage}_idle.webp`, ratio: 1 };
    const node = document.createElement('div');
    node.className = `race-pet${x.me ? ' me' : ''}`;
    node.appendChild(img(c.src, 'race-pet-img'));
    const tag = document.createElement('span'); tag.className = 'race-tag'; tag.textContent = x.me ? `${x.name} (나)` : x.name; node.appendChild(tag);
    layer.appendChild(node);
    const own = img(`art/race/owner${owners[x.lane]}.webp`, `race-owner${x.me ? ' me' : ''}`);
    layer.appendChild(own);
    return { ...x, s: 0, v: 0, node, own, ratio: c.ratio || 1, fin: null };
  });
  const me = racers.find((x) => x.me);
  $prog.innerHTML = racers.map((x) => `<i class="${x.me ? 'me' : ''}" data-l="${x.lane}"></i>`).join('');
  const dots = [...$prog.children];

  // 원근: 트랙은 왼쪽 아래(가까움) → 오른쪽 위 소실점(멂). 줄은 트랙과 수직 방향으로 벌어진다
  const geo = () => {
    const P0 = { x: W * 0.24, y: H * 0.7 }, VP = { x: W * 0.78, y: H * 0.32 };
    const dx = VP.x - P0.x, dy = VP.y - P0.y, n = Math.hypot(dx, dy);
    return { P0, VP, px: -dy / n, py: dx / n, LG: H * 0.14 };
  };
  let G = geo();
  let camS = -Z0;
  const proj = (s, lane) => {
    const z = s - camS;
    if (z < 1.6) return null;   // 카메라 바로 앞(뒤처진 아이)은 화면을 가리지 않게 숨긴다
    const f = Z0 / z;
    const o = (lane - 1.5) * G.LG * f;
    return { x: G.VP.x + (G.P0.x - G.VP.x) * f + G.px * o, y: G.VP.y + (G.P0.y - G.VP.y) * f + G.py * o, f, z };
  };
  const drawWorld = () => {
    const { VP } = G;
    // 하늘·잔디
    const sky = g.createLinearGradient(0, 0, 0, VP.y);
    sky.addColorStop(0, '#BFDDF0'); sky.addColorStop(1, '#EAF4F2');
    g.fillStyle = sky; g.fillRect(0, 0, W, VP.y);
    const grass = g.createLinearGradient(0, VP.y, 0, H);
    grass.addColorStop(0, '#CFE3B5'); grass.addColorStop(1, '#A9CB86');
    g.fillStyle = grass; g.fillRect(0, VP.y, W, H - VP.y);
    // 먼 산
    g.fillStyle = '#B8D3A6';
    g.beginPath(); g.moveTo(0, VP.y); g.quadraticCurveTo(W * 0.25, VP.y - H * 0.12, W * 0.5, VP.y); g.quadraticCurveTo(W * 0.75, VP.y - H * 0.08, W, VP.y); g.closePath(); g.fill();
    // 트랙(가까운 끝 ~ 소실점)
    const near = camS + Z0 * 0.45;
    const a = proj(near, -0.6), b = proj(near, 3.6);
    if (!a || !b) return;
    g.fillStyle = '#E3C89A';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(VP.x, VP.y); g.closePath(); g.fill();
    // 줄 경계(직선으로 소실점에 모인다)
    g.strokeStyle = 'rgba(255,255,255,.85)';
    for (let k = -0.5; k <= 3.5; k++) { const p = proj(near, k); g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(VP.x, VP.y); g.stroke(); }
    // 가로 줄무늬(속도감) 5m마다
    g.strokeStyle = 'rgba(160,120,70,.18)';
    for (let s = Math.ceil(near / 5) * 5; s < camS + 140; s += 5) {
      const p = proj(s, -0.5), q = proj(s, 3.5); if (!p) continue;
      g.lineWidth = Math.max(1, 6 * p.f); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    // 출발선·결승선(체크무늬)
    for (const [s, chk] of [[0, false], [L, true]]) {
      const p = proj(s, -0.5), q = proj(s, 3.5); if (!p) continue;
      const seg = 12;
      for (let i = 0; i < seg; i++) {
        const t0 = i / seg, t1 = (i + 1) / seg;
        g.strokeStyle = chk ? (i % 2 ? '#2D2A26' : '#fff') : '#fff';
        g.lineWidth = Math.max(2, 14 * p.f);
        g.beginPath(); g.moveTo(p.x + (q.x - p.x) * t0, p.y + (q.y - p.y) * t0); g.lineTo(p.x + (q.x - p.x) * t1, p.y + (q.y - p.y) * t1); g.stroke();
      }
    }
    // 결승선 깃발 기둥 + 현수막
    const fp = proj(L, -0.9), fq = proj(L, 3.9);
    if (fp && fq) {
      const hgt = H * 0.75 * fp.f;
      g.strokeStyle = '#7A5A3A'; g.lineWidth = Math.max(2, 8 * fp.f);
      g.beginPath(); g.moveTo(fp.x, fp.y); g.lineTo(fp.x, fp.y - hgt); g.moveTo(fq.x, fq.y); g.lineTo(fq.x, fq.y - hgt); g.stroke();
      g.fillStyle = '#E8657A';
      g.beginPath(); g.moveTo(fp.x, fp.y - hgt); g.lineTo(fq.x, fq.y - hgt); g.lineTo(fq.x, fq.y - hgt * 0.82); g.lineTo(fp.x, fp.y - hgt * 0.82); g.closePath(); g.fill();
      if (fp.f > 0.12) { g.fillStyle = '#fff'; g.font = `900 ${Math.round(70 * fp.f)}px Pretendard, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOAL', (fp.x + fq.x) / 2, (fp.y + fq.y) / 2 - hgt * 0.91); }
    }
    // 길가 나무·깃발(8m마다)
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let s = Math.ceil(near / 8) * 8; s < camS + 160; s += 8) {
      for (const [lane, e] of [[5, (s / 8) % 3 ? '🌲' : (s / 8) % 2 ? '🌼' : '🚩']]) {   // 가까운 쪽 길가만(먼 쪽은 하늘로 떠 보인다)
        const p = proj(s, lane); if (!p || p.f < 0.04 || p.f > 0.75) continue;
        g.font = `${Math.round(H * 0.22 * p.f)}px sans-serif`; g.fillText(e, p.x, p.y);
      }
    }
  };
  const place = () => {
    for (const x of racers) {
      // 아이: 발이 줄 가운데. 달릴 때 살짝 통통
      const p = proj(x.s, x.lane);
      if (!p) { x.node.style.display = 'none'; } else {
        const h = H * 0.2 * SIZE[x.type] * p.f;
        const bob = x.v > 0.5 && !x.home ? Math.abs(Math.sin(t * (6 + x.v))) * 5 * p.f : 0;
        x.node.style.display = '';
        x.node.style.cssText = `display:block;left:${p.x}px;top:${p.y - bob}px;height:${h}px;z-index:${Math.round(5000 - p.z * 20) + x.lane}`;
      }
      // 보호자: 결승선 너머 2m, 같은 줄
      const o = proj(L + 2.2, (x.lane - 1.5) * 1.8 + 1.5);   // 보호자는 줄 간격보다 넓게 서서 덜 겹친다
      if (!o) { x.own.style.display = 'none'; } else {
        x.own.style.cssText = `display:block;left:${o.x}px;top:${o.y}px;height:${H * 0.45 * o.f}px;z-index:${Math.round(5000 - o.z * 20) + x.lane}`;
      }
    }
  };

  let t = 0, last = 0, raf = 0, over = false, started = false, startAt = 3, stam = 100, tired = 0, finAt = null, taps = 0;
  const tap = (e) => {
    e?.preventDefault?.();
    if (over || !started || me.fin != null) return;
    taps++;
    if (t < tired) { me.v += A * 0.2; return; }
    stam -= COST;
    me.v += A;
    if (stam <= 0) { stam = 0; tired = t + 1.2; flash('헥헥… 숨이 차요!'); }
    if (taps === 1) el.querySelector('#race-tip')?.remove();
  };
  const flash = (m, ms = 900) => { $msg.textContent = m; $msg.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { $msg.hidden = true; }, ms); };
  el.addEventListener('pointerdown', tap);
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowRight') tap(e); };
  addEventListener('keydown', onKey);
  const onResize = () => { size(); G = geo(); };
  addEventListener('resize', onResize);

  const frame = (ts) => {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts; t += dt;
    if (!started) {
      const left = Math.ceil(startAt - t);
      $count.textContent = left > 0 ? String(left) : '출발!';
      if (t >= startAt) { started = true; t = 0; sfx.fanfare(); setTimeout(() => $count.remove(), 600); }
    } else {
      // 나
      if (me.fin == null) {
        me.v *= Math.exp(-K * dt);
        me.v = Math.min(me.v, t < tired ? 4.5 : VMAX);
        stam = Math.min(100, stam + REGEN * dt);
      } else me.v = Math.max(0, me.v - 6 * dt);
      // 봇: 기본 속도 + 흔들림 + 막판 스퍼트 + 살짝 따라잡기(너무 멀어지지 않게)
      for (const b of racers) {
        if (b.me) continue;
        if (b.fin != null) { b.v = Math.max(0, b.v - 6 * dt); continue; }
        let tv = b.base * (1 + 0.05 * Math.sin(t * 1.4 + b.phase));
        if (b.s > L * 0.72) tv *= 1.05;
        tv *= 1 + clamp((me.s - b.s) / 45, -0.07, 0.07);
        b.v += (tv - b.v) * Math.min(1, dt * (t < 1.2 ? 2.2 : 1.4));
      }
      for (const x of racers) {
        const before = x.s;
        x.s += x.v * dt;
        if (x.fin == null && x.s >= L) { x.fin = t - (x.s - L) / Math.max(0.1, x.v); if (x.me) { finAt = t; win(); } }
        if (x.fin != null) x.s = Math.min(x.s, L + 1.6), x.home = x.s >= L + 1.5;
        void before;
      }
      if (me.fin == null) camS = me.s - Z0;
      // 순위·진행
      const order = [...racers].sort((a, b) => (a.fin ?? 1e9) - (b.fin ?? 1e9) || b.s - a.s);
      $rank.textContent = `${order.indexOf(me) + 1}위`;
      racers.forEach((x, i) => { dots[i].style.left = `${clamp(x.s / L, 0, 1) * 100}%`; });
      $stam.style.width = `${stam}%`;
      $stam.parentElement.classList.toggle('tired', t < tired);
    }
    drawWorld();
    place();
    if (finAt != null && t - finAt > 2.6 && !over) { over = true; cleanup(); done(result.score); return; }
    raf = requestAnimationFrame(frame);
  };
  const result = { score: 0 };
  const win = () => {
    const placeNo = 1 + racers.filter((x) => !x.me && x.fin != null && x.fin < me.fin).length;
    const pts = [100, 70, 50, 30][placeNo - 1];
    result.score = pts + Math.max(0, Math.round((16 - me.fin) * 5));
    ctx.note = `${placeNo}등 · ${me.fin.toFixed(2)}초`;
    me.own.classList.add('hug');
    if (placeNo === 1) sfx.fanfare(); else sfx.coin();
    $msg.innerHTML = `<b>${placeNo}등!</b><span>${placeNo === 1 ? '보호자 품으로 1등 골인!' : '보호자 품으로 골인!'} ${me.fin.toFixed(2)}초</span>`;
    $msg.hidden = false;
    $msg.classList.add('big');
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(flash.t); };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}

// ---------- ② 장애물 경주 ----------
const OBS = {
  up: { key: 'ArrowUp', arrow: '↑', dog: '허들 뛰어넘기', cat: '상자 뛰어넘기', color: '#E8657A' },
  down: { key: 'ArrowDown', arrow: '↓', dog: '터널 기어가기', cat: '터널 기어가기', color: '#4F8FC0' },
  right: { key: 'ArrowRight', arrow: '→', dog: '웅덩이 멀리뛰기', cat: '틈 건너뛰기', color: '#3F6B4F' },
  left: { key: 'ArrowLeft', arrow: '←', dog: '테이블에서 기다려', cat: '방석에서 기다려', color: '#C98A2E' },
};
const SVG = {
  up: '<svg viewBox="0 0 60 60"><rect x="6" y="14" width="5" height="46" rx="2" fill="#7A5A3A"/><rect x="49" y="14" width="5" height="46" rx="2" fill="#7A5A3A"/><rect x="2" y="22" width="56" height="7" rx="3" fill="#E8657A"/><rect x="10" y="22" width="8" height="7" fill="#fff"/><rect x="26" y="22" width="8" height="7" fill="#fff"/><rect x="42" y="22" width="8" height="7" fill="#fff"/></svg>',
  down: '<svg viewBox="0 0 90 60"><path d="M4 60V34a41 30 0 0 1 82 0v26z" fill="#6FA8D8" stroke="#3D78A8" stroke-width="3"/><path d="M14 60V36a31 22 0 0 1 62 0v24z" fill="#2E5A80" opacity=".55"/></svg>',
  right: '<svg viewBox="0 0 120 30"><ellipse cx="60" cy="18" rx="58" ry="11" fill="#8FC3E8" stroke="#5E9BC8" stroke-width="2"/><ellipse cx="44" cy="15" rx="14" ry="3" fill="#fff" opacity=".6"/></svg>',
  left: '<svg viewBox="0 0 80 60"><rect x="4" y="30" width="72" height="9" rx="3" fill="#C98A2E"/><rect x="10" y="39" width="6" height="21" fill="#8A5E22"/><rect x="64" y="39" width="6" height="21" fill="#8A5E22"/><rect x="28" y="4" width="24" height="18" rx="3" fill="#fff" stroke="#8A5E22" stroke-width="2"/><text x="40" y="17" font-size="9" font-weight="900" text-anchor="middle" fill="#8A5E22">기다려</text></svg>',
};
const SIZE_M = { up: [1.4, 1.6], down: [2.5, 1.9], right: [2.6, 0.65], left: [1.9, 1.5] }; // [폭 m, 높이 m]

export function agilityGame(body, ctx, done) {
  const r = rng(`agility:${Date.now()}`);
  const sp = ctx.species;
  const N = 24;                                   // 장애물 수
  const DIRS = ['up', 'down', 'right', 'left'];
  const course = [];
  let at = 14;
  for (let i = 0; i < N; i++) {
    let d = DIRS[Math.floor(r() * 4)];
    if (i > 0 && d === course[i - 1].dir && r() < 0.5) d = DIRS[(DIRS.indexOf(d) + 1 + Math.floor(r() * 3)) % 4];
    course.push({ dir: d, at, state: 'wait', node: null });
    at += Math.max(5.2, 9 - i * 0.16) + r() * 2.2;
  }
  const END = at + 4;
  const c = clipInfo(`${ctx.type}_${ctx.stage}`, 'walk') ?? { src: ctx.pet.src, ratio: 1 };
  body.innerHTML = `<div class="ag" id="ag"><div class="ag-sky"></div><div class="ag-hills"></div><div class="ag-ground" id="ag-ground"></div>
    <div class="ag-zone" id="ag-zone"></div>
    <div class="ag-pet" id="ag-pet"><img id="ag-img" src="${c.src}" alt="" draggable="false"></div>
    <div class="ag-hud"><span id="ag-life">♥♥♥</span><span class="ag-prog"><i id="ag-prog"></i></span><span id="ag-combo"></span><span id="ag-score">0점</span></div>
    <div class="ag-judge" id="ag-judge"></div>
    <div class="ag-legend">${DIRS.map((d) => `<span style="--c:${OBS[d].color}"><b>${OBS[d].arrow}</b>${OBS[d][sp]}</span>`).join('')}</div>
    <div class="ag-pad" id="ag-pad">${DIRS.map((d) => `<button type="button" data-d="${d}" class="ag-${d}" style="--c:${OBS[d].color}" aria-label="${OBS[d][sp]}">${OBS[d].arrow}</button>`).join('')}</div>
    <div class="race-count" id="ag-count">3</div></div>`;
  const el = body.querySelector('#ag'), pet = el.querySelector('#ag-pet'), pimg = el.querySelector('#ag-img');
  const $life = el.querySelector('#ag-life'), $prog = el.querySelector('#ag-prog'), $combo = el.querySelector('#ag-combo'), $score = el.querySelector('#ag-score'), $judge = el.querySelector('#ag-judge'), $count = el.querySelector('#ag-count'), ground = el.querySelector('#ag-ground');
  let W = el.clientWidth, H = el.clientHeight;
  const PX = () => W / 15;               // 1m = 화면 폭의 1/15
  const PET_X = () => W * 0.2;
  const GROUND = () => H * 0.26;         // 바닥 높이(아래에서) — 방향 버튼이 바닥 안에 들어가게
  const owner = img(`art/race/owner${Math.floor(r() * 4)}.webp`, 'ag-owner');
  el.appendChild(owner);
  for (const o of course) {
    o.node = document.createElement('div');
    o.node.className = `ag-obs ag-obs-${o.dir}`;
    o.node.innerHTML = `${SVG[o.dir]}<b class="ag-badge" style="--c:${OBS[o.dir].color}">${OBS[o.dir].arrow}</b>`;
    el.insertBefore(o.node, pet);
    if (o.dir === 'down') el.appendChild(o.node);   // 터널은 아이보다 앞(기어 들어가는 느낌)
  }
  let t = 0, last = 0, raf = 0, over = false, started = false, x = 0, lives = 3, score = 0, combo = 0, maxCombo = 0, perfect = 0, good = 0, act = null, pauseUntil = 0, ended = false;
  const speed = () => 5.6 + Math.min(2.6, x / END * 2.6);
  const judge = (txt, cls) => { $judge.textContent = txt; $judge.className = `ag-judge on ${cls}`; clearTimeout(judge.t); judge.t = setTimeout(() => { $judge.className = 'ag-judge'; }, 650); };
  const doAct = (d) => {
    act = { d, t0: t };
    pet.className = `ag-pet act-${d}`;
    if (d === 'left') { pimg.src = `art/sprite/${ctx.type}_${ctx.stage}_idle.webp`; pauseUntil = t + 0.7; }
    setTimeout(() => { if (act?.d === d) { act = null; pet.className = 'ag-pet'; pimg.src = c.src; } }, d === 'left' ? 760 : d === 'right' ? 620 : 560);
  };
  const press = (d) => {
    if (!started || over || ended) return;
    // 판정 대상: 아직 처리 안 된 가장 가까운 장애물
    const o = course.find((q) => q.state === 'wait');
    if (!o) return;
    const dm = o.at - x;                 // 장애물까지 남은 거리(m) — 0이면 아이 위치
    if (dm > 2.2) return;                // 너무 이르면 무시(벌점 없음)
    if (d !== o.dir) { miss(o, '방향이 달라요!'); return; }
    const err = Math.abs(dm - 0.5);      // 장애물 앞 0.5m에서 누르는 게 딱 좋다
    o.state = 'done';
    o.node.classList.add('ok');
    doAct(d);
    combo++; maxCombo = Math.max(maxCombo, combo);
    if (err < 0.45) { perfect++; score += 100 + combo * 5; judge('완벽!', 'perfect'); sfx.coin(); }
    else { good++; score += 60 + combo * 3; judge('좋아요', 'good'); sfx.pop(); }
  };
  const miss = (o, why) => {
    o.state = 'miss';
    o.node.classList.add('miss');
    combo = 0; lives--;
    pet.className = 'ag-pet stumble';
    setTimeout(() => { if (!act) pet.className = 'ag-pet'; }, 500);
    judge(why, 'miss');
    sfx.tap();
  };
  el.querySelector('#ag-pad').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-d]'); if (b) { e.preventDefault(); e.stopPropagation(); press(b.dataset.d); } });
  // 밀기: 화면 아무 데나 위·아래·좌·우로 쓸기
  let down = null;
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ag-pad')) down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.hypot(dx, dy) < 26) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const onKey = (e) => { const d = DIRS.find((k) => OBS[k].key === e.code); if (d) { e.preventDefault(); press(d); } };
  addEventListener('keydown', onKey);
  const onResize = () => { W = el.clientWidth; H = el.clientHeight; };
  addEventListener('resize', onResize);
  const frame = (ts) => {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts; t += dt;
    if (!started) {
      const left = Math.ceil(3 - t);
      $count.textContent = left > 0 ? String(left) : '출발!';
      if (t >= 3) { started = true; t = 0; setTimeout(() => $count.remove(), 600); }
    } else if (!ended) {
      if (t >= pauseUntil) x += speed() * dt;
      // 지나친 장애물 = 놓침
      for (const o of course) if (o.state === 'wait' && o.at - x < -0.5) miss(o, o.dir === 'left' ? '기다려를 못 했어요' : '놓쳤어요!');
      if (lives <= 0) finish(false);
      else if (x >= END - 2) finish(true);
    }
    // 그리기
    const px = PX(), gy = GROUND(), petH = H * 0.26;
    ground.style.backgroundPositionX = `${-x * px}px`;
    pet.style.height = `${petH}px`;
    pet.style.left = `${PET_X() - petH * c.ratio * 0.5}px`;
    pet.style.bottom = `${gy}px`;
    for (const o of course) {
      const sx = PET_X() + (o.at - x) * px;
      if (sx < -px * 4 || sx > W + px * 4) { o.node.style.display = 'none'; continue; }
      const [wm, hm] = SIZE_M[o.dir];
      o.node.style.cssText = `display:block;left:${sx}px;bottom:${gy - (o.dir === 'right' ? px * 0.2 : 0)}px;width:${wm * px}px;height:${hm * px}px`;
    }
    const ox = PET_X() + (END - x) * px;
    owner.style.cssText = `left:${ox}px;bottom:${gy}px;height:${H * 0.5}px;display:${ox < W + 200 ? 'block' : 'none'}`;
    $life.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $prog.style.width = `${clamp(x / END, 0, 1) * 100}%`;
    $combo.textContent = combo >= 3 ? `${combo} 콤보` : '';
    $score.textContent = `${score}점`;
    raf = requestAnimationFrame(frame);
  };
  const finish = (clear) => {
    if (ended) return;
    ended = true;
    const total = score + maxCombo * 10 + (clear ? 200 + lives * 50 : 0);
    ctx.note = clear ? `완주! 완벽 ${perfect} · 좋아요 ${good} · 최대 ${maxCombo}콤보` : `${course.filter((o) => o.state !== 'wait').length}/${N}번째에서 넘어졌어요`;
    if (clear) { owner.classList.add('hug'); sfx.fanfare(); judge(`완주! 완벽 ${perfect} · 좋아요 ${good}`, 'perfect'); }
    else judge('넘어졌어요… 다음엔 끝까지!', 'miss');
    setTimeout(() => { over = true; cleanup(); done(total); }, clear ? 2200 : 1400);
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(judge.t); };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}
