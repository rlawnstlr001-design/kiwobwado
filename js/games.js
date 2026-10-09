// 미니게임 — 코인 벌기(1코인 = 1,000원, 가격은 실제 평균값이라 "반려 생활비 = 이만큼의 노력"을 느끼게)
// 산책 달리기(먹이면 안 되는 음식은 뛰어넘고 줘도 되는 간식은 모으기) · 사천성(반려용품 짝 맞추기) · 간식 맞추기(3개 맞추기)
// 그림 없이 코드·이모지로만. 판마다 받는 코인은 앱(app.js)이 하루 한도 안에서 정한다
import { C } from './content.js?v=202610091409';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const titleOf = (k, species) => (k === 'run' && species === 'cat' ? '사냥 달리기' : GAMES[k].title); // 고양이는 산책 대신 사냥 놀이

export const GAMES = {
  run: { title: '산책 달리기', icon: '🐾', desc: '화면을 누르면 점프! 먹이면 안 되는 음식은 뛰어넘고, 줘도 되는 간식은 모아요.', coins: (s) => Math.min(15, Math.floor(s / 25)) },
  shisen: { title: '사천성', icon: '🧸', desc: '같은 반려용품 두 개를 두 번 이하로 꺾이는 길로 이어 없애요.', coins: (s) => Math.min(15, Math.floor(s / 13)) },
  match: { title: '간식 맞추기', icon: '🥕', desc: '이웃한 간식을 바꿔 같은 것 3개를 한 줄로 맞춰요.', coins: (s) => Math.min(15, Math.floor(s / 80)) },
};

let root = null;
let stop = null; // 진행 중인 판 정리

