// 방 화면 — 정사각형 방 그림 위에서 아이가 숨 쉬고 돌아다니고, 할 일 버튼에 반응하고, 그림자 손으로 쓰다듬을 수 있다
// 그림: art/room/room.webp(방), art/sprite/<성향>_<단계>_<상태>.webp(배경 없는 아이), art/prop/*.webp(패드·화장실·장난감)

const HAND = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M33 112c-9-10-17-26-21-40-2-7 6-11 11-5l9 13V30c0-6 9-6 9 0v30h3V18c0-6 9-6 9 0v40h3V22c0-6 9-6 9 0v38h3V32c0-6 9-6 9 0v44c0 14-4 26-12 36z"/></svg>`;

// 아이 키(방 높이 대비 %) — 성향·단계별로 실제 크기 차이를 느끼게
const HEIGHT = {
  small: { baby: 28, teen: 32, adult: 34 }, medium: { baby: 30, teen: 37, adult: 42 }, large: { baby: 31, teen: 42, adult: 48 },
  short: { baby: 28, teen: 32, adult: 35 }, long: { baby: 29, teen: 33, adult: 37 },
};
const SPOTS = [48, 36, 58, 44, 62]; // 바닥에서 돌아다니는 가로 위치(%)

export function timeOfDay(min) {
  if (min < 300 || min >= 1260) return 'night';
  if (min < 540) return 'morning';
  if (min < 1050) return 'day';
  return 'evening';
}

// need: { text } 말풍선, prop: { pad: 'clean'|'used' } 또는 { litter: 'clean'|'used' }
export function roomHTML({ type, stage, state, tod, need, prop, clock, tag }) {
  const h = HEIGHT[type][stage] * (state === 'sleep' || state === 'sick' ? 0.78 : 1);
  const pad = prop.pad ? `<img class="prop prop-pad" src="art/prop/pad_${prop.pad}.webp" alt="">` : '';
  const litter = prop.litter ? `<img class="prop prop-litter" src="art/prop/litter_${prop.litter}.webp" alt="">` : '';
  return `<div class="room" id="room" data-tod="${tod}" data-state="${state}">
    <img class="room-bg" src="art/room/room.webp" alt="">
    <div class="room-light"></div>
    ${pad}${litter}
    <div class="pet" id="pet" style="--h:${h}%;--x:${SPOTS[0]}%">
      <i class="pet-shadow"></i>
      <img class="pet-img" id="pet-img" src="art/sprite/${type}_${stage}_${state}.webp" alt="" draggable="false">
      <div class="pet-anim" id="pet-anim" hidden></div>
      ${need ? `<div class="need" id="need">${need}</div>` : ''}
    </div>
    <div class="zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></div>
    <div class="hand" id="hand">${HAND}</div>
    <div class="fx" id="fx" aria-hidden="true"></div>
    <div class="room-top"><span class="room-tag">${tag}</span><span class="room-clock">${clock}</span></div>
    <div class="room-banner" id="room-banner" hidden></div>
  </div>`;
}

// 움직임 프레임 목록(art/anim/index.json): '<성향>_<단계>_<동작>' → 한 칸 가로/세로 비율
let ANIM = {};
export async function loadAnim() {
  try { ANIM = await fetch('art/anim/index.json?v=202610060913').then((r) => (r.ok ? r.json() : {})); } catch { ANIM = {}; }
}

let wanderTimer = null;
let revertTimer = null;

