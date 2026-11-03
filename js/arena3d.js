// 3D 경주 공통(11/2 사용자 "반려 경주·장애물 경주 둘 다 3D로, 골인지점 주인도 3D로 반려견을 안아 주게")
// 장애물 경주(js/agility3d.js)·반려 경주(js/race3d.js)가 함께 쓴다: 경기장(잔디·코스 선·광고판 펜스·관중석·나무·언덕·구름·깃발·결승 아치),
// 우리 아이 3D(art/3d/pets/<성향_단계>.glb — tools/rig_pet.py), 보호자 3D(art/3d/owner.glb — tools/owner_hug.py로 Welcome·Hug 동작을 더한 Quaternius 모델)
// 좌표: x 오른쪽 · y 위 · 코스는 -z 방향(위치 s m → z = -s)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { makeBlinker } from './blink.js?v=202611031055';

export const SIZE = { small: 0.5, medium: 0.6, large: 0.7, short: 0.48, long: 0.5 };
export const STAGE_K = { baby: 0.78, teen: 0.9, adult: 1 };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const shuffleR = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const webglOK = () => { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; } };

const gltfLoader = new GLTFLoader();
export const loadGLB = (src) => new Promise((res) => gltfLoader.load(src, res, undefined, () => res(null)));
const texLoader = new THREE.TextureLoader();
export const loadTex = (src) => new Promise((res) => texLoader.load(src, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));

// ---------- 캔버스로 만드는 무늬 ----------
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export const stripeTex = (a, b, n = 6, vertical = false) => canvasTex(64, 64, (g, w, h) => {
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; if (vertical) g.fillRect(0, (h * i) / n, w, h / n + 1); else g.fillRect((w * i) / n, 0, w / n + 1, h); }
}, true);
export const roundTex = (inner, outer) => canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const boardTex = (bg) => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  g.font = '40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) g.fillText('🐾', w * (i + 0.5) / 3, h / 2 + 2);
});
// 이름표(봇 머리 위)
export const nameTex = (txt) => canvasTex(256, 72, (g, w, h) => {
  g.font = '900 40px Pretendard, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(w - 8, g.measureText(txt).width + 36);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.roundRect((w - tw) / 2, 8, tw, h - 16, 28); g.fill();
  g.fillStyle = '#2D2A26'; g.fillText(txt, w / 2, h / 2 + 2);
});
export const SHIRT = ['#E8657A', '#4F8FC0', '#F2D24B', '#3F6B4F', '#B98AD9', '#F2A93B', '#FFFFFF', '#6FC1B6'];

