// 방 화면 — 가로로 넓은 방(10/9 사용자 스케치: 왼쪽 현관=산책, 오른쪽 소파, 왼쪽 아래 패드, 아이 옆 밥그릇).
// 아이가 숨 쉬고 돌아다니고, 방 안 물건(밥그릇·패드·현관)을 누르면 돌봄을 하고, 그림자 손으로 쓰다듬을 수 있다
// 그림: art/room/room_wide.webp(방), art/sprite/<성향>_<단계>_<상태>.webp(배경 없는 아이), art/prop/*.webp(밥그릇·패드·화장실·장난감)

import { mountRig, RIG } from './rig.js?v=202610261746';
import { sfx, petLoop } from './sound.js?v=202610261746';

// 그림자 손 — 만지는 자리에 따라 모양이 바뀐다(10/12 사용자 요청)
// head: 위에서 손바닥을 얹어 머리를 쓰다듬기(손가락이 아래로) · chin: 아래에서 손가락을 구부려 턱 긁기 · body: 옆으로 눕힌 손으로 몸 쓸어 주기
const OPEN = 'M33 112c-9-10-17-26-21-40-2-7 6-11 11-5l9 13V30c0-6 9-6 9 0v30h3V18c0-6 9-6 9 0v40h3V22c0-6 9-6 9 0v38h3V32c0-6 9-6 9 0v44c0 14-4 26-12 36z';
const HANDS = {
  head: `<svg viewBox="0 0 120 120" aria-hidden="true"><path transform="translate(0 120) scale(1 -1)" d="${OPEN}"/></svg>`,
  tail: `<svg viewBox="0 0 120 120" aria-hidden="true"><path transform="rotate(90 60 60)" d="${OPEN}"/></svg>`,
  chin: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M30 118c-6-14-8-30-6-44 1-8 4-14 10-17l6-3c-3-6-3-13 2-15 4-2 8 1 9 6 0-7 3-12 8-12s8 5 8 12c1-6 5-9 9-8 5 1 6 7 4 13 4-3 9-2 10 3 2 6-2 12-6 17l-6 8c2 12 1 26-4 40z"/></svg>',
  body: `<svg viewBox="0 0 120 120" aria-hidden="true"><path transform="rotate(90 60 60)" d="${OPEN}"/></svg>`,
};

// 아이 키(방 높이 대비 %) — 성향·단계별로 실제 크기 차이를 느끼게
const HEIGHT = {
  small: { baby: 28, teen: 32, adult: 34 }, medium: { baby: 30, teen: 37, adult: 42 }, large: { baby: 31, teen: 42, adult: 48 },
  short: { baby: 28, teen: 32, adult: 35 }, long: { baby: 29, teen: 33, adult: 37 },
};
const SPOTS = [54, 46, 63, 50, 70]; // 바닥에서 돌아다니는 가로 위치(%)
const DOOR = { x: 35.8, y: 41, s: 0.5 }; // 현관 앞(멀리 있으니 작게)
const BOWL_X = 41; // 밥그릇 가운데(%)
let lastX = SPOTS[0]; // 다시 그려도 아이가 있던 자리에서 이어지게

// 움직임 다듬기 값(art/meta.json과 함께 쓴다 — tools/fix_art.py가 만든다)
const SIZE = { walk: 1.15, eat: 1.25 }; // 클립 속 아이의 화면 넓이 ÷ 앉은 그림 넓이(먹기는 그릇 포함이라 조금 크게)
const WALK_DEF = 0.8;   // 걷기 클립에 속도 값이 없을 때: 1초에 클립 높이의 몇 배를 가나
const CORNER = SPOTS[4];  // 낯선 첫 며칠 머무는 자리(소파 옆 구석)
const MIN_STEP = 8;     // 돌아다닐 때 한 번에 최소 이동(%) — 너무 짧으면 한두 발짝에 멈춰 어색하다
const FADE = 220;       // 모습이 바뀔 때 겹쳐 사라지는 시간(ms)
const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// 시간대별 아이 색(방 조명과 같은 색을 곱한다). 낮에도 방이 따뜻한 색이라 기본으로 조금 따뜻하게(빨강↑ 파랑↓)
const WARM = [1.04, 1, 0.88];
const TINT = { morning: [1, 0.99, 0.97], day: [1, 1, 1], evening: [0.96, 0.87, 0.82], night: [0.55, 0.58, 0.68] };
// grade-*: 아이(따뜻하게 + 시간대), tint-*: 밥그릇·화장실 같은 물건(시간대만 — 물건은 원래 방과 같은 색감)
const mul = (id, [r, g, b]) => `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r.toFixed(3)} 0 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 0 ${b.toFixed(3)} 0 0 0 0 0 1 0"/></filter>`;
const GRADE = `<svg class="grade-defs" aria-hidden="true" focusable="false">${Object.entries(TINT).map(([k, t]) =>
  mul(`grade-${k}`, t.map((v, i) => v * WARM[i])) + mul(`tint-${k}`, t)).join('')}</svg>`;

export function timeOfDay(min) {
  if (min < 300 || min >= 1260) return 'night';
  if (min < 540) return 'morning';
  if (min < 1050) return 'day';
  return 'evening';
}

