// 손으로 놀아 주기 3D — 터그 놀이(강아지)·낚싯대 놀이(고양이, 아래 wand3d)(11/3 사용자 "터그놀이 퀄리티가 바닥이네 · 놀아주는 것도 3d로 진짜처럼")
// 보호자가 바닥에 앉은 눈높이에서 우리 아이 3D(js/arena3d.js loadPet3d — 'Bow' 놀자 자세·'Tug' 당기기 자세, tools/rig_pet.py)와 줄을 당긴다.
// 줄은 마디 16개 물리 줄(베를레 적분) — 한쪽은 아이 입, 한쪽은 내 손가락. 느슨하면 처지고, 당기면 팽팽해지고 아이가 앞발로 미끄러진다.
// 흐름: 놀자 자세(꼬리 흔들기) → 줄 끝을 잡으면 당기기 → 아이가 머리를 흔들며 '훅' 당길 때 적당히 버티면 게이지 →
//       흥분 신호 '✋'에 손을 놓으면 줄을 놓고 앉아 차분해졌다가 다시 놀자(RSPCA·Blue Cross 놀이 안내) → 끝은 아이가 이겨 줄을 물고 으쓱 걸어간다.
// 결과 { ok, rough } — rough = 너무 세게 당기거나 흥분 신호를 무시한 횟수(app.js playAfter)
import * as THREE from 'three';
import { sfx } from './sound.js?v=202611031138';
import { haptic } from './native.js?v=202611031138';
import { loadPet3d, loadGLB, clamp } from './arena3d.js?v=202611031138';

const N = 16;              // 줄 마디 수
const ROPE = 0.8;          // 줄 길이(m)
const HAND_Z = 0.75;       // 손 판: 아이에서 카메라 쪽으로 이만큼
const FACE = -0.3;         // 아이가 보는 방향(라디안) — 카메라에서 비켜 서서 옆모습이 보이게(뒤로 버티는 자세)