// ---------- 무대(렌더러·빛·안개) ----------
export function makeStage(cv) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#BFE3F2'); scene.fog = new THREE.Fog('#DDF0F4', 35, 150);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight('#EAF6FF', '#7FA35E', 1.15));
  const sun = new THREE.DirectionalLight('#FFF4DE', 2.1);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  return { renderer, scene, camera, sun };
}
export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
export const mesh = (geo, mat, { cast = true, recv = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; };

// ---------- 경기장 ----------
// half: 코스 반폭(흰 선 위치) · lanes: 레인 수(1이면 가운데 선 없음) · end: 결승 위치(m) · r: 난수
export function buildArena(scene, { half, lanes = 1, end, r }) {
  const LEN = end + 60;
  const grassT = stripeTex('#86BE63', '#77B055', 2, true); grassT.repeat.set(1, LEN / 6);
  const ground = mesh(new THREE.PlaneGeometry(80 + half * 2, LEN + 80), std('#ffffff', { map: grassT }), { cast: false });
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -(LEN / 2) + 20); scene.add(ground);
  const lineM = std('#FFFFFF');
  for (let i = 0; i <= lanes; i++) {
    const x = -half + (2 * half * i) / lanes;
    const l = mesh(new THREE.PlaneGeometry(i === 0 || i === lanes ? 0.06 : 0.04, LEN), lineM, { cast: false }); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.005, -(LEN / 2) + 10); scene.add(l);
  }
  { const l = mesh(new THREE.PlaneGeometry(half * 2 + 0.06, 0.12), lineM, { cast: false }); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.006, 0); scene.add(l); }
  // 결승선(흰 줄)
  { const l = mesh(new THREE.PlaneGeometry(half * 2 + 0.06, 0.16), lineM, { cast: false }); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.006, -end); scene.add(l); }

  // 펜스: 광고판 같은 색 판(두께 있는 상자) — 양쪽, 2.4m마다
  const FX = half + 1.48;
  const boards = ['#E8657A', '#4F8FC0', '#F2A93B', '#3F6B4F'].map((c) => std('#ffffff', { map: boardTex(c) }));
  const boardSide = std('#E9E4DA');
  const bGeo = new THREE.BoxGeometry(0.1, 0.6, 2.3);
  for (let s = -12, i = 0; s < LEN; s += 2.4, i++) for (const side of [-1, 1]) {
    const m = mesh(bGeo, [boards[i % 4], boards[i % 4], boardSide, boardSide, boardSide, boardSide]);
    m.position.set(side * FX, 0.3, -s); scene.add(m);
  }
  // 관중석(오른쪽): 계단 + 관중(캡슐, 색 다양) — 콤보·완주 때 들썩인다
  const STAND_X = half + 5.23, rows = 4;
  for (let s = -8; s < LEN; s += 14) for (let k = 0; k < rows; k++) {
    const st = mesh(new THREE.BoxGeometry(1.1, 0.45 * (k + 1), 13.6), std(k % 2 ? '#D8D2C6' : '#E9E4DA'));
    st.position.set(STAND_X + k * 1.1, 0.225 * (k + 1), -(s + 6.8)); scene.add(st);
  }
  const crowdN = Math.floor(LEN / 0.7) * rows;
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.32, 3, 8), std('#ffffff'), crowdN);
  crowd.castShadow = true; crowd.receiveShadow = true;
  const shirt = SHIRT.map((c) => new THREE.Color(c));
  const crowdBase = [], dm = new THREE.Object3D();
  for (let i = 0, n = 0; n < crowdN; i++) for (let k = 0; k < rows && n < crowdN; k++, n++) {
    const z = -(-8 + i * 0.7 + (r() - 0.5) * 0.25), x = STAND_X + k * 1.1 + (r() - 0.5) * 0.3, y = 0.45 * (k + 1) + 0.33;
    crowdBase.push([x, y, z, r() * 6]);
    dm.position.set(x, y, z); dm.updateMatrix(); crowd.setMatrixAt(n, dm.matrix); crowd.setColorAt(n, shirt[Math.floor(r() * shirt.length)]);
  }
  scene.add(crowd);
  // 왼쪽: 나무(낮은 다각형)·언덕, 멀리 구름
  const trunk = std('#8A5A30'), leaf = [std('#3F8A4A', { flatShading: true }), std('#5FA055', { flatShading: true }), std('#2F7044', { flatShading: true })];
  for (let s = -10; s < LEN + 20; s += 4.5 + r() * 3) {
    const x = -(half + 2.93) - r() * 6, z = -s, h = 1.6 + r() * 1.4;
    const t = mesh(new THREE.CylinderGeometry(0.1, 0.14, h * 0.4, 6), trunk); t.position.set(x, h * 0.2, z); scene.add(t);
    const round = r() < 0.5;
    const c = mesh(round ? new THREE.IcosahedronGeometry(h * 0.38, 0) : new THREE.ConeGeometry(h * 0.35, h * 0.8, 7), leaf[Math.floor(r() * 3)]);
    c.position.set(x, h * (round ? 0.62 : 0.75), z); scene.add(c);
  }
  for (let i = 0; i < 9; i++) {
    const hill = mesh(new THREE.SphereGeometry(18 + r() * 14, 16, 10), std(i % 2 ? '#9BC77F' : '#8DBB72', { flatShading: true }), { cast: false });
    hill.scale.y = 0.35; hill.position.set((i % 2 ? 1 : -1) * (30 + half + r() * 25), -2, -(i * 30 + r() * 20)); scene.add(hill);
  }
  const cloudM = new THREE.MeshLambertMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.35 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 1.5, 10, 8), cloudM); b.position.set(j * 2.2 - 3, r() * 0.8, r()); g.add(b); }
    g.position.set((r() - 0.5) * 120, 22 + r() * 10, -(r() * LEN) - 20); scene.add(g); clouds.push(g);
  }
  // 깃발(코스 양옆 12m마다)
  const flagCol = ['#E8657A', '#F2D24B', '#4F8FC0', '#FFFFFF'].map((c) => std(c, { side: THREE.DoubleSide }));
  const flags = [];
  for (let s = 6, i = 0; s < LEN; s += 12, i++) for (const side of [-1, 1]) {
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), std('#7A5A3A')); pole.position.set(side * (half + 1.83), 1.1, -s); scene.add(pole);
    const fg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.6, -0.2, 0)]); fg.computeVertexNormals();
    const f = mesh(fg, flagCol[i % 4], { recv: false }); f.position.set(side * (half + 1.83), 2.15, -s); f.rotation.y = side < 0 ? 0 : Math.PI; scene.add(f); flags.push(f);
  }
  // 결승 아치 + 현수막
  const goal = new THREE.Group(); goal.position.z = -end;
  const GX = Math.max(half + 0.18, 2.3);   // 끝 장면 카메라가 아치 안쪽을 돌도록 넓게
  for (const side of [-1, 1]) { const post = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 10), std('#7A5A3A')); post.position.set(side * GX, 1.3, 0); goal.add(post); }
  const red = std('#E8657A');
  const banner = mesh(new THREE.BoxGeometry(GX * 2 + 0.2, 0.55, 0.06), [red, red, red, red,
    std('#ffffff', { map: canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#E8657A'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 64px Pretendard, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOAL!', w / 2, h / 2 + 4); }) }),
    red]);
  banner.position.set(0, 2.45, 0); goal.add(banner); scene.add(goal);

  let cheer = 0;   // 0~1 들썩임
  return {
    get cheer() { return cheer; }, set cheer(v) { cheer = clamp(v, 0, 1); },
    update(t, raw, s, floor = 0) {
      cheer = Math.max(floor, cheer - raw * 0.4);
      for (let i = 0; i < crowdBase.length; i++) {
        const [x, y, z, ph] = crowdBase[i];
        if (Math.abs(z + s) > 40) continue;
        dm.position.set(x, y + Math.max(0, Math.sin(t * 9 + ph)) * 0.18 * cheer, z); dm.rotation.z = Math.sin(t * 4 + ph) * 0.08 * cheer; dm.updateMatrix(); crowd.setMatrixAt(i, dm.matrix);
      }
      crowd.instanceMatrix.needsUpdate = true;
      flags.forEach((f, i) => { f.rotation.x = Math.sin(t * 3 + i) * 0.25; });
      clouds.forEach((c, i) => { c.position.x += raw * (0.3 + (i % 3) * 0.1); });
    },
  };
}

// ---------- 우리 아이 3D ----------
// art/3d/pets/<성향_단계>.glb(키 1·바닥 0, 동작 Run·Dash·Leap·Sit·Down·Walk…) — 없으면 null(부르는 쪽이 그림 판으로 대신)
// 크기: 아기 크기(H×1.3, 10/29에 맞춘 값)를 기준으로 단계만큼 키운다
export async function loadPet3d(scene, base, type, stage, src = null) {   // src: 시험용 다른 GLB(lab/play3d)
  const g = await loadGLB(src ?? `${base}art/3d/pets/${type}_${stage}.glb?v=202611031055`);
  if (!g) return null;
  const H = SIZE[type] ?? 0.55;
  const model = g.scene, mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) { m.roughness = 0.9; m.metalness = 0; m.transparent = true; mats.push(m); }
  });
  const k = H * 1.3 * (STAGE_K[stage] ?? 1) / STAGE_K.baby;
  const holder = new THREE.Group(); holder.add(model); model.scale.setScalar(k); scene.add(holder);
  const mixer = new THREE.AnimationMixer(model);
  const clip = (n) => THREE.AnimationClip.findByName(g.animations, n) ?? THREE.AnimationClip.findByName(g.animations, `AnimalArmature|${n}`);
  const act = Object.fromEntries(['Sit', 'Down', 'Leap', 'Dash', 'Run', 'Idle', 'Walk', 'Tug', 'Bow', 'Crouch', 'Swat'].map((n) => [n, clip(n) && mixer.clipAction(clip(n))]));
  let cur = act.Sit ?? act.Idle; cur?.play();   // 처음엔 앉아서
  const to = (a, fade = 0.2) => { if (!a || a === cur) return; a.reset().play(); cur?.crossFadeTo(a, fade, false); cur = a; };
  // 몸 휘기 뼈와 쉬는 자세 회전(q0) — 동작에 키가 없는 뼈는 믹서가 되돌려 주지 않아, 매 프레임 q0로 되돌리지 않으면 회전이 쌓인다(10/27 목 90° 사고)
  const bend = [['Torso3', 0.15], ['Neck1', 0.2], ['Head', 0.15], ['Back', -0.12], ['Tail1', -0.3]]
    .map(([n, f]) => [model.getObjectByName(n), f]).filter(([b]) => b?.isBone).map(([b, f]) => [b, f, b.quaternion.clone()]);
  const blink = makeBlinker(model);
  const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
  return {
    holder, model, mixer, act, to, mats, H, height: k, get cur() { return cur; },
    // 동작 → 눈 깜빡임 → 몸 휘기(b: 머리·목은 가는 쪽으로, 엉덩이·꼬리는 반대로)
    update(raw, b = 0) {
      for (const [bn, , q0] of bend) bn.quaternion.copy(q0);
      mixer.update(raw); blink.update(raw);
      if (b) for (const [bn, f] of bend) { bn.getWorldQuaternion(_q); _ax.set(0, 1, 0).applyQuaternion(_q.invert()); bn.rotateOnAxis(_ax, b * f); bn.updateMatrixWorld(true); }
    },
    fade(want, raw) { for (const m of mats) { m.opacity += (want - m.opacity) * Math.min(1, raw * 6); m.depthWrite = m.opacity > 0.95; } },
  };
}