// 방 안 물건 = 누를 수 있는 버튼. spots[kind] = { cls: 'now'|'done'|'away'|'', sub } — 지금 할 일이면 물건이 반짝인다
const tagOf = (label, sp) => `<span class="spot-tag ${sp?.cls ?? ''}">${label}${sp?.sub ? `<small>${sp.sub}</small>` : ''}</span>`;
const spotCls = (sp) => (sp?.cls ? ` ${sp.cls}` : '');

// need: 말풍선 글, prop: { pad|litter: 'clean'|'used', bowl: 'empty'|'full' }
export function roomHTML({ type, stage, state, tod, need, prop, spots = {}, clock, tag }) {
  const h = HEIGHT[type][stage] * (state === 'sleep' || state === 'sick' ? 0.78 : 1);
  const cat = type === 'short' || type === 'long';
  const pad = prop.pad ? `<button class="prop-btn prop-pad${spotCls(spots.potty)}" data-act="potty" aria-label="패드 갈기"><img src="art/prop/pad_${prop.pad}.webp" alt="" draggable="false">${tagOf('패드', spots.potty)}</button>` : '';
  const litter = prop.litter ? `<button class="prop-btn prop-litter${spotCls(spots.litter)}" data-act="litter" aria-label="화장실 치우기"><img src="art/prop/litter_${prop.litter}.webp" alt="" draggable="false">${tagOf('화장실', spots.litter)}</button>` : '';
  const bowl = `<button class="prop-btn prop-bowl${spotCls(spots.feed)}" data-act="feed" aria-label="밥 주기"><img id="bowl-img" src="art/prop/bowl_${prop.bowl ?? 'empty'}.webp" alt="" draggable="false">${tagOf('밥', spots.feed)}</button>`;
  const water = '<img class="prop prop-water" src="art/prop/bowl_water.webp" alt="">';
  const out = stage === 'baby' ? '바깥 구경' : '산책 가기';
  const door = cat ? '' : `<button class="spot spot-door${spotCls(spots.walk)}" data-act="walk" aria-label="${out}">${tagOf(out, spots.walk)}</button>`;
  return `<div class="room" id="room" data-tod="${tod}" data-state="${state}">
    ${GRADE}
    <img class="room-bg" src="art/room/room_wide.webp" alt="">
    <div class="room-light"></div>
    ${door}${pad}${litter}${water}${bowl}
    <div class="pet" id="pet" style="--h:${h}%;--x:${lastX}%">
      <i class="pet-shadow"></i>
      <img class="pet-img" id="pet-img" src="art/sprite/${type}_${stage}_${state}.webp" alt="" draggable="false">
      <canvas class="pet-rig" id="pet-rig" hidden></canvas>
      <div class="pet-anim" id="pet-anim" hidden></div>
      <img class="pet-clip" id="pet-clip" alt="" hidden draggable="false">
      <img class="pet-link" id="pet-link" alt="" hidden draggable="false">
      ${need ? `<div class="need" id="need">${need}</div>` : ''}
    </div>
    <div class="zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></div>
    <div class="hand z-body" id="hand">${HANDS.body}</div>
    <div class="fx" id="fx" aria-hidden="true"></div>
    ${tag ? `<div class="room-top"><span class="room-tag">${tag}</span><span class="room-clock">${clock}</span></div>` : ''}
    <div class="room-banner" id="room-banner" hidden></div>
  </div>`;
}

// 움직임 프레임 목록(art/anim/index.json): '<성향>_<단계>_<동작>' → 한 칸 가로/세로 비율
// 영상 클립 목록(art/clip/index.json): 같은 이름 → 있으면 4장 프레임 대신 영상으로 만든 움직이는 WebP를 쓴다
let ANIM = {};
let CLIP = {};
// 연결 영상 목록(art/link/index.json, tools/make_link.py): 앉은 평소 그림에서 그대로 이어지는 영상
//   <이름>_stand(일어나 옆으로 돌아 걷기 시작) · <이름>_sit(거꾸로 — 걷다가 앉기) · <이름>_eatf(앉은 채 앞 그릇에서 먹고 같은 자세로)
//   <이름>.box = 평소 그림 속 몸 상자, _geom = 영상 속 몸 상자 → 둘을 맞춰 겹치면 자세가 끊기지 않는다
let LINK = {};
// 그림 메타(art/meta.json): sprite/clip/anim[이름] = { foot: 발 아래 빈 여백, body: 몸 높이, area: 넓이 } (모두 프레임 높이 대비)
// clip 걷기엔 speed(1초에 프레임 높이의 몇 배를 가야 발이 안 미끄러지나), 먹기엔 bowl(그릇 가운데 가로 위치)
let META = { sprite: {}, clip: {}, anim: {} };
export async function loadAnim() {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  let meta;
  [ANIM, CLIP, meta, LINK] = await Promise.all([get('art/anim/index.json?v=202610261746'), get('art/clip/index.json?v=202610261746'), get('art/meta.json?v=202610261746'), get('art/link/index.json?v=202610261746')]);
  META = { sprite: {}, clip: {}, anim: {}, ...meta };
}

// 미니게임 등에서 쓰는 움직이는 그림(없으면 null)
export function clipInfo(name, k) { const r = CLIP[`${name}_${k}`]; return r ? { src: `art/clip/${name}_${k}.webp`, ratio: r } : null; }

