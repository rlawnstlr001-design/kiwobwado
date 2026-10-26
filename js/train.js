// 훈련 — 재주를 '칭찬 타이밍'으로 가르친다(10/22 재미 요소 ③). 손 돌봄(handcare.js)과 같은 확대 화면
// 한 번 = 5번 시키기: [명령] → 아이가 망설이다 하거나(성공 확률은 진도·성격) 딴청 → 해낸 '직후'에 [잘했어!]를 누르면 성공
// 너무 빨리(하기 전) 칭찬하거나 늦으면 점수 없음. 재주마다 TRICK_NEED점이면 배운 재주 — 배운 건 언제든 '재주 보기'
// 근거: 보상(칭찬·간식) 기반 훈련 권장(avsab_training). 망설임·타이밍 값은 게임 설정이다.

import { sfx } from './sound.js?v=202610261149';
import { TRICKS, TRICK_NEED, TRAIN_MOD, nextTrick, learned, focusOf } from './fun.js?v=202610261149';
import { josa } from './engine.js?v=202610261149';
const eul = (w) => `'${w}'${josa(w, '을/를').slice(-1)}`;

const ROUNDS = 5;
// 재주 자세 그림 목록(tools/make_tricks.py → art/sprite/tricks.json). 없는 자세는 평소(앉은) 그림 + 말풍선
let POSES = null;
const loadPoses = () => (POSES ??= fetch('art/sprite/tricks.json?v=202610261149').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

export async function training(opts) {
  const { type, stage } = opts;
  const name = `${type}_${stage}`;
  const have = (await loadPoses())[name] ?? [];
  const idle = await loadImg(`art/sprite/${name}_idle.webp`);
  // 자세 그림 키 = 평소 그림 키 대비 비율(같은 배율로 만들었다) → 훈련 화면에서 높이를 그 비율로
  const ratio = {};
  await Promise.all(have.map(async (p) => { const i = await loadImg(`art/sprite/${name}_${p}.webp`); if (i && idle) ratio[p] = i.naturalHeight / idle.naturalHeight; }));
  return run(opts, ratio);
}
function run({ type, stage, species, persona, prog: prog0 = {}, petName = '아이' }, ratio) {
  return new Promise((resolve) => {
    const prog = { ...prog0 };
    const mod = TRAIN_MOD[persona] ?? TRAIN_MOD.cuddle;
    const img = (st) => `art/sprite/${type}_${stage}_${st}.webp`;
    const root = document.getElementById('game') ?? document.body;
    const el = document.createElement('div');
    el.className = 'hc hc-train';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '훈련');
    el.innerHTML = `<div class="hc-top"><b>훈련</b><span class="hc-say" id="tr-say"></span>
        <i class="hc-bar" aria-hidden="true"><i id="tr-fill"></i></i><button class="hc-x" type="button">그만두기</button></div>
      <div class="hc-stage tr-stage"><div class="tr-pet" id="tr-pet"><img id="tr-img" src="${img('idle')}" alt="" draggable="false"><span class="tr-bub" id="tr-bub" hidden></span><span class="tr-did" id="tr-did" hidden></span></div></div>
      <div class="tr-bot">
        <div class="tr-know" id="tr-know"></div>
        <div class="tr-btns"><button class="btn tr-cmd" id="tr-cmd" type="button"></button><button class="btn btn-main tr-good" id="tr-good" type="button">잘했어!</button></div>
        <p class="tr-round" id="tr-round"></p>
      </div>`;
    root.appendChild(el);
    document.body.classList.add('handcare');   // 1분 다시 그리기 멈춤(app.js quiet)
    requestAnimationFrame(() => el.classList.add('on'));
    const $ = (s) => el.querySelector(s);
    const sayEl = $('#tr-say'), fill = $('#tr-fill'), pet = $('#tr-pet'), im = $('#tr-img'), bub = $('#tr-bub'), did = $('#tr-did');
    const cmd = $('#tr-cmd'), good = $('#tr-good'), know = $('#tr-know'), roundEl = $('#tr-round');
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const clearAll = () => { for (const t of timers) clearTimeout(t); timers.clear(); };
    const alive = setInterval(() => { if (!el.isConnected) finish(false); }, 1000);

    let cur = nextTrick(species, prog);
    let round = 0, hits = 0, phase = 'ready';   // ready | wait | did | off(딴청) | show(재주 보기)
    const gained = {};
    const learnedNow = [];
    const say = (t) => { sayEl.textContent = t; };
    const bar = () => { fill.style.width = `${cur ? Math.round(Math.min(1, (prog[cur.id] || 0) / TRICK_NEED) * 100) : 100}%`; };
    const knowHTML = () => {
      const ls = learned(species, prog);
      know.innerHTML = `${cur ? `<span class="tr-now">배우는 중 <b>${cur.label}</b> ${Math.min(TRICK_NEED, Math.floor(prog[cur.id] || 0))}/${TRICK_NEED}</span>` : '<span class="tr-now">재주를 다 배웠어요!</span>'}
        ${ls.length ? `<span class="tr-ls">재주 보기 ${ls.map((t) => `<button class="chip" data-show="${t.id}" type="button">${t.label}</button>`).join('')}</span>` : ''}`;
    };
    const setPet = (st, cls = '') => { im.src = img(st); im.style.height = `${(ratio[st] ?? 1) * 100}%`; pet.className = `tr-pet ${cls}`; };
    const poseOf = (t) => (t.pose && ratio[t.pose] ? t.pose : 'idle');
    const reset = () => {
      phase = 'ready';
      setPet('idle');
      bub.hidden = true; did.hidden = true;
      cmd.disabled = !cur || round >= ROUNDS;
      cmd.textContent = cur ? cur.say : '다 배웠어요';
      roundEl.textContent = cur ? `${Math.min(round + 1, ROUNDS)} / ${ROUNDS}번째 · 해낸 '바로 그때' 칭찬해요` : '';
      bar(); knowHTML();
    };
    const endRound = (msg) => {
      round++;
      say(msg);
      later(() => (round >= ROUNDS || !cur ? done_() : reset()), 1400);
    };
    function done_() {
      phase = 'end';
      cmd.disabled = true; good.disabled = true;
      const ls = learnedNow.length ? `${learnedNow.map(eul).join(', ')} 배웠어요!` : '';
      say(`${ROUNDS}번 중 ${hits}번 성공. ${ls}`);
      if (learnedNow.length) { sfx.fanfare(); setPet('happy', 'cheer'); }
      later(() => finish(true), learnedNow.length ? 2200 : 1300);
    }

    cmd.addEventListener('click', () => {
      if (phase !== 'ready' || !cur) return;
      sfx.tap();
      phase = 'wait';
      cmd.disabled = true;
      bub.textContent = cur.say; bub.hidden = false;
      pet.className = 'tr-pet think';
      say(`${petName}… 생각 중`);
      const wait = 600 + Math.random() * 1600 + mod.wait;
      later(() => {
        if (phase !== 'wait') return;
        bub.hidden = true;
        if (Math.random() < focusOf(prog[cur.id] || 0, persona)) {
          phase = 'did';
          setPet(poseOf(cur), 'pop');   // 재주 자세 그림(없으면 평소 앉은 그림) + 말풍선 — 칭찬받으면 기쁨 그림
          did.textContent = cur.did; did.hidden = false;
          later(() => { if (phase === 'did') { phase = 'late'; setPet('idle'); did.hidden = true; endRound('조금 늦었어요 — 해낸 바로 그때 칭찬해야 뭘 잘했는지 알아요'); } }, mod.window);
        } else {
          phase = 'off';
          setPet('oops', 'off');
          say('딴청을 피워요… 칭찬하지 말고 기다려요');
          later(() => { if (phase === 'off') endRound('이번엔 못 알아들었어요. 다시 해 봐요'); }, 1500);
        }
      }, wait);
    });
    good.addEventListener('click', () => {
      if (phase === 'did') {
        phase = 'hit';
        hits++;
        const before = prog[cur.id] || 0;
        prog[cur.id] = before + mod.gain;
        gained[cur.id] = (gained[cur.id] || 0) + mod.gain;
        sfx.coin();
        setPet('happy', 'cheer');
        bar();
        if (before < TRICK_NEED && prog[cur.id] >= TRICK_NEED) {
          learnedNow.push(cur.label);
          endRound(`${eul(cur.label)} 배웠어요! 🎉`);
          cur = nextTrick(species, prog);
        } else endRound(persona === 'food' ? '간식 냠! 먹보라 더 빨리 배워요' : '딱 맞았어요! 잘했어~');
      } else if (phase === 'wait') {
        phase = 'early';
        clearAll();
        bub.hidden = true; setPet('idle');
        endRound('아직 안 했는데 칭찬하면 뭘 칭찬받는 건지 헷갈려요');
      } else if (phase === 'off') {
        phase = 'early';
        clearAll();
        setPet('idle');
        endRound('딴청 피울 때 칭찬하면 딴청을 배워요');
      }
    });
    // 배운 재주 보기 — 시키면 바로 한다(점수 없음)
    know.addEventListener('click', (e) => {
      const b = e.target.closest('[data-show]');
      if (!b || !['ready', 'end'].includes(phase)) return;
      const t = TRICKS[species].find((x) => x.id === b.dataset.show);
      phase = 'show';
      sfx.pop();
      bub.textContent = t.say; bub.hidden = false;
      later(() => { bub.hidden = true; setPet(poseOf(t), 'pop'); did.textContent = `${t.did}!`; did.hidden = false; say(`${t.label} — 척척!`); }, 500);
      later(() => (round >= ROUNDS ? null : reset()), 1900);
    });

    let closed = false;
    function finish(ok) {
      if (closed) return;
      closed = true;
      clearAll();
      clearInterval(alive);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('handcare');
      el.classList.remove('on');
      setTimeout(() => el.remove(), 250);
      resolve({ ok, prog, gained, learnedNow, hits });
    }
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    el.querySelector('.hc-x').addEventListener('click', () => finish(false));
    say(cur ? `${eul(cur.label)} 가르쳐요. 명령 → 해내면 바로 '잘했어!'` : '재주를 다 배웠어요. 재주 보기를 눌러 보세요');
    reset();
  });
}