export function tug3d({ type, stage, base = '', src = null } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('game') ?? document.body;
    const el = document.createElement('div');
    el.className = 'hc hc-play3d';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '터그 놀이');
    el.innerHTML = `<div class="hc-top"><b>터그 놀이</b><span class="hc-say" id="hc-say">불러오는 중…</span>
        <i class="hc-bar" aria-hidden="true"><i id="hc-fill"></i></i><button class="hc-x" type="button">그만두기</button></div>
      <div class="p3-stage" id="p3-stage" style="--room:url('${new URL(`${base}art/room/room_wide.webp`, location.href).href}')"><canvas></canvas><i class="p3-hand" id="p3-hand" hidden></i></div>`;
    root.appendChild(el);
    document.body.classList.add('handcare');   // 여는 동안 앱의 1분 다시 그리기를 멈춘다
    setTimeout(() => el.classList.add('on'), 20);   // rAF는 창이 가려지면 멈춰 반투명으로 남았다
    const stageEl = el.querySelector('#p3-stage'), cv = stageEl.querySelector('canvas'), handEl = el.querySelector('#p3-hand');
    const sayEl = el.querySelector('#hc-say'), fill = el.querySelector('#hc-fill');
    const say = (t) => { sayEl.textContent = t; };
    const prog = (p) => { fill.style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`; };

    // ---------- 무대: 방 그림(배경) 위에 투명 3D, 바닥엔 그림자만 ----------
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
    camera.position.set(0.95, 0.62, 2.0); camera.lookAt(0, 0.28, 0);   // 바닥에 앉은 보호자 눈높이, 비스듬히(3/4) — 정면이면 뒤로 버티는 자세가 안 보였다
    scene.add(new THREE.HemisphereLight('#FFF6E8', '#B08A5A', 1.25));
    const sun = new THREE.DirectionalLight('#FFF1DC', 1.9);
    sun.position.set(-1.2, 2.4, 1.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 6 }); sun.shadow.bias = -0.0008;
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    // 장난감: Blender로 만든 터그 로프 매듭 두 개(art/3d/toy_tug.glb — tools/make_tug_toy.py, 세 가닥 꼰 매듭 + 풀린 술)
    // 줄 몸통은 같은 세 가닥(빨강·크림·파랑)을 물리 줄 둘레에 나선으로 감아 매 프레임 만든다. 매듭은 줄기가 +Y(블렌더 +Z)
    const STRAND = ['#C72924', '#F2E8D1', '#285C9E'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    const strands = [null, null, null];
    const knotM = new THREE.Group(), knotH = new THREE.Group();
    scene.add(knotM, knotH);
    loadGLB(`${base}art/3d/toy_tug.glb?v=202611031138`).then((g) => {
      if (!g || done) return;
      for (const [nm, grp] of [['KnotMouth', knotM], ['KnotHand', knotH]]) {
        const o = g.scene.getObjectByName(nm);
        if (!o) continue;
        o.position.set(0, 0, 0); o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material.roughness = 0.95; } });
        grp.add(o);
      }
    });
    const P = Array.from({ length: N + 1 }, (_, i) => new THREE.Vector3(0.05 + i * 0.03, 0.01, 0.15 + i * 0.03));
    const Q = P.map((p) => p.clone());
    const seg = ROPE / N;

    let dog = null, anchor = null, mouthBone = null, done = false, raf = 0, last = performance.now();
    let state = 'load', held = false, mouthOn = true, p = 0, rough = 0, yank = 0, nextYank = 900, shake = 1, hardOnce = false;
    let wait = null, waits = [0.4, 0.75], calmT = 0, zd = -0.1, winT = 0;
    const hand = new THREE.Vector3(0.12, 0.02, 0.45);
    const mouth = new THREE.Vector3(), side = new THREE.Vector3(), lipFar = new THREE.Vector3(), knotPos = new THREE.Vector3();
    const neckQ = [], headBones = [];
    const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3();
    el.__p3 = () => ({ mouth, P, hand, dog, anchor, state, p, zd, camera });   // 시험용

    // 세로 화면이면 카메라를 뒤로 물린다(좁은 화면에 아이가 가득 차 너무 가까워 보였다, 11/3)
    const camBase = camera.position.clone(), camLook = new THREE.Vector3(0, 0.25, 0);
    const size = () => { const w = stageEl.clientWidth, h = stageEl.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.copy(camLook).addScaledVector(camBase.clone().sub(camLook), camera.aspect < 1 ? 1 / Math.sqrt(camera.aspect) : 1); camera.updateProjectionMatrix(); };
    addEventListener('resize', size); size();

    loadPet3d(scene, base, type, stage, src).then((d) => {
      if (done) return;
      if (!d || !d.act.Tug) { say('이 아이는 아직 3D 놀이 준비 중이에요'); setTimeout(() => finish(false), 1400); return; }
      dog = d;
      dog.holder.position.set(0, 0, zd);
      // 입 자리: 쉬는 자세에서 머리 쪽 가장 앞(코끝) 살 → 조금 아래·뒤, 머리 뼈에 붙여 둔다(머리가 움직이면 같이)
      dog.model.updateMatrixWorld(true);
      const sk = []; dog.model.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); });
      let top = 0, best = -1e9;
      for (const m of sk) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2) { _v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, _v); _v.applyMatrix4(m.matrixWorld); if (_v.y > top) top = _v.y; } }
      for (const m of sk) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2) { _v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, _v); _v.applyMatrix4(m.matrixWorld); if (_v.y > top * 0.55 && _v.z - Math.abs(_v.x) * 2 > best) { best = _v.z - Math.abs(_v.x) * 2; anchor = { m, i, drop: top * 0.03 }; } } }   // 가운데에 가까운 가장 앞 살 = 코끝
      mouthBone = dog.model.getObjectByName('Mouth');   // tools/rig_pet.py가 넣은 '무는 자리' 뼈
      for (const n of ['Neck1', 'Head']) { const b = dog.model.getObjectByName(n); if (b) { headBones.push(b); neckQ.push(b.quaternion.clone()); } }
      dog.to(dog.act.Bow ?? dog.act.Sit, 0.01);
      state = 'invite';
      say('같이 놀자고 엎드렸어요 — 바닥의 줄 끝을 잡아 보세요');
    });

    // ---------- 손가락 ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const camDir = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    const handPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, camDir.clone().multiplyScalar(HAND_Z));
    const toHand = (e) => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const out = new THREE.Vector3();
      if (!ray.ray.intersectPlane(handPlane, out)) return null;
      out.y = Math.max(0.03, out.y); out.x = clamp(out.x, -0.4, 1.0);
      return out;
    };
    const screenOf = (v) => { const r = cv.getBoundingClientRect(); const s = v.clone().project(camera); return [(s.x + 1) / 2 * r.width + r.left, (1 - s.y) / 2 * r.height + r.top]; };
    const showHand = (e) => { const r = stageEl.getBoundingClientRect(); handEl.hidden = false; handEl.style.left = `${e.clientX - r.left}px`; handEl.style.top = `${e.clientY - r.top}px`; };
    const down = (e) => {
      if (!dog || state === 'win' || state === 'calm') return;
      const [kx, ky] = screenOf(P[N]);
      if (Math.hypot(e.clientX - kx, e.clientY - ky) > Math.max(56, stageEl.clientHeight * 0.1)) { say('줄 끝(빨간 매듭)을 잡아요'); return; }
      const h = toHand(e); if (!h) return;
      held = true; hand.copy(h); showHand(e); handEl.classList.add('hold');
      stageEl.setPointerCapture?.(e.pointerId);
      if (state === 'invite') { state = 'tug'; mouthOn = true; dog.to(dog.act.Tug, 0.35); say('아이가 줄을 물었어요 — 당겨 올 때 버텨 봐요'); sfx.pop?.(); }
    };
    const move = (e) => { showHand(e); if (!held) return; const h = toHand(e); if (h) hand.copy(h); };
    const up = () => { held = false; handEl.classList.remove('hold'); };
    stageEl.addEventListener('pointerdown', down); stageEl.addEventListener('pointermove', move);
    stageEl.addEventListener('pointerup', up); stageEl.addEventListener('pointercancel', up);
    stageEl.addEventListener('pointerleave', () => { if (!held) handEl.hidden = true; });

    // ---------- 줄 물리 ----------
    const stepRope = (dt) => {
      const g = -9.8 * dt * dt;
      for (let i = 0; i <= N; i++) {
        if ((i === 0 && mouthOn) || (i === N && held)) continue;
        const p_ = P[i], q = Q[i];
        const vx = (p_.x - q.x) * 0.985, vy = (p_.y - q.y) * 0.985, vz = (p_.z - q.z) * 0.985;
        q.copy(p_); p_.x += vx; p_.y += vy + g; p_.z += vz;
        if (p_.y < 0.012) { p_.y = 0.012; p_.x -= vx * 0.4; p_.z -= vz * 0.4; }   // 바닥 마찰
      }
      if (mouthOn) { P[0].copy(mouth); Q[0].copy(mouth); }
      if (held) { P[N].copy(hand); Q[N].copy(hand); }
      for (let it = 0; it < 14; it++) {
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          _v.subVectors(b, a); const d = _v.length() || 1e-6, diff = (d - seg) / d;
          const pinA = i === 0 && mouthOn, pinB = i + 1 === N && held;
          const fa = pinA ? 0 : pinB ? 1 : 0.5, fb = pinB ? 0 : pinA ? 1 : 0.5;
          a.addScaledVector(_v, diff * fa); b.addScaledVector(_v, -diff * fb);
        }
      }
    };
    // 세 가닥 꼬임: 가운데 선(물리 줄)을 따라 법선을 이어 가며(평행 이동) 가닥마다 120°씩 어긋난 나선을 감는다
    const M = 64, TWIST = 95, RS = 0.0085, RT = 0.0062;
    const _t = new THREE.Vector3(), _n = new THREE.Vector3(0, 1, 0), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _o = new THREE.Vector3();
    const drawRope = () => {
      const curve = new THREE.CatmullRomCurve3(P), len = curve.getLength();
      const lines = [[], [], []];
      _n.set(0, 1, 0);
      for (let j = 0; j <= M; j++) {
        const u = j / M;
        curve.getPointAt(u, _c); curve.getTangentAt(u, _t);
        _n.addScaledVector(_t, -_n.dot(_t)); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x); _n.normalize();
        _b.crossVectors(_t, _n);
        for (let k = 0; k < 3; k++) {
          const th = u * len * TWIST + k * 2.094;
          lines[k].push(_o.copy(_c).addScaledVector(_n, Math.cos(th) * RS).addScaledVector(_b, Math.sin(th) * RS).clone());
        }
      }
      for (let k = 0; k < 3; k++) {
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lines[k]), M * 2, RT, 5, false);
        if (!strands[k]) { strands[k] = new THREE.Mesh(geo, STRAND[k]); strands[k].castShadow = true; scene.add(strands[k]); } else { strands[k].geometry.dispose(); strands[k].geometry = geo; }
      }
      // 매듭: 입 쪽은 반대쪽 입꼬리 밖(없으면 줄 첫 점), 손 쪽은 줄 끝 — 둘 다 줄기(+Y)가 줄 쪽을 보게
      const aim = (grp, at, toward) => { grp.position.copy(at); _o.subVectors(toward, at).normalize(); grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _o); };   // 블렌더 +Z(줄기) = glTF +Y
      if (mouthOn && dog) aim(knotM, knotPos, mouth); else aim(knotM, _o.copy(P[0]).addScaledVector(_t.subVectors(P[0], P[1]).normalize(), 0.035), P[0]);
      aim(knotH, _c.copy(P[N]).addScaledVector(_t.subVectors(P[N], P[N - 1]).normalize(), 0.03), P[N]);
    };

    // ---------- 매 프레임 ----------
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      if (dog) {
        // 동작 → 저장해 둔 목·머리 값으로 되돌리고 믹서 → 그 값을 저장 → 머리 흔들기·손 쪽 보기를 더한다(믹서는 값이 바뀔 때만 써서, 안 되돌리면 쌓인다)
        headBones.forEach((b, i) => b.quaternion.copy(neckQ[i]));
        dog.mixer.update(dt);
        headBones.forEach((b, i) => neckQ[i].copy(b.quaternion));
        const strain = held && mouthOn ? hand.distanceTo(mouth) - ROPE : -1;
        if (state === 'tug') {
          nextYank -= dt * 1000;
          if (nextYank <= 0 && !wait) { yank = 1; nextYank = 650 + Math.random() * 750; shake = Math.random() < 0.5 ? -1 : 1; if (held) haptic('light'); sfx.tap?.(); }
          yank = Math.max(0, yank - dt * 2.2);
          // 아이 자리: 내가 세게 당기면 앞발이 미끄러지며 끌려오고, 느슨하면 뒤로 버티며 물러난다
          if (strain > 0.03) zd += Math.min(strain, 0.2) * dt * 1.2; else zd -= 0.06 * dt;
          zd = clamp(zd, -0.28, 0.1);
          if (!wait && held && yank > 0.45) {
            if (strain > 0.2) { if (!hardOnce) { hardOnce = true; rough++; say('너무 세게 당기면 이빨·목이 다칠 수 있어요 — 살살'); } }
            else if (strain > 0.0) { p += dt * 0.16; hardOnce = false; if (Math.random() < 0.03) say(['좋아요, 버텨요!', '으르릉 — 신났어요', '당겼다 풀었다!'][Math.floor(Math.random() * 3)]); }
          }
          if (!wait && waits.length && p >= waits[0]) { waits.shift(); wait = { t: 0 }; el.classList.add('hc-wait'); say('✋ 너무 흥분했어요 — 손을 놓고 잠깐 멈춰요'); }
          if (wait) {
            wait.t += dt;
            if (!held && wait.t > 0.25) { wait = null; el.classList.remove('hc-wait'); p += 0.06; state = 'calm'; calmT = 0; mouthOn = false; dog.to(dog.act.Sit, 0.4); say('줄을 놓고 앉았어요 — 차분해지면 다시 놀자고 해요'); sfx.ding?.(); }
            else if (wait.t > 1.9) { wait = null; el.classList.remove('hc-wait'); rough++; say('흥분했을 땐 잠깐 멈췄다 다시 하는 게 좋아요'); }
          }
          if (p >= 1) { state = 'win'; winT = 0; held = false; handEl.classList.remove('hold'); el.classList.remove('hc-wait'); dog.to(dog.act.Walk ?? dog.act.Sit, 0.3); say('이번엔 이기게 해 줬어요 — 줄을 물고 으쓱!'); sfx.fanfare?.(); }
        } else if (state === 'calm') {
          calmT += dt; zd += (-0.1 - zd) * dt * 2;
          if (calmT > 2.2) { state = 'invite'; dog.to(dog.act.Bow ?? dog.act.Sit, 0.4); say('다시 놀자고 해요 — 줄 끝을 잡아요'); }
        } else if (state === 'win') {
          winT += dt;
          const a = Math.min(1, winT / 1.2);
          dog.holder.rotation.y = FACE - a * 1.9;   // 옆으로 돌아 걸어간다
          zd -= dt * 0.25 * (winT < 2.2 ? 1 : 0); dog.holder.position.x -= dt * 0.22 * (winT < 2.2 ? 1 : 0);
          if (winT > 2.2) dog.to(dog.act.Sit, 0.4);
          if (winT > 3.4 && !done) { prog(1); el.classList.add('hc-done'); setTimeout(() => finish(true), 600); winT = -99; }
        }
        if (state !== 'win') { dog.holder.position.set(Math.sin(FACE) * zd, 0, Math.cos(FACE) * zd); dog.holder.rotation.y = FACE; }
        dog.holder.rotation.x = state === 'tug' ? -0.05 * yank : 0;
        // 머리: 당길 때 좌우로 흔들고, 평소엔 손(줄 끝) 쪽을 본다
        const look = clamp((Math.atan2(P[N].x - dog.holder.position.x, P[N].z - dog.holder.position.z) - dog.holder.rotation.y) * 0.5, -0.5, 0.5);
        const yawAdd = (state === 'tug' ? shake * Math.sin(yank * Math.PI * 3) * 0.32 * yank : 0) + (state === 'win' ? 0 : look);
        headBones.forEach((b, i) => { b.getWorldQuaternion(_q); _ax.set(0, 1, 0).applyQuaternion(_q.invert()); b.rotateOnAxis(_ax, yawAdd * (i ? 0.8 : 0.15)); });   // 머리 위주 — 목뿌리를 많이 돌리면 어깨·가슴 살이 비틀렸다
        dog.model.updateMatrixWorld(true);
        if (mouthBone) { mouthBone.getWorldPosition(mouth); mouthBone.getWorldQuaternion(_q); _ax.set(0, 1, 0).applyQuaternion(_q); side.set(_ax.z, 0, -_ax.x).normalize(); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); }
        else { mouth.fromBufferAttribute(anchor.m.geometry.attributes.position, anchor.i); anchor.m.applyBoneTransform(anchor.i, mouth); mouth.applyMatrix4(anchor.m.matrixWorld); mouth.y -= anchor.drop; side.set(Math.cos(dog.holder.rotation.y), 0, -Math.sin(dog.holder.rotation.y)); }
        // 줄은 입을 가로질러 문다(실제 터그처럼): 손 쪽 입꼬리에서 줄이 나가고, 반대쪽 입꼬리 밖에 매듭
        const w = dog.height * 0.035, sgn = _v.subVectors(P[N], mouth).dot(side) >= 0 ? 1 : -1;
        lipFar.copy(mouth).addScaledVector(side, -w * sgn);
        mouth.addScaledVector(side, w * sgn);
        knotPos.copy(lipFar).addScaledVector(side, -0.03 * sgn); knotPos.y -= 0.006;
        prog(p);
      }
      stepRope(dt);
      drawRope();
      renderer.render(scene, camera);
      if (!done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const finish = (ok) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      renderer.dispose(); renderer.forceContextLoss();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      document.body.classList.remove('handcare');
      el.classList.remove('on');
      setTimeout(() => el.remove(), 250);
      resolve({ ok, rough });
    };
    el.querySelector('.hc-x').addEventListener('click', () => finish(false));
  });
}

// ---------- 낚싯대 놀이 3D(고양이, 11/3 2단계) ----------
// 손가락으로 낚싯대 끝을 움직이면 낚싯줄(물리) 끝의 깃털(art/3d/toy_wand.glb — tools/make_wand_toy.py)이 흔들린다.
// 아이(우리 고양이 3D): 앉아서 눈으로 쫓다가(머리 돌리기) 깃털이 바닥 가까이 오면 낮게 웅크려('Crouch') 다가가고, 깃털이 앞에서 멈추면
// 엉덩이를 씰룩이다 덮친다('Pounce') — 깃털이 그대로 있으면 잡는다. 깃털이 얼굴 높이에 가까이 오면 앞발로 탁('Swat'), 멀리 가면 뛰어서 쫓는다('Run').
// 먹잇감처럼 '움직였다 멈췄다'가 좋고, 계속 빠르게만 흔들면 흥미를 잃는다. 마지막엔 꼭 잡게 해 준다(iCatCare 놀이 안내). 결과 { ok, rough: 0 }
const WN = 10;          // 낚싯줄 마디
const PITCH = false;    // 고개 위아래 꺾기 — 고양이 얼굴 살이 앞으로 늘어나 '얼굴이 길쭉'해 보여 끈다(11/3 사용자). 좌우만 머리 위주로 조금
const LINE = 0.42;      // 낚싯줄 길이(m)
export function wand3d({ type, stage, base = '', src = null } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('game') ?? document.body;
    const el = document.createElement('div');
    el.className = 'hc hc-play3d';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '낚싯대 놀이');
    el.innerHTML = `<div class="hc-top"><b>낚싯대 놀이</b><span class="hc-say" id="hc-say">불러오는 중…</span>
        <i class="hc-bar" aria-hidden="true"><i id="hc-fill"></i></i><button class="hc-x" type="button">그만두기</button></div>
      <div class="p3-stage" id="p3-stage" style="--room:url('${new URL(`${base}art/room/room_wide.webp`, location.href).href}')"><canvas></canvas><i class="p3-hand" id="p3-hand" hidden></i></div>`;
    root.appendChild(el);
    document.body.classList.add('handcare');
    setTimeout(() => el.classList.add('on'), 20);
    const stageEl = el.querySelector('#p3-stage'), cv = stageEl.querySelector('canvas'), handEl = el.querySelector('#p3-hand');
    const sayEl = el.querySelector('#hc-say'), fill = el.querySelector('#hc-fill');
    const say = (t) => { if (sayEl.textContent !== t) sayEl.textContent = t; };
    const prog = (p) => { fill.style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`; };

    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
    camera.position.set(0.75, 0.55, 2.0); camera.lookAt(0, 0.2, 0);   // 바닥에 앉은 눈높이, 비스듬히
    scene.add(new THREE.HemisphereLight('#FFF6E8', '#B08A5A', 1.25));
    const sun = new THREE.DirectionalLight('#FFF1DC', 1.9);
    sun.position.set(-1.2, 2.4, 1.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 6 }); sun.shadow.bias = -0.0008;
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    // 깃털 + 낚싯줄
    const feather = new THREE.Group(); scene.add(feather);
    loadGLB(`${base}art/3d/toy_wand.glb?v=202611031138`).then((g) => {
      if (!g || done) return;
      const o = g.scene.getObjectByName('Feather') ?? g.scene;
      o.position.set(0, 0, 0); o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material.side = THREE.DoubleSide; } });
      feather.add(o);
    });
    const lineM = new THREE.MeshStandardMaterial({ color: '#3B3530', roughness: 0.6 });
    let lineMesh = null;
    const tip = new THREE.Vector3(0.35, 0.75, 0.45);
    const W = Array.from({ length: WN + 1 }, (_, i) => new THREE.Vector3(tip.x, tip.y - (LINE * i) / WN, tip.z));
    const WQ = W.map((v) => v.clone());
    const wseg = LINE / WN;

    let cat = null, mouthBone = null, done = false, raf = 0, last = performance.now(), t = 0;
    let state = 'load', p = 0, stT = 0, still = 0, fastT = 0, wiggle = 0, pounceFrom = null, pounceTo = null, caughtT = 0, swatHit = false, heading = 0, held = false, finale = false;
    const cpos = new THREE.Vector3(0, 0, -0.1), fprev = new THREE.Vector3(), fvel = new THREE.Vector3(), mouth = new THREE.Vector3();
    const headBones = [], headQ = [];
    let backBone = null, backQ = null;
    const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
    el.__p3 = () => ({ state, p, tip, W, cpos, camera, cat });   // 시험용

    // 세로 화면이면 카메라를 뒤로 물린다(좁은 화면에 아이가 가득 차 너무 가까워 보였다, 11/3)
    const camBase = camera.position.clone(), camLook = new THREE.Vector3(0, 0.25, 0);
    const size = () => { const w = stageEl.clientWidth, h = stageEl.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.copy(camLook).addScaledVector(camBase.clone().sub(camLook), camera.aspect < 1 ? 1 / Math.sqrt(camera.aspect) : 1); camera.updateProjectionMatrix(); };
    addEventListener('resize', size); size();

    loadPet3d(scene, base, type, stage, src).then((d) => {
      if (done) return;
      if (!d || !d.act.Crouch) { say('이 아이는 아직 3D 놀이 준비 중이에요'); setTimeout(() => finish(false), 1400); return; }
      cat = d;
      mouthBone = cat.model.getObjectByName('Mouth');
      for (const n of ['Neck1', 'Head']) { const b = cat.model.getObjectByName(n); if (b) { headBones.push(b); headQ.push(b.quaternion.clone()); } }
      backBone = cat.model.getObjectByName('Back'); backQ = backBone?.quaternion.clone();
      if (cat.act.Swat) { cat.act.Swat.setLoop(THREE.LoopOnce, 1); cat.act.Swat.clampWhenFinished = true; }
      // 덮치기: 고양이용 'Pounce'(낮게 앞으로 — 허들 넘는 'Leap'은 착지 때 세로로 길게 늘어나 보였다, 11/3)
      cat.pounce = cat.act.Pounce ?? cat.act.Leap;
      if (cat.pounce) { cat.pounce.setLoop(THREE.LoopOnce, 1); cat.pounce.clampWhenFinished = true; }
      heading = Math.atan2(camera.position.x, camera.position.z) * 0.4;
      state = 'watch'; cat.to(cat.act.Sit, 0.01);
      say('손가락을 움직여 깃털을 흔들어 보세요 — 바닥 가까이, 움직였다 멈췄다');
    });

    // 손가락 → 낚싯대 끝: 카메라를 향한 세로 판에 닿은 자리 + 줄 길이만큼 위(깃털이 손가락 근처에 오게)
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const camDir = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, camDir.clone().multiplyScalar(0.25));
    const toTip = (e) => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const out = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, out)) return;
      out.x = clamp(out.x, -1.0, 1.0); out.y = clamp(out.y + LINE * 0.92, LINE * 0.95, 1.3);
      tip.copy(out);
    };
    const showHand = (e) => { const r = stageEl.getBoundingClientRect(); handEl.hidden = false; handEl.style.left = `${e.clientX - r.left}px`; handEl.style.top = `${e.clientY - r.top}px`; };
    stageEl.addEventListener('pointerdown', (e) => { held = true; stageEl.setPointerCapture?.(e.pointerId); showHand(e); toTip(e); });
    stageEl.addEventListener('pointermove', (e) => { showHand(e); if (held || e.pointerType === 'mouse') toTip(e); });
    const up = () => { held = false; };
    stageEl.addEventListener('pointerup', up); stageEl.addEventListener('pointercancel', up);

    // 낚싯줄 물리: 위 끝은 낚싯대 끝(고정), 아래 끝은 깃털(잡혔으면 아이 입에 고정)
    const stepLine = (dt) => {
      const g = -9.8 * dt * dt;
      for (let i = 1; i <= WN; i++) {
        if (i === WN && state === 'caught') continue;
        const a = W[i], b = WQ[i];
        const vx = (a.x - b.x) * 0.97, vy = (a.y - b.y) * 0.97, vz = (a.z - b.z) * 0.97;
        b.copy(a); a.x += vx; a.y += vy + g; a.z += vz;
        if (a.y < 0.015) { a.y = 0.015; a.x -= vx * 0.5; a.z -= vz * 0.5; }
      }
      W[0].copy(tip); WQ[0].copy(tip);
      if (state === 'caught') { W[WN].copy(mouth); WQ[WN].copy(mouth); }
      for (let it = 0; it < 10; it++) {
        for (let i = 0; i < WN; i++) {
          const a = W[i], b = W[i + 1];
          _v.subVectors(b, a); const d = _v.length() || 1e-6, diff = (d - wseg) / d;
          const pinB = i + 1 === WN && state === 'caught';
          const fa = i === 0 ? 0 : pinB ? 1 : 0.5, fb = pinB ? 0 : i === 0 ? 1 : 0.5;
          a.addScaledVector(_v, diff * fa); b.addScaledVector(_v, -diff * fb);
        }
      }
    };
    const drawLine = () => {
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(W), 40, 0.0022, 4, false);
      if (!lineMesh) { lineMesh = new THREE.Mesh(geo, lineM); scene.add(lineMesh); } else { lineMesh.geometry.dispose(); lineMesh.geometry = geo; }
      feather.position.copy(W[WN]);
      _v.subVectors(W[WN], W[WN - 1]).normalize();
      feather.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v);   // 깃털은 줄 끝에서 줄이 오는 반대쪽으로 늘어진다(블렌더 −Z = glTF −Y)
    };

    const go = (s, a, fade = 0.25) => { state = s; stT = 0; if (a) cat.to(a, fade); };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now; t += dt;
      stepLine(dt);
      const F = W[WN];
      fvel.subVectors(F, fprev).divideScalar(Math.max(dt, 1e-3)); fprev.copy(F);
      const fsp = Math.hypot(fvel.x, fvel.z) + Math.abs(fvel.y) * 0.5;
      still = fsp < 0.12 ? still + dt : 0;
      fastT = fsp > 2.2 ? fastT + dt : Math.max(0, fastT - dt * 2);
      if (cat) {
        stT += dt;
        // 고개: 동작 값으로 되돌리고 믹서 → 저장 → 깃털 쪽으로 돌리기(믹서는 값이 바뀔 때만 써서, 안 되돌리면 쌓인다)
        headBones.forEach((b, i) => b.quaternion.copy(headQ[i])); if (backBone) backBone.quaternion.copy(backQ);
        cat.mixer.update(dt);
        headBones.forEach((b, i) => headQ[i].copy(b.quaternion)); if (backBone) backQ.copy(backBone.quaternion);
        if (mouthBone) mouthBone.getWorldPosition(mouth); else mouth.copy(cpos).add(_v.set(Math.sin(heading) * 0.15, 0.2, Math.cos(heading) * 0.15));
        _d.set(F.x - cpos.x, 0, F.z - cpos.z);
        const dist = Math.max(0, _d.length() - 0.12), want = Math.atan2(_d.x, _d.z);
        const turn = (k) => { let a = want - heading; a = Math.atan2(Math.sin(a), Math.cos(a)); heading += a * Math.min(1, dt * k); };
        if (fastT > 2 && !['bored', 'pounce', 'caught', 'win'].includes(state)) { go('bored', cat.act.Sit, 0.4); say('너무 빨리 흔들기만 하면 흥미를 잃어요 — 숨었다 멈췄다, 먹잇감처럼'); }
        switch (state) {
          case 'watch':   // 앉아서 눈으로 쫓는다
            turn(1.5);
            if (F.y < 0.3 && dist < 1.0 && fsp > 0.05) go('stalk', cat.act.Crouch, 0.3);
            else if (F.y < 0.55 && dist < 0.28 && cat.act.Swat) { go('swat', cat.act.Swat, 0.12); swatHit = false; }
            break;
          case 'stalk':   // 낮게 웅크려 다가간다 → 앞에서 멈추면 씰룩 → 덮치기
            turn(2.2);
            if (dist > 1.1) { go('chase', cat.act.Run, 0.2); break; }
            if (F.y > 0.45) { go('watch', cat.act.Sit, 0.35); break; }
            if (dist > 0.38) { cpos.x += Math.sin(heading) * 0.14 * dt; cpos.z += Math.cos(heading) * 0.14 * dt; wiggle = 0; }
            if (dist < 0.5 && still > 0.25) { wiggle += dt; say('엉덩이를 씰룩씰룩…'); } else wiggle = Math.max(0, wiggle - dt);
            // 덮치기: 입이 깃털 자리에 닿게 착지할 곳을 정한다
            if (wiggle > 0.7 && cat.pounce) { pounceFrom = cpos.clone(); const md = Math.hypot(mouth.x - cpos.x, mouth.z - cpos.z); pounceTo = new THREE.Vector3(F.x - Math.sin(heading) * md, 0, F.z - Math.cos(heading) * md); go('pounce', cat.pounce, 0.08); cat.pounce.timeScale = cat.pounce.getClip().duration / 0.55; sfx.pop?.(); }
            break;
          case 'chase':   // 뛰어서 쫓는다
            turn(4); cpos.x += Math.sin(heading) * 0.9 * dt; cpos.z += Math.cos(heading) * 0.9 * dt;
            if (dist < 0.55) go('stalk', cat.act.Crouch, 0.25);
            break;
          case 'pounce': {   // 덮치기: 0.55초 동안 깃털 자리로(포물선은 동작이 맡는다)
            const k = Math.min(1, stT / 0.55), e = k * k * (3 - 2 * k);
            cpos.lerpVectors(pounceFrom, pounceTo, e);
            if (k >= 1) {
              const got = Math.hypot(F.x - mouth.x, F.z - mouth.z) < 0.2 && F.y < 0.25;
              if (got || finale) { go('caught', cat.act.Crouch, 0.15); caughtT = 0; p += 0.15; say(p >= 1 ? '잡았다! 마지막엔 꼭 잡게 해 주세요 — 사냥 성공!' : '잡았다! 🐾'); sfx.ding?.(); haptic('light'); }
              else { p += 0.06; go('stalk', cat.act.Crouch, 0.2); say('앗, 놓쳤어요 — 그래도 신났어요'); }
            }
            break;
          }
          case 'caught':   // 잡은 깃털을 잠깐 물고 있다가 놓는다
            caughtT += dt;
            if (caughtT > 1.1) {
              if (p >= 1) { go('win', cat.act.Sit, 0.4); break; }
              WQ[WN].copy(W[WN]).add(_v.set(0, 0.02, 0)); go('watch', cat.act.Sit, 0.35);
            }
            break;
          case 'swat':   // 앞발로 탁
            turn(3);
            if (!swatHit && stT > 0.32 && stT < 0.5 && Math.hypot(F.x - mouth.x, F.z - mouth.z) < 0.22 && F.y < 0.55) {
              swatHit = true; p += 0.07; say('탁! 🐾'); sfx.tap?.(); haptic('light');
              WQ[WN].copy(W[WN]).add(_v.set(Math.sin(heading) * -0.03, -0.01, Math.cos(heading) * -0.03));   // 깃털이 튕겨 나간다
            }
            if (stT > 0.85) go('watch', cat.act.Sit, 0.3);
            break;
          case 'bored':
            heading += dt * 0.3;
            if (stT > 1.8) { fastT = 0; go('watch', cat.act.Sit, 0.4); say('다시 천천히 — 바닥 가까이 움직였다 멈춰 보세요'); }
            break;
          case 'win':
            if (stT > 1.4 && !done) { prog(1); el.classList.add('hc-done'); setTimeout(() => finish(true), 600); state = 'end'; }
            break;
        }
        if (p >= 0.9) finale = true;   // 마지막 덮치기는 꼭 잡게
        cpos.x = clamp(cpos.x, -0.9, 0.9); cpos.z = clamp(cpos.z, -0.8, 0.2);   // 카메라 바로 앞까지 오면 너무 커 보였다
        cat.holder.position.copy(cpos); cat.holder.rotation.y = heading;
        // 고개를 깃털 쪽으로(좌우·위아래) · 웅크린 채 멈춰 있으면 엉덩이 씰룩
        _v.set(F.x - mouth.x, F.y - mouth.y, F.z - mouth.z);
        // 머리 위주로 돌린다(목뿌리 Neck1은 어깨·가슴 살까지 끌어 몸이 비틀렸다 — 11/3 사용자 "왜 이렇게 고양이가 일그러지지?"). 넘치는 각은 몸통이 돈다(turn)
        let yaw = Math.atan2(_v.x, _v.z) - heading; yaw = clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -0.6, 0.6);
        const pitch = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.4, 0.4);
        headBones.forEach((b, i) => {
          b.getWorldQuaternion(_q); const inv = _q.clone().invert();
          _ax.set(0, 1, 0).applyQuaternion(inv); b.rotateOnAxis(_ax, yaw * (i ? 0.6 : 0.1));
          b.getWorldQuaternion(_q); _ax.set(Math.cos(heading + yaw), 0, -Math.sin(heading + yaw)).applyQuaternion(_q.clone().invert()); if (PITCH) b.rotateOnAxis(_ax, -pitch * (i ? 0.7 : 0));
        });
        if (backBone && wiggle > 0) { backBone.getWorldQuaternion(_q); _ax.set(0, 1, 0).applyQuaternion(_q.invert()); backBone.rotateOnAxis(_ax, Math.sin(t * 9) * 0.06 * Math.min(1, wiggle * 3)); }
        cat.model.updateMatrixWorld(true);
        prog(p);
      }
      drawLine();
      renderer.render(scene, camera);
      if (!done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const finish = (ok) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      renderer.dispose(); renderer.forceContextLoss();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      document.body.classList.remove('handcare');
      el.classList.remove('on');
      setTimeout(() => el.remove(), 250);
      resolve({ ok, rough: 0 });
    };
    el.querySelector('.hc-x').addEventListener('click', () => finish(false));
  });
}