let wanderTimer = null;
let liveRig = null;   // 방을 다시 그릴 때 예전 움직임 캔버스(WebGL)를 닫는다 — 안 닫으면 1분마다 쌓여 브라우저가 경고한다
let revertTimer = null;

// 방을 살린다: 돌아다니기 + 쓰다듬기. onStroke(누적 쓰다듬은 정도)로 앱이 마음 점수를 올린다
// shy: 데려온 뒤 적응(engine adaptOf) — 1이면 구석(CORNER)에 머물고 만지면 움찔, 0.5면 덜 돌아다니고 하트가 천천히 찬다
// 그려 넣은 액세서리 레이어 목록(tools/make_wear.py) — 있으면 스티커 대신 아이별 레이어를 쓴다
const LAYERS = fetch('art/wear/layers.json?v=202610261746').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const wearFor = (name, wear, L) => wear.map((w) => ((L[name] ?? []).includes(w.art) ? { src: `art/wear/${name}/${w.art}.webp?v=202610261746`, slot: w.slot, art: w.art, layer: true, pad: L._pad?.[name] ?? 0 } : w));
export function mountRoom({ type, stage, state, onStroke, canPet, onTip, wear = [], shy = 0 }) {
  clearInterval(wanderTimer);
  clearTimeout(revertTimer);
  liveRig?.destroy?.();
  liveRig = null;
  const room = document.getElementById('room');
  const pet = document.getElementById('pet');
  const img = document.getElementById('pet-img');
  const hand = document.getElementById('hand');
  const fx = document.getElementById('fx');
  if (!room) return null;
  const base = `art/sprite/${type}_${stage}_`;
  const anim = document.getElementById('pet-anim');
  const cat = type === 'short' || type === 'long';
  const name = `${type}_${stage}`;
  const has = (k) => ANIM[`${name}_${k}`];
  const clip = document.getElementById('pet-clip');
  // 평소 모습: 그림 한 장을 부위별로 움직인다(js/rig.js). 준비되기 전·WebGL이 없으면 4장 프레임으로
  const cv = document.getElementById('pet-rig');
  let rig = null, rigReady = false;
  if (RIG[name] && cv) {
    rig = mountRig(cv, `${base}idle.webp`, RIG[name], { cat });
    liveRig = rig;
    rig?.tint((TINT[room.dataset.tod] ?? TINT.day).map((v, i) => v * WARM[i]));   // 캔버스엔 CSS 필터를 걸지 않고 셰이더에서 곱한다
    LAYERS.then((L) => { if (liveRig === rig) rig?.wear(wearFor(name, wear, L)); });
    cv.addEventListener('rigready', () => {
      cv.style.height = `${rig.scale() * 100}%`;
      cv.style.aspectRatio = String(rig.aspect());
      // 캔버스는 위쪽 여백만큼 커서, 발 아래 여백도 캔버스 높이 기준으로 바꿔 내린다
      cv.style.setProperty('--drop', `${((META.sprite[`${name}_idle`]?.foot ?? 0) / rig.scale() * 100).toFixed(2)}%`);
      rigReady = true;
      // 그림이 오기 전에 잠깐 보인 꼬리 흔들기 프레임(wag)도 부위별 움직임으로 바꾼다(걷기·먹기 중엔 그대로)
      if (!room.classList.contains('busy') && clip.hidden && (anim.hidden || anim.dataset.k === 'wag')) rest(room.dataset.state);
    }, { once: true });
  }
  const rigOn = (on) => { if (!rig) return; cv.hidden = !on; img.style.visibility = on ? 'hidden' : ''; };
  const foot = (m) => `${((m?.foot ?? 0) * 100).toFixed(2)}%`;   // 발 아래 빈 여백만큼 내려 바닥에 붙인다
  const dropImg = (s) => img.style.setProperty('--drop', foot(META.sprite[`${name}_${s}`]));
  // 클립 크기: 앉은 그림과 화면 넓이가 SIZE 배가 되게(자세가 달라도 같은 아이로 보이게). 메타가 없으면 예전처럼 상자 높이 그대로
  const clipK = (k) => {
    const a = META.sprite[`${name}_idle`]?.area, b = META.clip[`${name}_${k}`]?.area;
    // 연결 영상이 있으면 걷기 크기는 영상 속 일어선 모습 넓이로(일어나기 끝 장면과 같은 크기로 이어지게)
    const size = k === 'walk' && LINK[name]?.walk ? LINK[name].walk : SIZE[k];
    return a && b ? Math.sqrt(size * a / b) : 1;
  };
  dropImg(state);
  if (shy >= 1 && lastX !== CORNER) { lastX = CORNER; pet.style.setProperty('--walk', '0ms'); pet.style.setProperty('--x', `${lastX}%`); }

  // 모습이 바뀔 때: 나가는 모습을 그대로 복사해 FADE 동안 겹쳐 두고 사라지게 → 갑자기 바뀌는 '툭' 끊김을 줄인다
  let shownFlip = 1;
  const flipNow = () => (pet.classList.contains('face-left') ? -1 : 1);
  const link = document.getElementById('pet-link');
  const visible = () => (rig && !cv.hidden ? cv : !link.hidden ? link : !clip.hidden ? clip : !anim.hidden ? anim : img);
  const ghost = (next) => {
    if (REDUCE) return;
    const el = visible();
    if (!el || el === next) return;
    // 움직이는 webp(연결 영상·걷기 클립)는 캔버스에 그리면 '첫 장면'이 그려진다(지금 장면이 아님) → 앉기 끝에 옆으로 선 모습이 겹쳐 보였다.
    // 연결 영상은 끝·시작 장면이 이어지게 만들어져 있어 겹침 없이 바로 바꾼다
    if (el === link || el === clip) return;
    const pr = pet.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let g;
    if (el === anim) {
      // 프레임 스트립: 지금 보이는 칸(배경 위치)을 그대로 복사
      const cs = getComputedStyle(anim);
      g = document.createElement('div');
      Object.assign(g.style, { backgroundImage: cs.backgroundImage, backgroundSize: cs.backgroundSize, backgroundPosition: cs.backgroundPosition, backgroundRepeat: 'no-repeat' });
    } else {
      const dpr = Math.min(2, devicePixelRatio || 1);
      g = document.createElement('canvas');
      g.width = Math.round(r.width * dpr); g.height = Math.round(r.height * dpr);
      try { g.getContext('2d').drawImage(el, 0, 0, g.width, g.height); } catch { return; }
    }
    g.className = el === cv ? 'pet-ghost graded' : 'pet-ghost';   // 움직임 캔버스를 복사한 건 이미 시간대 색이 들어가 있다
    // 가로는 pet 가운데 기준(pet은 가운데 정렬이라 안에 든 모습에 따라 너비가 바뀌어도 가운데는 그대로다)
    Object.assign(g.style, { left: `calc(50% + ${r.left - pr.left - pr.width / 2}px)`, top: `${r.top - pr.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: `scaleX(${shownFlip})`, animationDuration: `${FADE}ms` });
    pet.appendChild(g);
    setTimeout(() => g.remove(), FADE + 60);
    if (next) {
      next.classList.remove('fade-in'); void next.offsetWidth; next.classList.add('fade-in');
      clearTimeout(next._fade); next._fade = setTimeout(() => next.classList.remove('fade-in'), FADE);
    }
  };

  // 큰 동작 재생: 영상 클립이 있으면 클립, 없으면 프레임 스트립(4칸, steps). 둘 다 없으면 false → 정지 그림 유지
  const showAnim = (k, dur) => {
    if (CLIP[`${name}_${k}`]) {
      const src = `art/clip/${name}_${k}.webp`;
      const same = !clip.hidden && clip.src.endsWith(src);
      if (!same) ghost(clip);
      rigOn(false); linkOff();
      if (!clip.src.endsWith(src)) clip.src = src;
      clip.style.translate = '';
      clip.style.setProperty('--k', clipK(k).toFixed(3));
      clip.style.setProperty('--drop', foot(META.clip[`${name}_${k}`]));
      clip.hidden = false; anim.hidden = true; img.hidden = true;
      shownFlip = flipNow();
      return true;
    }
    const ratio = has(k);
    if (!ratio) { rigOn(false); return false; }
    ghost(anim); rigOn(false); linkOff();
    anim.style.backgroundImage = `url(art/anim/${name}_${k}.webp)`;
    anim.style.aspectRatio = String(ratio);
    anim.style.setProperty('--dur', dur);
    anim.style.setProperty('--drop', foot(META.anim[`${name}_${k}`]));
    anim.dataset.k = k;
    clip.hidden = true; anim.hidden = false; img.hidden = true;
    shownFlip = flipNow();
    return true;
  };
  const hideAnim = () => { anim.hidden = true; clip.hidden = true; img.hidden = false; linkOff(); };
  // 배고픔 그림엔 그릇이 그려져 있어 방 그릇과 겹친다 → 평소 모습 + 말풍선. 옷·액세서리를 입었으면 말썽 상태도 움직이는 모습으로(입은 게 보이게)
  const calmOf = (s) => s === 'idle' || s === 'happy' || s === 'hungry' || (s === 'oops' && wear.length > 0);
  // 평소·기분 좋은 상태면 부위별 움직임(없으면 꼬리 흔들기 프레임), 아니면 정지 그림
  const rest = (s) => {
    const calmish = calmOf(s);
    if (calmish && idleOn()) { rig?.mood(s === 'happy'); return; }   // 가만히 반복 영상(10/20) — 쓰다듬는 동안만 아래 움직임 캔버스
    if (calmish && rigReady) { if (cv.hidden) ghost(cv); hideAnim(); rigOn(true); rig.mood(s === 'happy'); shownFlip = flipNow(); return; }
    if (calmish && has('wag') && !CLIP[`${name}_wag`] && showAnim('wag', cat ? '1.6s' : s === 'happy' ? '.45s' : '.7s')) return;
    if (img.hidden || (rig && !cv.hidden)) ghost(img);   // 클립·스트립·움직임 캔버스 → 정지 그림
    rigOn(false);
    hideAnim();
    shownFlip = flipNow();
  };

  // 연결 영상: 미리 받아 두고(Blob), 틀 때마다 새 주소를 만들어 첫 장면부터 다시 재생한다(같은 주소면 이어서 돈다)
  const blobs = {};
  if (LINK[name] && !REDUCE) for (const k of ['stand', 'sit', 'eatf', 'idle']) {
    if (LINK[`${name}_${k}`]) fetch(`art/link/${name}_${k}.webp?v=202610261746`).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!b) return;
      blobs[k] = b;
      // 반복 영상이 늦게 오면: 가만히 있는 중일 때 바로 바꿔 낀다
      if (k === 'idle' && !busy() && !room.classList.contains('stroking') && clip.hidden && calmOf(room.dataset.state)) rest(room.dataset.state);
    }).catch(() => {});
  }
  // 앉은 모습(움직임 캔버스)이 보이고 있을 때만 이어 붙인다 — 다른 자세(아픔·말썽 그림)에서 시작하면 끊겨 보인다
  const linkable = (k) => blobs[k] && ((rigReady && rig && !cv.hidden) || (!link.hidden && link.dataset.k === 'idle'));
  // 화면 속 평소 그림의 몸 상자(그림은 pet 높이 꽉, 가로 가운데, 발 = pet 바닥)에 영상 속 몸 상자를 맞춘다
  const placeLink = () => {
    const g = LINK._geom, [x0, y0, x1, y1] = LINK[name].box;
    const ph = pet.offsetHeight, iw = ph * (img.naturalWidth / img.naturalHeight || 1);
    const bodyH = ph * (y1 - y0), cx = (pet.offsetWidth - iw) / 2 + (x0 + x1) / 2 * iw;
    const h = bodyH / g.body, w = h * g.aspect;
    Object.assign(link.style, { height: `${h}px`, width: `${w}px`, left: `${cx - g.cx * w}px`, top: `${ph - g.foot * h}px`, transformOrigin: `${g.cx * 100}% 0` });
  };
  // 연결 영상 틀기 → 재생 시간(ms). 못 틀면 0
  const playLink = (k) => {
    if (!blobs[k]) return 0;
    ghost(link);
    const old = link.src;
    link.src = URL.createObjectURL(blobs[k]);
    link.dataset.k = k;
    if (old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1000);
    anim.hidden = true; clip.hidden = true; img.hidden = false;
    rigOn(false);
    img.style.visibility = 'hidden';   // 그림은 자리(pet 너비)만 지킨다
    placeLink();                       // 걷기 클립이 빠져 pet 너비가 앉은 그림 너비로 돌아온 뒤에 잰다
    link.hidden = false;
    shownFlip = flipNow();
    return LINK[`${name}_${k}`].ms;
  };
  function linkOff() { if (!link.hidden) { link.hidden = true; link.dataset.k = ''; img.style.visibility = ''; } }
  // 가만히 반복 영상 켜기 → 켰으면 true. 이미 켜져 있으면 그대로(처음부터 다시 틀지 않는다)
  function idleOn() {
    if (!blobs.idle || REDUCE || room.classList.contains('stroking')) return false;   // 쓰다듬는 중엔 움직임 캔버스(눈 감기·귀 반응)
    if (!link.hidden && link.dataset.k === 'idle') return true;
    playLink('idle');
    return true;
  }
  // 일어나기 끝 장면과 걷기 클립의 무게중심 차이(px, pet 기준) — 바꿔 끼울 때 이만큼 pet을 순간 이동해 아이가 제자리에 있게
  const joinPx = () => {
    const L = LINK[name], g = LINK._geom;
    if (L?.dEnd === undefined || !CLIP[`${name}_walk`]) return 0;
    const [x0, y0, x1, y1] = L.box, f = flipNow();
    const ph = pet.offsetHeight;
    const iw = ph * (img.naturalWidth / img.naturalHeight || 1);
    const end = ((x0 + x1) / 2 - 0.5) * iw + L.dEnd * ph * (y1 - y0) * f;          // 끝 장면 무게중심(pet 가운데 기준)
    const walkW = ph * clipK('walk') * CLIP[`${name}_walk`];
    return end - (L.wcx - 0.5) * walkW * f;                                          // − 걷기 클립 무게중심
  };
  // pet을 px만큼 순간 이동하되 지금 보이는 모습은 반대로 밀어 화면에선 그대로 → 다음 모습으로 바꿀 때 겹쳐 사라지는 모습(ghost)도 제자리
  const shiftPet = (px) => {
    if (!px) return;
    const rw = room.getBoundingClientRect().width;
    const el = visible();
    if (el === link) link.style.left = `${parseFloat(link.style.left) - px}px`;
    else if (el === clip) clip.style.translate = `${-px}px 0`;
    pet.style.setProperty('--walk', '0ms');
    lastX += px / rw * 100;
    pet.style.setProperty('--x', `${lastX}%`);
    void pet.offsetWidth;
  };
  // 일어나기(연결 영상) → then. 연결 영상이 없으면 바로 then
  const getUp = (then) => {
    const ms = linkable('stand') ? playLink('stand') : 0;
    if (ms) setTimeout(() => { shiftPet(joinPx()); then(); }, ms - 40); else then();
  };
  // 걷기를 마치고 앉기 → then. 앉은 모습으로 돌아갈 상태일 때만
  const sitDown = (then) => {
    const ok = blobs.sit && rigReady && calmOf(room.dataset.state);
    if (ok) shiftPet(-joinPx());
    const ms = ok ? playLink('sit') : 0;
    if (ms) setTimeout(then, ms); else then();
  };

  // 걷기: 클립 속 발이 땅을 미는 속도(meta speed) × 화면 속 클립 높이 = 실제로 옮길 속도. 거리에 따라 시간이 정해져 발이 미끄러지지 않는다
  const walkMs = (dx, dy = 0, s = 1) => {
    const rr = room.getBoundingClientRect();
    const boxH = rr.height * (parseFloat(pet.style.getPropertyValue('--h')) / 100) * s;
    const v = (META.clip[`${name}_walk`]?.speed ?? WALK_DEF) * boxH * (CLIP[`${name}_walk`] ? clipK('walk') : 1);
    const dist = Math.hypot(dx / 100 * rr.width, dy / 100 * rr.height);
    return Math.round(Math.min(7000, Math.max(450, dist / Math.max(v, 1) * 1000)));
  };
  const moveTo = (x, { y, s } = {}) => {
    const sNow = parseFloat(pet.style.getPropertyValue('--s')) || 1;
    const yNow = parseFloat(pet.style.getPropertyValue('--y')) || 8;
    const ms = walkMs(x - lastX, y === undefined ? 0 : y - yNow, s === undefined ? sNow : (sNow + s) / 2);
    pet.style.setProperty('--walk', `${ms}ms`);
    pet.style.setProperty('--x', `${x}%`);
    if (y !== undefined) pet.style.setProperty('--y', `${y}%`);
    if (s !== undefined) pet.style.setProperty('--s', s);
    lastX = x;
    if (!cat) sfx.steps(ms);   // 강아지 발톱 톡톡(고양이는 조용히 걷는다)
    return ms;
  };

  // 클립 미리 받아 두기(처음 걸을 때 빈 칸이 보이지 않게)
  for (const k of ['walk', 'eat']) if (CLIP[`${name}_${k}`]) new Image().src = `art/clip/${name}_${k}.webp`;
  const setState = (s) => { img.src = `${base}${s}.webp`; dropImg(s); room.dataset.state = s; rest(s); };
  rest(state);
  const calm = state === 'sleep' || state === 'sick';
  // 돌아다니기: 깨어 있고 아프지 않을 때 8초마다 MIN_STEP 이상 떨어진 다른 자리로
  // 일어나기 → 걷기 → 앉기: 연결 영상이 있으면 앉은 모습에서 끊김 없이 일어나 걷고, 도착하면 다시 앉는다
  let moving = false;
  const busy = () => room.classList.contains('busy');
  let tick = 0;
  if (!calm && shy < 1) {
    wanderTimer = setInterval(() => {
      if (moving || busy() || room.classList.contains('stroking')) return;
      if (shy && tick++ % 2) return;
      const cands = SPOTS.filter((x) => Math.abs(x - lastX) >= MIN_STEP);
      const nx = cands[Math.floor(Math.random() * cands.length)];
      if (nx === undefined) return;
      moving = true;
      pet.classList.toggle('face-left', nx < lastX);
      getUp(() => {
        if (busy()) { moving = false; return; }
        const walking = showAnim('walk', cat ? '.9s' : '.6s');
        const ms = moveTo(nx);
        setTimeout(() => {
          if (busy() || !walking) { moving = false; return; }
          sitDown(() => { moving = false; if (!busy()) rest(room.dataset.state); });
        }, walking ? ms : 0);
      });
    }, 8000);
  }
  // 쓰다듬기 — 마우스는 올려서 문지르기, 손가락은 대고 문지르기
  let dist = 0, last = null, hearts = 0;
  // 손이 닿은 자리: 그림 좌표로 바꿔 눈·목 높이(RIG)와 비교 → 머리 위 / 턱 / 몸. 손 크기는 두 눈 사이 거리에 맞춘다
  let zone = 'body';
  const zoneAt = (e) => {
    const cfg = RIG[name];
    const useRig = rig && !cv.hidden && cfg;
    const el = useRig ? cv : img;
    const r = el.getBoundingClientRect();
    if (!cfg || !r.height || !img.naturalHeight) {   // 걷기·먹기 영상 중 등: 위에서부터 비율로
      const f = (e.clientY - r.top) / r.height;
      return { z: f < 0.28 ? 'head' : f < 0.42 ? 'chin' : 'body', size: r.height * 0.3 };
    }
    const H = img.naturalHeight, W = img.naturalWidth, pad = cfg.pad ?? 70;
    const sh = useRig ? H + pad : H, sw = useRig ? W + pad * 2 : W;
    const sy = (e.clientY - r.top) / r.height * sh - (useRig ? pad : 0);
    const sx = (e.clientX - r.left) / r.width * sw - (useRig ? pad : 0);
    const [a, b] = cfg.eyes, eyeY = (a[1] + b[1]) / 2, ed = Math.abs(b[0] - a[0]), cx = (a[0] + b[0]) / 2;
    const px = r.height / sh;                         // 그림 1px → 화면 px
    const size = ed * 1.7 * px;
    // 고양이 꼬리 쪽(꼬리 상자 + 여유): 싫어하는 자리(Ellis 외 2015 — 꼬리 뿌리에서 싫은 반응이 가장 많았다)
    const tb = cfg.tail?.box, m = ed * 0.5;
    if (cat && tb && sx > tb[0] - m && sx < tb[2] + m && sy > tb[1] - m && sy < tb[3] + m) return { z: 'tail', size: size * 1.15 };
    if (sy < eyeY + ed * 0.2) return { z: 'head', size };
    if (sy < cfg.neck[1] + ed * 0.35 && Math.abs(sx - cx) < ed * 1.1) return { z: 'chin', size };
    return { z: 'body', size: size * 1.15 };
  };
  const showHand = (e) => {
    const r = room.getBoundingClientRect();
    const { z, size } = zoneAt(e);
    if (z !== zone) { zone = z; hand.className = `hand z-${z}`; hand.innerHTML = HANDS[z]; }
    hand.style.width = `${Math.round(size)}px`;
    hand.style.left = `${e.clientX - r.left}px`;
    hand.style.top = `${e.clientY - r.top}px`;
  };
  // 자리마다 하트가 차는 빠르기: 고양이는 턱·머리, 강아지는 가슴·몸을 더 좋아한다(작은 연구들 — 앱 안 팁에 출처)
  const LIKE = cat ? { chin: 0.8, head: 1, body: 1.25 } : { body: 0.85, chin: 0.9, head: 1 };
  let tailDist = 0, tipped = false;
  const move = (e) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    showHand(e);
    room.classList.add('stroking');
    if (link.dataset.k === 'idle' && !link.hidden && rigReady && !busy()) { linkOff(); rigOn(true); shownFlip = flipNow(); }
    clearTimeout(idleBack);
    rig?.pet(true);
    rig?.zone(zone);
    const hate = zone === 'tail' || (shy >= 1 && canPet());   // 낯선 며칠은 어디를 만져도 움찔
    rig?.annoy(hate && canPet());
    if (canPet() && !hate) petLoop(cat ? 'cat' : 'dog', true);   // 골골 / 헥헥
    else petLoop(null, false);
    if (last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      const d = Math.hypot(dx, dy);
      hand.style.setProperty('--tilt', `${Math.max(-18, Math.min(18, dx * 1.5))}deg`);
      if (hate) {
        // 꼬리 쪽: 하트 대신 '…', 계속 만지면 한 번 알려 준다
        tailDist += d;
        if (tailDist > 140) { tailDist = 0; heart(e, true); if (!tipped && canPet()) { tipped = true; onTip?.(zone === 'tail' ? 'cat_tail' : 'shy'); } }
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      dist += d / (LIKE[zone] ?? 1) / (shy ? 1.8 : 1);   // 적응 중엔 하트가 천천히
      if (!cat && zone === 'body' && dist > 300 && !tipped && canPet()) { tipped = true; onTip?.('dog_chest'); }
      if (dist > 110 * (hearts + 1)) {
        hearts++;
        heart(e);
        if (hearts === 3 && canPet()) setState('happy');
        onStroke?.(hearts);
      }
    }
    last = { x: e.clientX, y: e.clientY };
  };
  let idleBack = null;
  const leave = () => {
    room.classList.remove('stroking');
    rig?.pet(false);
    rig?.annoy(false);
    petLoop(null, false);
    last = null;
    clearTimeout(revertTimer);
    if (hearts >= 3) revertTimer = setTimeout(() => setState(room.dataset.base), 2500);
    else { clearTimeout(idleBack); idleBack = setTimeout(() => { if (!busy() && !room.classList.contains('stroking') && clip.hidden) rest(room.dataset.state); }, 1500); }
    dist = 0; hearts = 0;
  };
  const heart = (e, dim = false) => {
    const r = room.getBoundingClientRect();
    const el = document.createElement('i');
    const ok = canPet() && !dim;
    el.className = ok ? 'heart' : 'heart dim';
    if (ok) sfx.pop();
    el.textContent = ok ? '♥' : '…';
    el.style.left = `${e.clientX - r.left + (Math.random() * 30 - 15)}px`;
    el.style.top = `${e.clientY - r.top - 10}px`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  };
  room.dataset.base = state;
  // 커서(손가락)가 방 안에서 움직이면 그쪽으로 고개를 살짝 돌린다
  room.addEventListener('pointermove', (e) => {
    if (!rig) return;
    const pr = pet.getBoundingClientRect(), rr = room.getBoundingClientRect();
    rig.look((e.clientX - (pr.left + pr.width / 2)) / (rr.width * .4));
  });
  room.addEventListener('pointerleave', () => rig?.look(0));
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
      // 그릇에 사료를 붓고 → 아이가 그릇 오른쪽으로 걸어와 왼쪽을 보고 먹는다(몸이 빈 바닥 쪽으로 뻗어 왼쪽 화장실·패드와 겹치지 않게)
      // 먹는 영상엔 그릇이 함께 있어, 영상 속 그릇 가운데(meta bowl)를 방 그릇 가운데에 맞추고 방 그릇은 잠시 숨긴다 → 빈 그릇
      const bowlBtn = room.querySelector('.prop-bowl'), bowlImg = document.getElementById('bowl-img');
      if (bowlImg) bowlImg.src = 'art/prop/bowl_full.webp';
      sfx.pour();
      say('사료를 담았어요');
      const rr = room.getBoundingClientRect(), br = bowlBtn.getBoundingClientRect();
      const ratio = CLIP[`${name}_eat`] || has('eat');
      const em = META.clip[`${name}_eat`];
      const boxH = rr.height * (parseFloat(pet.style.getPropertyValue('--h')) / 100);
      let x, left = false;
      if (CLIP[`${name}_eat`] && em?.bowl) {
        const w = boxH * clipK('eat') * ratio;
        x = ((br.left + br.width / 2 - rr.left) + (em.bowl - 0.5) * w) / rr.width * 100;
        left = true;
      } else {
        const petW = boxH * (ratio || 1);
        x = ratio ? ((br.right - rr.left) - petW / 2) / rr.width * 100 : BOWL_X - 8;
      }
      // 앉은 채 먹는 연결 영상이 있으면: 일어나 → 그릇 바로 뒤로 걸어가 → 앉아(방 그릇이 앞에 보인다) → 앞을 보고 먹고 → 같은 자세로
      if (blobs.eatf && linkable('stand')) {
        const bx = (br.left + br.width / 2 - rr.left) / rr.width * 100;
        pet.classList.toggle('face-left', bx < lastX);
        return new Promise((res) => getUp(() => {
          showAnim('walk', cat ? '.9s' : '.6s');
          setTimeout(() => sitDown(() => {
            const ms = playLink('eatf');
            sfx.crunch(ms / 1000 * 0.8);
            bowlBtn.classList.add('eating');   // 영상 속에 그릇이 있다
            say('냠냠, 오도독…');
            end(ms, () => { bowlBtn.classList.remove('eating'); if (bowlImg) bowlImg.src = 'art/prop/bowl_empty.webp'; setState('happy'); }).then(res);
          }), moveTo(bx));
        }));
      }
      pet.classList.toggle('face-left', x < lastX);
      showAnim('walk', cat ? '.9s' : '.6s');
      const ms = moveTo(x);
      return new Promise((res) => setTimeout(() => {
        pet.classList.toggle('face-left', left);
        if (showAnim('eat', '.8s')) bowlBtn.classList.add('eating'); else setState('hungry');
        sfx.crunch(2.4);
        say('냠냠, 오도독…');
        end(2800, () => { bowlBtn.classList.remove('eating'); if (bowlImg) bowlImg.src = 'art/prop/bowl_empty.webp'; setState('happy'); }).then(res);
      }, ms));
    }
    if (kind === 'potty' || kind === 'litter') sfx.rustle();
    if (['play', 'train', 'treat', 'brush', 'meds'].includes(kind)) sfx.pop();
    if (kind === 'bath') sfx.bubbles();
    if (kind === 'potty') { const p = room.querySelector('.prop-pad img'); say('새 패드로 쓱싹'); return end(1500, () => { if (p) p.src = 'art/prop/pad_clean.webp'; setState('happy'); }); }
    if (kind === 'litter') { const p = room.querySelector('.prop-litter img'); say('모래를 싹싹'); return end(1500, () => { if (p) p.src = 'art/prop/litter_clean.webp'; setState('happy'); }); }
    if (kind === 'walk') {
      // 현관까지 걸어가(멀어질수록 작아짐) 문밖으로 → 잠시 뒤 돌아온다. 걷는 시간은 거리와 걷기 속도로 정한다
      pet.classList.add('face-left');
      say(stage === 'baby' ? '바깥 구경 다녀올게요' : '산책 다녀올게요');
      // 일어나 현관으로 → 문밖 → 돌아와 앉기(연결 영상이 있으면)
      return new Promise((res) => getUp(() => {
        showAnim('walk', '.6s');
        const goMs = moveTo(DOOR.x, { y: DOOR.y, s: DOOR.s });
        setTimeout(() => { pet.classList.add('out'); sfx.door(); setTimeout(() => {
          say('🐾 다녀왔어요!'); sfx.door(); pet.classList.remove('out', 'face-left'); showAnim('walk', '.6s');
          const backMs = moveTo(shy >= 1 ? CORNER : SPOTS[0], { y: 8, s: 1 });
          const sitMs = blobs.sit && rigReady ? LINK[`${name}_sit`].ms : 0;
          setTimeout(() => { room.dataset.state = 'happy'; sitDown(() => setState('happy')); }, backMs);
          end(backMs + sitMs).then(res);
        }, 1800); }, goMs);
      }));
    }
    const sparkle = () => { const sp = document.createElement('span'); sp.className = 'sparkle'; sp.textContent = '✦ ✧ ✦'; pet.appendChild(sp); setTimeout(() => sp.remove(), 1900); };
    if (kind === 'play') {
      const toy = document.createElement('img'); toy.className = 'toy'; toy.src = `art/prop/${cat ? 'feather' : 'ball'}.webp`; toy.alt = '';
      room.appendChild(toy); setTimeout(() => toy.remove(), 2300);
      setState('happy'); say(cat ? '사냥 놀이!' : '공 던지기!'); return end(2300);
    }
    if (kind === 'train') { say('앉아! … 잘했어'); setTimeout(() => { setState('happy'); sparkle(); }, 700); return end(1900); }
    if (kind === 'brush') { setState('idle'); say('빗질 쓱쓱'); sparkle(); return end(1900, () => setState('happy')); }
    if (kind === 'treat') { say('냠! 간식 맛있어요'); setState('happy'); sparkle(); return end(1700); }
    if (kind === 'bath') { setState('idle'); say('약욕 — 거품 내고 10분 기다렸다 헹궈요'); sparkle(); return end(2400, () => setState('happy')); }
    if (kind === 'meds') { setState('idle'); say('약 꿀꺽 — 잘했어!'); return end(1800, () => setState('happy')); }
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