// ctx: { species, petName, pet: { src, ratio }, coins, earned, cap, best, onReward(game, score) → { given, earned, coins }, onClose }
export function openGames(ctx) {
  root?.remove();
  root = document.createElement('div');
  root.className = 'mg';
  root.innerHTML = `<div class="mg-bar"><b class="mg-title">미니게임</b><span class="mg-coin"><i class="ci"></i> <b id="mg-coins">${ctx.coins}</b></span><span class="mg-cap">오늘 번 코인 <b id="mg-earned">${ctx.earned}</b>/${ctx.cap}</span><button class="mg-x" id="mg-x" aria-label="닫기">✕</button></div><div class="mg-body" id="mg-body"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('playing');
  const body = root.querySelector('#mg-body');
  const close = () => { stop?.(); stop = null; root?.remove(); root = null; document.body.classList.remove('playing'); ctx.onClose?.(); };
  root.querySelector('#mg-x').addEventListener('click', close);

  const menu = () => {
    stop?.(); stop = null;
    root.querySelector('.mg-title').textContent = '미니게임';
    body.innerHTML = `<div class="mg-menu">${Object.entries(GAMES).map(([k, g]) => `<button class="mg-card" data-g="${k}"><span class="mg-ic">${g.icon}</span><b>${titleOf(k, ctx.species)}</b><small>${g.desc}</small><span class="mg-best">${ctx.best[k] ? `최고 ${ctx.best[k]}점` : '처음 해 봐요'}</span></button>`).join('')}</div>
      <p class="mg-note">1코인 = 1,000원. 펫샵·병원 가격은 실제 평균값 그대로예요. 하루에 벌 수 있는 코인은 ${ctx.cap}개까지 — 일할 수 있는 시간이 정해져 있듯이요.</p>`;
    body.onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) play(b.dataset.g); };
  };
  const play = (k) => {
    body.onclick = null;
    root.querySelector('.mg-title').textContent = titleOf(k, ctx.species);
    const run = { run: runGame, shisen: shisenGame, match: matchGame }[k];
    stop = run(body, ctx, (score) => finish(k, score));
  };
  const finish = (k, score) => {
    stop = null;
    const r = ctx.onReward(k, score);
    ctx.coins = r.coins; ctx.earned = r.earned; ctx.best[k] = Math.max(ctx.best[k] || 0, score);
    root.querySelector('#mg-coins').textContent = r.coins;
    root.querySelector('#mg-earned').textContent = r.earned;
    const raw = GAMES[k].coins(score);
    body.innerHTML = `<div class="mg-end"><p class="mg-k">${titleOf(k, ctx.species)}</p><p class="mg-score">${score}점</p>
      <p class="mg-got"><i class="ci"></i> +${r.given}${r.given < raw ? ` <small>(오늘 한도 ${ctx.cap}개를 다 채웠어요 — 점수는 기록돼요)</small>` : ''}</p>
      <p class="mg-sub">= 실제라면 ${(r.given * 1000).toLocaleString('ko-KR')}원어치</p>
      <div class="mg-btns"><button class="btn btn-main" data-again>다시 하기</button><button class="btn" data-menu>다른 게임</button></div></div>`;
    body.onclick = (e) => { if (e.target.closest('[data-again]')) play(k); if (e.target.closest('[data-menu]')) menu(); };
  };
  menu();
  return close;
}

// ---------- 산책 달리기 ----------
// 나쁜 음식(foods.json에서 이 동물에게 'no')은 땅에 놓여 있어 뛰어넘고, 좋은 것은 공중·땅에서 줍는다. 부딪히면 이유를 보여 준다
function runGame(body, ctx, done) {
  const dog = ctx.species === 'dog';
  const foods = C.foods.items.filter((f) => f.emoji);
  const bad = foods.filter((f) => f[ctx.species] === 'no').map((f) => ({ e: f.emoji, f }));
  const good = dog ? foods.filter((f) => f.dog === 'ok').map((f) => ({ e: f.emoji, f })) : [{ e: '🧶', t: '털실 공' }, { e: '🎀', t: '리본 장난감' }, { e: '🐭', t: '쥐 인형' }];
  good.push({ e: '⭐', t: '칭찬' });
  body.innerHTML = `<div class="run" id="run"><div class="run-hills"></div><div class="run-ground"></div>
    <img class="run-pet" id="run-pet" src="${ctx.pet.src}" alt="">
    <div class="run-hud"><span id="run-score">0점</span><span id="run-life">♥♥♥</span><span id="run-time">45</span></div>
    <p class="run-tip" id="run-tip">화면을 누르면 점프 · 공중에서 한 번 더!</p><div class="run-fact" id="run-fact" hidden></div></div>`;
  const el = body.querySelector('#run'), petEl = el.querySelector('#run-pet');
  const $s = el.querySelector('#run-score'), $l = el.querySelector('#run-life'), $t = el.querySelector('#run-time'), $f = el.querySelector('#run-fact');
  const LEN = 45;
  let W = el.clientWidth, H = el.clientHeight;
  let y = 0, vy = 0, jumps = 0, t = 0, next = 1.2, lives = 3, score = 0, last = 0, raf = 0, over = false, hurtT = -9, factT = 0;
  const seen = new Set();
  const objs = [];
  const ground = () => H * 0.16;
  const petH = () => H * 0.3;
  const G = () => H * 3.4;
  const jump = (e) => {
    e?.preventDefault?.();
    if (over || jumps >= 2) return;
    vy = Math.sqrt(2 * G() * H * (jumps ? 0.26 : 0.4));
    jumps++;
    el.querySelector('#run-tip')?.remove();
  };
  const fact = (txt) => { $f.textContent = txt; $f.hidden = false; factT = t + 2.2; };
  el.addEventListener('pointerdown', jump);
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') jump(e); };
  addEventListener('keydown', onKey);
  const onResize = () => { W = el.clientWidth; H = el.clientHeight; };
  addEventListener('resize', onResize);
  const spawn = () => {
    const isBad = Math.random() < 0.45;
    const it = pick(isBad ? bad : good);
    const s = H * 0.13;
    const air = !isBad && Math.random() < 0.6;
    const o = { ...it, bad: isBad, x: W + s, s, h: air ? H * (0.12 + Math.random() * 0.26) : 0, node: document.createElement('span') };
    o.node.className = `run-obj${isBad ? ' bad' : ''}`;
    o.node.textContent = it.e;
    o.node.style.fontSize = `${s * 0.86}px`;
    el.appendChild(o.node);
    objs.push(o);
  };
  const frame = (ts) => {
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    t += dt;
    // 몸
    vy -= G() * dt; y += vy * dt;
    if (y <= 0) { y = 0; vy = 0; jumps = 0; }
    petEl.style.height = `${petH()}px`;
    petEl.style.bottom = `${ground() + y}px`;
    petEl.classList.toggle('hurt', t - hurtT < 0.8);
    // 물건
    const speed = W * 0.42 * (1 + t / 60);
    if (t >= next) { spawn(); next = t + (0.65 + Math.random() * 0.6) * Math.max(0.6, 1 - t / 90); }
    const pw = petEl.clientWidth || petH() * (ctx.pet.ratio || 1);
    const px0 = W * 0.1 + pw * 0.25, px1 = W * 0.1 + pw * 0.85, py0 = ground() + y, py1 = py0 + petH() * 0.8;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      o.x -= speed * dt;
      const ox0 = o.x + o.s * 0.15, ox1 = o.x + o.s * 0.85, oy0 = ground() + o.h + o.s * 0.1, oy1 = oy0 + o.s * 0.75;
      const hit = ox1 > px0 && ox0 < px1 && oy1 > py0 && oy0 < py1;
      if (hit || o.x < -o.s) {
        o.node.remove(); objs.splice(i, 1);
        if (!hit) continue;
        if (o.bad) {
          if (t - hurtT < 0.8) continue; // 방금 다쳤으면 잠깐 무적
          lives--; hurtT = t;
          fact(`${o.e} ${o.f.name} — ${dog ? '강아지' : '고양이'}에게 주면 안 돼요 (${o.f.why})`);
        } else {
          score += 10;
          if (o.f && !seen.has(o.f.id)) { seen.add(o.f.id); fact(`${o.e} ${o.f.name} — 조금은 괜찮아요. ${o.f.note || ''}`.trim()); }
        }
        continue;
      }
      o.node.style.left = `${o.x}px`;
      o.node.style.bottom = `${ground() + o.h}px`;
    }
    if (factT && t > factT) { $f.hidden = true; factT = 0; }
    const sc = score + Math.floor(t);
    $s.textContent = `${sc}점`;
    $l.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $t.textContent = Math.max(0, Math.ceil(LEN - t));
    if (lives <= 0 || t >= LEN) { over = true; cleanup(); setTimeout(() => done(sc), lives <= 0 ? 900 : 300); return; }
    raf = requestAnimationFrame(frame);
  };
  const cleanup = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}

// ---------- 사천성 ----------
// 5×8칸, 반려용품 10종 × 4개. 두 번 이하로 꺾이는 빈 길(바깥 테두리 포함)로 이어지면 없어진다. 막히면 남은 패를 섞어 준다
const SH_TILES = ['🎾', '🧸', '🥣', '🎀', '🩹', '💊', '🐾', '🧶', '🛁', '🦴']; // 오래된 기기에서도 보이는 이모지만(🧼·🪥 등은 윈도10에서 네모로 나옴)
const SH_NAME = { '🎾': '공', '🧸': '인형', '🥣': '밥그릇', '🎀': '리본', '🩹': '반창고', '💊': '약', '🐾': '발바닥', '🧶': '털실', '🛁': '목욕', '🦴': '개껌' };
function canLink(g, a, b) {
  const R = g.length, Cn = g[0].length;
  const D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const best = new Map();
  const q = [0, 1, 2, 3].map((d) => [a[0], a[1], d, 0]);
  while (q.length) {
    const [r, c, d, t] = q.shift();
    let nr = r + D[d][0], nc = c + D[d][1];
    while (nr >= 0 && nr < R && nc >= 0 && nc < Cn) {
      if (nr === b[0] && nc === b[1]) return true;
      if (g[nr][nc] !== null) break;
      if (t < 2) {
        for (let d2 = 0; d2 < 4; d2++) {
          if (d2 === d || (d2 + 2) % 4 === d) continue;
          const k = `${nr},${nc},${d2}`;
          if (!(best.get(k) <= t + 1)) { best.set(k, t + 1); q.push([nr, nc, d2, t + 1]); }
        }
      }
      nr += D[d][0]; nc += D[d][1];
    }
  }
  return false;
}
function shisenGame(body, ctx, done) {
  const R = 5, Cn = 8, LEN = 120;
  const g = Array.from({ length: R + 2 }, () => Array(Cn + 2).fill(null)); // 바깥 한 줄은 늘 빈칸(길)
  const bag = shuffle(SH_TILES.flatMap((e) => [e, e, e, e]));
  for (let r = 1; r <= R; r++) for (let c = 1; c <= Cn; c++) g[r][c] = bag.pop();
  const cells = () => { const out = []; for (let r = 1; r <= R; r++) for (let c = 1; c <= Cn; c++) if (g[r][c]) out.push([r, c]); return out; };
  const anyMove = () => { const cs = cells(); for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const [a, b] = [cs[i], cs[j]]; if (g[a[0]][a[1]] === g[b[0]][b[1]] && canLink(g, a, b)) return [a, b]; } return null; };
  const reshuffle = () => { for (let n = 0; n < 30; n++) { const cs = cells(); const vals = shuffle(cs.map(([r, c]) => g[r][c])); cs.forEach(([r, c], i) => { g[r][c] = vals[i]; }); if (anyMove()) return; } };
  if (!anyMove()) reshuffle();
  body.innerHTML = `<div class="sh"><div class="sh-hud"><span id="sh-score">0쌍</span><button class="btn btn-sm" id="sh-hint">힌트</button><span id="sh-time">${LEN}</span></div><div class="sh-grid" id="sh-grid"></div><p class="sh-msg" id="sh-msg"></p></div>`;
  const grid = body.querySelector('#sh-grid'), $s = body.querySelector('#sh-score'), $t = body.querySelector('#sh-time'), $m = body.querySelector('#sh-msg');
  let sel = null, pairs = 0, left = LEN, over = false;
  const draw = () => {
    let html = '';
    for (let r = 1; r <= R; r++) for (let c = 1; c <= Cn; c++) {
      const v = g[r][c];
      html += v ? `<button class="sh-t${sel && sel[0] === r && sel[1] === c ? ' on' : ''}" data-r="${r}" data-c="${c}" aria-label="${SH_NAME[v]}">${v}</button>` : '<span class="sh-t empty"></span>';
    }
    grid.innerHTML = html;
    $s.textContent = `${pairs}쌍`;
  };
  const end = () => { if (over) return; over = true; clearInterval(timer); done(pairs * 10 + (cells().length ? 0 : left + 30)); };
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || over) return;
    const p = [Number(b.dataset.r), Number(b.dataset.c)];
    if (!sel) { sel = p; return draw(); }
    if (sel[0] === p[0] && sel[1] === p[1]) { sel = null; return draw(); }
    if (g[sel[0]][sel[1]] === g[p[0]][p[1]] && canLink(g, sel, p)) {
      g[sel[0]][sel[1]] = null; g[p[0]][p[1]] = null; pairs++; sel = null; $m.textContent = '';
      if (!cells().length) { draw(); $m.textContent = '다 치웠어요! 남은 시간이 보너스예요'; return setTimeout(end, 700); }
      if (!anyMove()) { reshuffle(); $m.textContent = '이을 수 있는 짝이 없어 섞었어요'; }
    } else { sel = p; }
    draw();
  });
  body.querySelector('#sh-hint').addEventListener('click', () => {
    const m = anyMove(); if (!m) return;
    left = Math.max(0, left - 5); $m.textContent = '힌트 −5초';
    draw();
    for (const [r, c] of m) grid.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.classList.add('hint');
  });
  const timer = setInterval(() => { left--; $t.textContent = left; if (left <= 0) end(); }, 1000);
  draw();
  return () => { over = true; clearInterval(timer); };
}

// ---------- 간식 맞추기 ----------
// 7×6칸. 이웃 칸과 바꿔(밀거나 두 번 눌러) 같은 간식 3개 이상을 한 줄로. 연쇄는 배수로 점수
function matchGame(body, ctx, done) {
  const Wn = 7, Hn = 6, LEN = 60;
  const K = ctx.species === 'dog' ? ['🥕', '🍎', '🍉', '🍠', '🎾'] : ['🧶', '🎀', '🐭', '🎾', '📦'];
  const b = Array.from({ length: Hn }, () => Array(Wn).fill(null));
  const runs = () => {
    const hit = new Set();
    for (let r = 0; r < Hn; r++) for (let c = 0; c < Wn - 2; c++) { const v = b[r][c]; if (v && v === b[r][c + 1] && v === b[r][c + 2]) { hit.add(`${r},${c}`); hit.add(`${r},${c + 1}`); hit.add(`${r},${c + 2}`); } }
    for (let c = 0; c < Wn; c++) for (let r = 0; r < Hn - 2; r++) { const v = b[r][c]; if (v && v === b[r + 1][c] && v === b[r + 2][c]) { hit.add(`${r},${c}`); hit.add(`${r + 1},${c}`); hit.add(`${r + 2},${c}`); } }
    return hit;
  };
  const swap = (a, z) => { const t = b[a[0]][a[1]]; b[a[0]][a[1]] = b[z[0]][z[1]]; b[z[0]][z[1]] = t; };
  const hasMove = () => { for (let r = 0; r < Hn; r++) for (let c = 0; c < Wn; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) { const z = [r + dr, c + dc]; if (z[0] >= Hn || z[1] >= Wn) continue; swap([r, c], z); const ok = runs().size > 0; swap([r, c], z); if (ok) return true; } return false; };
  const fillNoMatch = () => { do { for (let r = 0; r < Hn; r++) for (let c = 0; c < Wn; c++) b[r][c] = pick(K); } while (runs().size || !hasMove()); };
  fillNoMatch();
  body.innerHTML = `<div class="m3"><div class="m3-hud"><span id="m3-score">0점</span><span id="m3-combo"></span><span id="m3-time">${LEN}</span></div><div class="m3-grid" id="m3-grid"></div></div>`;
  const grid = body.querySelector('#m3-grid'), $s = body.querySelector('#m3-score'), $t = body.querySelector('#m3-time'), $c = body.querySelector('#m3-combo');
  let score = 0, left = LEN, busy = false, over = false, sel = null, down = null;
  const draw = (pop = new Set()) => {
    let html = '';
    for (let r = 0; r < Hn; r++) for (let c = 0; c < Wn; c++) html += `<button class="m3-t${pop.has(`${r},${c}`) ? ' pop' : ''}${sel && sel[0] === r && sel[1] === c ? ' on' : ''}" data-r="${r}" data-c="${c}">${b[r][c] ?? ''}</button>`;
    grid.innerHTML = html;
    $s.textContent = `${score}점`;
  };
  const resolve = async () => {
    busy = true;
    let combo = 0, hit;
    while ((hit = runs()).size) {
      combo++;
      score += hit.size * 10 * combo;
      $c.textContent = combo > 1 ? `${combo}연쇄!` : '';
      draw(hit);
      await sleep(230);
      for (const k of hit) { const [r, c] = k.split(',').map(Number); b[r][c] = null; }
      for (let c = 0; c < Wn; c++) { // 아래로 떨어뜨리고 위를 채운다
        const col = []; for (let r = Hn - 1; r >= 0; r--) if (b[r][c]) col.push(b[r][c]);
        for (let r = Hn - 1, i = 0; r >= 0; r--, i++) b[r][c] = col[i] ?? pick(K);
      }
      draw();
      await sleep(170);
    }
    if (!hasMove()) { fillNoMatch(); draw(); $c.textContent = '새 판!'; }
    setTimeout(() => { if (!busy) $c.textContent = ''; }, 900);
    busy = false;
    if (left <= 0) end();
  };
  const trySwap = async (a, z) => {
    if (busy || over) return;
    if (Math.abs(a[0] - z[0]) + Math.abs(a[1] - z[1]) !== 1) return;
    sel = null;
    swap(a, z);
    if (!runs().size) { draw(); busy = true; await sleep(180); swap(a, z); draw(); busy = false; return; }
    await resolve();
  };
  grid.addEventListener('pointerdown', (e) => { const t = e.target.closest('[data-r]'); if (t) down = { p: [Number(t.dataset.r), Number(t.dataset.c)], x: e.clientX, y: e.clientY }; });
  grid.addEventListener('pointerup', (e) => {
    if (!down) return;
    const { p, x, y } = down; down = null;
    const dx = e.clientX - x, dy = e.clientY - y;
    if (Math.hypot(dx, dy) > 18) { // 밀기
      const z = Math.abs(dx) > Math.abs(dy) ? [p[0], p[1] + Math.sign(dx)] : [p[0] + Math.sign(dy), p[1]];
      if (z[0] >= 0 && z[0] < Hn && z[1] >= 0 && z[1] < Wn) trySwap(p, z);
      return;
    }
    if (sel && Math.abs(sel[0] - p[0]) + Math.abs(sel[1] - p[1]) === 1) return trySwap(sel, p);
    sel = sel && sel[0] === p[0] && sel[1] === p[1] ? null : p;
    draw();
  });
  const end = () => { if (over) return; over = true; clearInterval(timer); done(score); };
  const timer = setInterval(() => { left = Math.max(0, left - 1); $t.textContent = left; if (left <= 0 && !busy) end(); }, 1000);
  draw();
  return () => { over = true; clearInterval(timer); };
}