// 방을 살린다: 돌아다니기 + 쓰다듬기. onStroke(누적 쓰다듬은 정도)로 앱이 마음 점수를 올린다
export function mountRoom({ type, stage, state, onStroke, canPet }) {
  clearInterval(wanderTimer);
  clearTimeout(revertTimer);
  const room = document.getElementById('room');
  const pet = document.getElementById('pet');
  const img = document.getElementById('pet-img');
  const hand = document.getElementById('hand');
  const fx = document.getElementById('fx');
  if (!room) return null;
  const base = `art/sprite/${type}_${stage}_`;
  const anim = document.getElementById('pet-anim');
  const cat = type === 'short' || type === 'long';
  const has = (k) => ANIM[`${type}_${stage}_${k}`];
  // 프레임 스트립 재생(4칸, steps). 없으면 false → 정지 그림 유지
  const showAnim = (k, dur) => {
    const ratio = has(k);
    if (!ratio) return false;
    anim.style.backgroundImage = `url(art/anim/${type}_${stage}_${k}.webp)`;
    anim.style.aspectRatio = String(ratio);
    anim.style.setProperty('--dur', dur);
    anim.dataset.k = k;
    anim.hidden = false; img.hidden = true;
    return true;
  };
  const hideAnim = () => { anim.hidden = true; img.hidden = false; };
  // 평소 상태면 꼬리 흔들기, 아니면 정지 그림
  const rest = (s) => { if (s === 'idle' && showAnim('wag', cat ? '1.6s' : '.7s')) return; hideAnim(); };
  const setState = (s) => { img.src = `${base}${s}.webp`; room.dataset.state = s; rest(s); };
  rest(state);
  const calm = state === 'sleep' || state === 'sick';
  let spot = 0;
  // 돌아다니기: 깨어 있고 아프지 않을 때 7~10초마다 다른 자리로
  if (!calm) {
    wanderTimer = setInterval(() => {
      if (room.classList.contains('busy') || room.classList.contains('stroking')) return;
      const next = (spot + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length;
      pet.classList.toggle('face-left', SPOTS[next] < SPOTS[spot]);
      const walking = showAnim('walk', cat ? '.9s' : '.6s');
      pet.style.setProperty('--x', `${SPOTS[next]}%`);
      spot = next;
      if (walking) setTimeout(() => { if (!room.classList.contains('busy')) rest(room.dataset.state); }, 2600);
    }, 8000);
  }
  // 쓰다듬기 — 마우스는 올려서 문지르기, 손가락은 대고 문지르기
  let dist = 0, last = null, hearts = 0;
  const showHand = (e) => {
    const r = room.getBoundingClientRect();
    hand.style.left = `${e.clientX - r.left}px`;
    hand.style.top = `${e.clientY - r.top}px`;
  };
  const move = (e) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    showHand(e);
    room.classList.add('stroking');
    if (last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      const d = Math.hypot(dx, dy);
      dist += d;
      hand.style.setProperty('--tilt', `${Math.max(-18, Math.min(18, dx * 1.5))}deg`);
      if (dist > 110 * (hearts + 1)) {
        hearts++;
        heart(e);
        if (hearts === 3 && canPet()) setState('happy');
        onStroke?.(hearts);
      }
    }
    last = { x: e.clientX, y: e.clientY };
  };
  const leave = () => {
    room.classList.remove('stroking');
    last = null;
    clearTimeout(revertTimer);
    if (hearts >= 3) revertTimer = setTimeout(() => setState(room.dataset.base), 2500);
    dist = 0; hearts = 0;
  };
  const heart = (e) => {
    const r = room.getBoundingClientRect();
    const el = document.createElement('i');
    el.className = canPet() ? 'heart' : 'heart dim';
    el.textContent = canPet() ? '♥' : '…';
    el.style.left = `${e.clientX - r.left + (Math.random() * 30 - 15)}px`;
    el.style.top = `${e.clientY - r.top - 10}px`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  };
  room.dataset.base = state;
  pet.addEventListener('pointerenter', (e) => { showHand(e); room.classList.add('hovering'); });
  pet.addEventListener('pointermove', move);
  pet.addEventListener('pointerleave', () => { room.classList.remove('hovering'); leave(); });
  pet.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { pet.setPointerCapture(e.pointerId); room.classList.add('hovering'); showHand(e); } });
  pet.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { room.classList.remove('hovering'); leave(); } });
  pet.addEventListener('pointercancel', () => { room.classList.remove('hovering'); leave(); });

  // 할 일 버튼 반응 애니메이션. 끝나면 resolve
  function play(kind) {
    const banner = document.getElementById('room-banner');
    room.classList.add('busy');
    const say = (t) => { banner.textContent = t; banner.hidden = false; };
    const end = (ms, after) => new Promise((res) => setTimeout(() => { banner.hidden = true; room.classList.remove('busy', `do-${kind}`); after?.(); res(); }, ms));
    room.classList.add(`do-${kind}`);
    if (kind === 'feed') {
      if (!showAnim('eat', '.8s')) setState('hungry');
      pet.classList.remove('face-left');
      say('냠냠, 오도독…'); return end(2600, () => setState('happy'));
    }
    if (kind === 'potty') { const p = room.querySelector('.prop-pad'); say('새 패드로 쓱싹'); return end(1500, () => { if (p) p.src = 'art/prop/pad_clean.webp'; setState('happy'); }); }
    if (kind === 'litter') { const p = room.querySelector('.prop-litter'); say('모래를 싹싹'); return end(1500, () => { if (p) p.src = 'art/prop/litter_clean.webp'; setState('happy'); }); }
    if (kind === 'walk') {
      pet.classList.add('face-left'); showAnim('walk', '.6s'); pet.style.setProperty('--x', '20%');
      say(stage === 'baby' ? '바깥 구경 다녀올게요' : '산책 다녀올게요');
      return new Promise((res) => setTimeout(() => { pet.classList.add('out'); setTimeout(() => {
        say('🐾 다녀왔어요!'); pet.classList.remove('out', 'face-left'); showAnim('walk', '.6s'); pet.style.setProperty('--x', `${SPOTS[0]}%`);
        setTimeout(() => setState('happy'), 1300);
        end(1300).then(res);
      }, 1600); }, 1100));
    }
    const cat = type === 'short' || type === 'long';
    const sparkle = () => { const sp = document.createElement('span'); sp.className = 'sparkle'; sp.textContent = '✦ ✧ ✦'; pet.appendChild(sp); setTimeout(() => sp.remove(), 1900); };
    if (kind === 'play') {
      const toy = document.createElement('img'); toy.className = 'toy'; toy.src = `art/prop/${cat ? 'feather' : 'ball'}.webp`; toy.alt = '';
      room.appendChild(toy); setTimeout(() => toy.remove(), 2300);
      setState('happy'); say(cat ? '사냥 놀이!' : '공 던지기!'); return end(2300);
    }
    if (kind === 'train') { say('앉아! … 잘했어'); setTimeout(() => { setState('happy'); sparkle(); }, 700); return end(1900); }
    if (kind === 'brush') { setState('idle'); say('빗질 쓱쓱'); sparkle(); return end(1900, () => setState('happy')); }
    return end(800);
  }
  // 알려 주기만 하는 짧은 반응(아직 시간이 아님 등)
  function nudge(text) {
    const banner = document.getElementById('room-banner');
    banner.textContent = text; banner.hidden = false;
    room.classList.add('tilt');
    setTimeout(() => { banner.hidden = true; room.classList.remove('tilt'); }, 2200);
  }
  return { play, nudge, setState };
}