// ---------- 보호자 3D ----------
// 한 판에 한 번 불러 여럿 복제(SkeletonUtils) — 옷·머리·피부색을 바꿔 서로 다른 사람처럼. 동작: Welcome(팔 벌려 기다림)·Hug(무릎 꿇고 안기)·Female_Clapping
const OWNER_LOOK = [
  { Shirt: '#E8657A', Pants: '#3B4A6B', Hair: '#2B1E16', HairBase: '#2B1E16', Skin: '#F1C9A5' },
  { Shirt: '#4F8FC0', Pants: '#2D2A26', Hair: '#4A2E1C', HairBase: '#4A2E1C', Skin: '#E9BC96' },
  { Shirt: '#F2D24B', Pants: '#5C4A3A', Hair: '#1E1A18', HairBase: '#1E1A18', Skin: '#F5D3B8' },
  { Shirt: '#6FC1B6', Pants: '#4A4F5A', Hair: '#6B4226', HairBase: '#6B4226', Skin: '#DDB08A' },
];
export async function loadOwners(scene, base, n, r) {
  const g = await loadGLB(`${base}art/3d/owner.glb?v=202611031055`);
  if (!g) return [];
  // 키: 살(SkinnedMesh)의 상자는 뼈대 배율(×100)을 안 따라 엉뚱하다 → 머리 뼈 높이로 잰다(머리 뼈 = 키의 0.89, tools/owner_hug.py 확인)
  g.scene.updateMatrixWorld(true);
  const headY = g.scene.getObjectByName('Head')?.getWorldPosition(new THREE.Vector3()).y ?? 1.45;
  const k = 1.62 / Math.max(0.01, headY / 0.89);
  const looks = shuffleR([...OWNER_LOOK], r);
  const clip = (name) => THREE.AnimationClip.findByName(g.animations, name) ?? THREE.AnimationClip.findByName(g.animations, `HumanArmature|${name}`);
  return Array.from({ length: n }, (_, i) => {
    const model = i ? skClone(g.scene) : g.scene, look = looks[i % looks.length];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (look[m.name]) m.color.set(look[m.name]); m.roughness = 0.85; m.metalness = 0; }
    });
    const holder = new THREE.Group(); holder.add(model); model.scale.setScalar(k); scene.add(holder);
    const mixer = new THREE.AnimationMixer(model);
    const act = { Welcome: clip('Welcome'), Hug: clip('Hug'), Clap: clip('Female_Clapping'), Idle: clip('Female_Idle') };
    for (const key of Object.keys(act)) act[key] = act[key] && mixer.clipAction(act[key]);
    if (act.Hug) { act.Hug.setLoop(THREE.LoopOnce, 1); act.Hug.clampWhenFinished = true; }
    let cur = act.Welcome ?? act.Idle; cur?.play(); if (cur) cur.time = r() * cur.getClip().duration;
    const to = (a, fade = 0.3) => { if (!a || a === cur) return; a.reset().play(); cur?.crossFadeTo(a, fade, false); cur = a; };
    // 작은 아이를 안을 땐 허리를 더 숙여 팔이 아이 어깨에 닿게(lean rad, 안기 동작이 감싸 안을 때부터 서서히)
    const spine = ['Abdomen', 'Torso'].map((nm) => model.getObjectByName(nm)).filter(Boolean);
    const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), mixQ = spine.map((b) => b.quaternion.clone());
    return {
      holder, model, mixer, act, to, get cur() { return cur; },
      update(raw, lean = 0) {
        // 믹서는 값이 바뀔 때만 뼈에 쓴다(PropertyMixer.apply) — 안기 동작이 끝에 멈추면 안 덮어써서 숙이기가 쌓였다(11/2, 엎드려 버림).
        // 그래서 숙이기 전 믹서 값을 기억했다가 매번 되돌린 뒤 갱신한다
        spine.forEach((b, i) => b.quaternion.copy(mixQ[i]));
        mixer.update(raw);
        spine.forEach((b, i) => mixQ[i].copy(b.quaternion));
        const w = cur === act.Hug ? clamp((act.Hug.time - 0.45) / 0.5, 0, 1) : 0;
        if (lean && w) for (const b of spine) { b.getWorldQuaternion(_q); _ax.set(1, 0, 0).applyQuaternion(_q.invert()); b.rotateOnAxis(_ax, (lean * w) / spine.length); }
      },
    };
  });
}

// ---------- 그림 판(3D가 없을 때) ----------
let BACKS = null;
const backs = (base) => (BACKS ??= fetch(`${base}art/sprite/backs.json?v=202611031055`).then((x) => (x.ok ? x.json() : {})).catch(() => ({})));
export async function backFrames(type, stage, base) {
  const have = await backs(base);
  const order = { baby: ['baby', 'teen', 'adult'], teen: ['teen', 'adult', 'baby'], adult: ['adult', 'teen', 'baby'] }[stage] ?? ['baby'];
  const st = order.find((s) => have[`${type}_${s}`]) ?? stage;
  const fr = await Promise.all([loadTex(`${base}art/sprite/${type}_${st}_back0.webp`), loadTex(`${base}art/sprite/${type}_${st}_back1.webp`)]);
  if (fr[0] && fr[1]) return fr;
  const idle = await loadTex(`${base}art/sprite/${type}_${stage}_idle.webp`);
  return [idle, idle];
}
