// 반려 경주 3D(11/2 사용자 "반려 경주도 아직 2d야 · 골인지점 주인도 3d로 만들어서 마지막에 반려견을 안아주는 모습")
// 규칙·조작·점수는 js/race.js raceGame과 같다: 발판 두 개를 번갈아 누르면 한 걸음(같은 발판 두 번 → 발 꼬임), 리듬이 쌓이면 스퍼트,
// 다른 성향 봇 3마리와 100m. 그리는 것만 three.js 3D — 4레인 경기장(js/arena3d.js) + 우리 아이 3D 4마리 + 레인마다 보호자 3D.
// 골인하면 내 보호자는 무릎 꿇고 안아 주고(Hug), 다른 보호자는 자기 아이가 들어오면 박수(Clapping)
import * as THREE from 'three';
import { sfx } from './sound.js?v=202611031016';
import { rng } from './engine.js?v=202611031016';
import { haptic } from './native.js?v=202611031016';
import { SIZE, clamp, shuffleR, nameTex, roundTex, makeStage, buildArena, loadPet3d, loadOwners, backFrames, SHIRT } from './arena3d.js?v=202611031016';

const TYPES = ['small', 'medium', 'large', 'short', 'long'];
const BOT_NAMES = ['초코', '몽이', '까미', '쿠키', '라떼', '호떡', '감자', '모찌', '탄이', '별이'];

export function race3dGame(body, ctx, done, { base = '' } = {}) {
  const r = rng(`race:${Date.now()}`);
  const L = 100, LANES = 4, LW = 1.1, HALF = (LANES * LW) / 2;
  const A = 1.45, K = 1.0, VMAX = 10.5;            // 한 걸음 힘·감속·최고 속도 → 1초에 6걸음 ≈ 8.7m/s
  const SPURT = 12;                                 // 리듬 맞춘 걸음이 이만큼 쌓이면 스퍼트(2.5초 동안 +15%)
  const STOP = L + 1.2;                             // 골인한 아이가 보호자 앞에 앉는 곳
  body.innerHTML = `<div class="race2 r3d" id="race"><canvas id="race-cv"></canvas>
    <div class="r2-top"><b id="r2-time">0.00</b><span id="r2-rank"></span></div><div class="r2-prog" id="r2-prog"></div>
    <div class="r2-rhythm" id="r2-rhythm"><span>리듬</span><i><i id="r2-rh"></i></i></div>
    <p class="r2-tip" id="r2-tip">발판을 번갈아 가며 눌러 주세요!</p><div class="race-count" id="r2-count">3</div><div class="race-msg" id="r2-msg" hidden></div>
    <div class="r2-pop" id="r2-pop"></div><div class="r2-goal" id="r2-goal">GOAL!</div>
    <button class="r2-pad l" data-p="0" type="button" aria-label="왼발"><span>🐾</span></button><button class="r2-pad r" data-p="1" type="button" aria-label="오른발"><span>🐾</span></button></div>`;
  const el = body.querySelector('#race'), cv = el.querySelector('#race-cv');
  const $ = (q) => el.querySelector(q);
  const $time = $('#r2-time'), $rank = $('#r2-rank'), $prog = $('#r2-prog'), $count = $('#r2-count'), $msg = $('#r2-msg'), $pop = $('#r2-pop'), $rh = $('#r2-rh'), $goal = $('#r2-goal');

  const others = shuffleR(TYPES.filter((t) => t !== ctx.type), r).slice(0, 3);
  const names = shuffleR(BOT_NAMES.filter((n) => n !== ctx.petName), r);
  const base0 = shuffleR([7.2, 7.8, 8.35], r);
  const meLane = 1, botLanes = [0, 2, 3];
  const racers = [
    ...others.map((t, i) => ({ name: names[i], type: t, lane: botLanes[i], me: false, base: base0[i] + (r() - 0.5) * 0.3, phase: r() * 6 })),
    { name: ctx.petName, type: ctx.type, lane: meLane, me: true },
  ].map((x) => ({ ...x, s: 0, v: 0, frame: 0, hop: 0, fin: null, x: (x.lane - (LANES - 1) / 2) * LW }));
  const me = racers.find((x) => x.me);
  $prog.innerHTML = racers.map((x) => `<i class="${x.me ? 'me' : ''}"></i>`).join('');
  const dots = [...$prog.children];

  // ---------- 3D 무대 ----------
  const { renderer, scene, camera, sun } = makeStage(cv);
  const arena = buildArena(scene, { half: HALF, lanes: LANES, end: L, r });
  const blobM = new THREE.MeshBasicMaterial({ map: roundTex('rgba(40,30,20,.45)', 'rgba(40,30,20,0)'), transparent: true, depthWrite: false, opacity: 0.35 });
  let tried = 0;
  for (const x of racers) {
    x.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobM); x.blob.rotation.x = -Math.PI / 2; scene.add(x.blob);
    if (!x.me) { x.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(x.name), transparent: true, depthWrite: false })); x.tag.scale.set(0.62, 0.175, 1); scene.add(x.tag); }
    loadPet3d(scene, base, x.type, ctx.stage).then(async (d) => {
      if (over) return;
      if (d) { x.d = d; d.holder.rotation.y = Math.PI; }
      else {   // 3D가 없으면 뒷모습 그림 판
        const fr = await backFrames(x.type, ctx.stage, base);
        const m = new THREE.MeshBasicMaterial({ map: fr[0], transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
        x.board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); x.im = fr; x.aspect = fr[0].image.width / fr[0].image.height; scene.add(x.board);
      }
    }).finally(() => { tried++; });
  }
  const heightOf = (x) => x.d?.height ?? SIZE[x.type] * 1.3;
  // 보호자: 레인마다 한 명, 결승선 1.2m 뒤에서 팔 벌려 기다린다
  let owners = [];
  loadOwners(scene, base, LANES, r).then((os) => { if (!over) owners = os; });
  const ownerOf = (x) => owners[x.lane];

  // 입자: 흙먼지 · 색종이
  const dustT = roundTex('rgba(225,205,165,.55)', 'rgba(225,205,165,0)');
  const puffs = [];
  const dust = (pos, n, speed = 0.5) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustT, transparent: true, depthWrite: false }));
      s.position.copy(pos); s.scale.setScalar(0.12); scene.add(s);
      const a = r() * Math.PI * 2;
      puffs.push({ s, v: new THREE.Vector3(Math.cos(a) * speed * r(), 0.3 + r() * 0.4, Math.sin(a) * speed * r() + 0.4), t: 0, life: 0.45 + r() * 0.3 });
    }
  };
  const confettiM = SHIRT.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const confetti = [];
  const confettiBurst = (c, n) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), confettiM[i % confettiM.length]);
      m.position.set(c.x + (r() - 0.5) * 5, 2 + r() * 2.5, c.z + (r() - 0.5) * 4); scene.add(m);
      confetti.push({ m, v: new THREE.Vector3((r() - 0.5) * 1.5, r() * 1.5, (r() - 0.5) * 1.5), w: new THREE.Vector3(r() * 8, r() * 8, r() * 8) });
    }
  };

  // ---------- 상태·조작(race.js raceGame과 같음) ----------
  let t = 0, last = 0, raf = 0, over = false, started = false, lastPad = -1, trip = 0, finAt = null, steps = 0, endT = 0, hugged = false;
  let lastStepT = -1, rhythm = 0, spurtUntil = 0, prevRank = 4, cheered = false, lastCount = '', shake = 0, bobT = 0;
  const result = { score: 0 };
  const flash = (m, ms = 800) => { $msg.textContent = m; $msg.hidden = false; $msg.classList.remove('big'); clearTimeout(flash.t); flash.t = setTimeout(() => { $msg.hidden = true; }, ms); };
  const pop = (txt, cls = '') => { $pop.textContent = txt; $pop.className = `r2-pop on ${cls}`; clearTimeout(pop.t); pop.t = setTimeout(() => { $pop.className = 'r2-pop'; }, 900); };
  const footPos = (x, side = 0) => new THREE.Vector3(x.x + side * 0.08, 0.03, -x.s + 0.1);
  const step = (pad) => {
    if (over || !started || me.fin != null) return;
    if (t < trip) return;
    haptic('tap');
    if (pad === lastPad) { trip = t + 0.45; me.v *= 0.6; rhythm = 0; flash('발이 꼬였어요! 번갈아 눌러요'); sfx.tap(); shake = 0.5; return; }
    lastPad = pad;
    const spurt = t < spurtUntil;
    me.v = Math.min(VMAX * (spurt ? 1.15 : 1), me.v + A * (spurt ? 1.15 : 1));
    me.frame = pad; me.hop = 1; steps++;
    // 리듬: 걸음 간격 0.10~0.24초면 쌓이고, 느려지면 깎인다
    const gap = t - lastStepT; lastStepT = t;
    if (gap > 0.1 && gap < 0.24) rhythm = Math.min(SPURT, rhythm + 1); else if (gap >= 0.24) rhythm = Math.max(0, rhythm - 2);
    if (rhythm >= SPURT && !spurt) { spurtUntil = t + 2.5; rhythm = 0; pop('스퍼트!', 'gold'); sfx.whoosh(); shake = 0.3; }
    sfx.step();
    dust(footPos(me, pad ? 1 : -1), 3);
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
  const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener('resize', size); size();
  el.__state = () => ({ t, s: me.s, v: me.v, rhythm, spurt: t < spurtUntil, fin: me.fin, started });   // 시험용

  const camPos = new THREE.Vector3(0, 9, 14), camLook = new THREE.Vector3(0, 0, -20), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const lerpV = (a, b, k) => a.lerp(b, Math.min(1, k));

  const win = () => {
    const placeNo = 1 + racers.filter((x) => !x.me && x.fin != null && x.fin < me.fin).length;
    result.score = [100, 70, 50, 30][placeNo - 1] + Math.max(0, Math.round((16 - me.fin) * 5));
    ctx.note = `${placeNo}등 · ${me.fin.toFixed(2)}초`;
    $time.textContent = me.fin.toFixed(2);
    if (placeNo === 1) sfx.fanfare(); else sfx.coin();
    sfx.cheer();
    arena.cheer = 1; shake = 0.4; endT = t;
    $goal.classList.add('on');
    confettiBurst(new THREE.Vector3(me.x, 0, -L), placeNo === 1 ? 170 : 90);
    setTimeout(() => {
      $msg.innerHTML = `<b>${placeNo}등!</b><span>${placeNo === 1 ? '보호자 품으로 1등 골인!' : '보호자 품으로 골인!'} ${me.fin.toFixed(2)}초</span>`;
      $msg.hidden = false; $msg.classList.add('big');
    }, 700);
  };

  const frame = (ts) => {
    const raw = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    const slow = started && me.fin == null && me.s > L - 3 ? 0.4 : 1;   // 결승 3m 앞 슬로모션
    const dt = raw * slow;
    t += dt;
    if (!started) {
      const left = Math.ceil(3 - t), txt = left > 0 ? String(left) : '출발!';
      if (txt !== lastCount) { lastCount = txt; $count.textContent = txt; $count.classList.remove('pop'); void $count.offsetWidth; $count.classList.add('pop'); if (left > 0) sfx.tap(); }
      if (t >= 3 && (tried >= racers.length || t > 8)) {   // 3D 아이를 기다린다(느린 폰은 8초까지)
        started = true; t = 0; sfx.fanfare(); shake = 0.4;
        for (const x of racers) dust(footPos(x), 6, 1);
        setTimeout(() => $count.remove(), 600);
      }
    } else {
      const spurt = t < spurtUntil;
      if (me.fin == null) { me.v *= Math.exp(-K * dt); if (t < trip) me.v = Math.min(me.v, 3); }
      for (const b of racers) {
        if (b.me || b.fin != null) continue;
        let tv = b.base * (1 + 0.05 * Math.sin(t * 1.4 + b.phase));
        if (b.s > L * 0.72) tv *= 1.05;
        tv *= 1 + clamp((me.s - b.s) / 45, -0.07, 0.07);
        b.v += (tv - b.v) * Math.min(1, dt * (t < 1.2 ? 2.2 : 1.4));
      }
      for (const x of racers) {
        // 골인한 아이는 보호자 앞까지 속도를 줄이며 가서 앉는다
        if (x.fin != null) x.v = Math.min(Math.max(x.v - 6 * dt, 0.8), (STOP - x.s) * 3);   // 걸음으로 줄었다가 보호자 앞에서 멈춘다
        x.s += x.v * dt;
        x.hop = Math.max(0, x.hop - dt * 6);
        if (x.fin == null && x.s >= L) {
          x.fin = t - (x.s - L) / Math.max(0.1, x.v);
          if (x.me) { finAt = t; win(); } else ownerOf(x)?.to(ownerOf(x).act.Clap, 0.3);
        }
        if (x.fin != null) x.s = Math.min(x.s, STOP);
      }
      const order = [...racers].sort((a, b) => (a.fin ?? 1e9) - (b.fin ?? 1e9) || b.s - a.s);
      const rank = order.indexOf(me) + 1;
      if (rank < prevRank && me.fin == null && t > 1) { pop(rank === 1 ? '선두로!' : '추월!', rank === 1 ? 'gold' : ''); sfx.whoosh(); arena.cheer += 0.3; }
      prevRank = rank;
      $rank.textContent = `${rank}위`;
      racers.forEach((x, i) => { dots[i].style.left = `${clamp(x.s / L, 0, 1) * 100}%`; });
      if (me.fin == null) $time.textContent = t.toFixed(2);
      if (!cheered && me.s > L - 22) { cheered = true; sfx.cheer(); arena.cheer = 0.8; }
      $rh.style.width = `${spurt ? 100 : (rhythm / SPURT) * 100}%`;
      $rh.parentElement.parentElement.classList.toggle('full', spurt);
    }

    // 아이들: 속도에 맞춰 동작(빠르면 갤럽 Dash, 느리면 종종 Run), 출발 전·골인 뒤엔 앉기
    for (const x of racers) {
      const h = heightOf(x);
      x.blob.position.set(x.x, 0.01, -x.s + 0.02); x.blob.scale.setScalar(h * 0.9);
      if (x.tag) { x.tag.position.set(x.x, h + 0.22, -x.s); x.tag.visible = Math.abs(x.s - me.s) < 25; }
      if (x.d) {
        const { holder, act, to } = x.d;
        const ra = x.d.cur === act.Dash || x.d.cur === act.Run ? x.d.cur : null, rc = ra ? ra.time / ra.getClip().duration : 0;
        holder.position.set(x.x, rc ? Math.abs(Math.sin(rc * Math.PI * 2)) * h * 0.04 : 0, -x.s);
        if (!started || (x.fin != null && x.s > STOP - 0.08)) to(act.Sit ?? act.Idle, 0.45);
        else if (x.v > 4.5 && act.Dash) { to(act.Dash, 0.15); act.Dash.timeScale = clamp(x.v * 0.36, 1.6, 3.6); }
        else if (x.v > 0.4 && act.Run) { to(act.Run, 0.2); act.Run.timeScale = clamp(x.v * 0.36, 0.7, 2.2); }
        else if (x.fin != null && act.Walk) { to(act.Walk, 0.25); act.Walk.timeScale = 1.2; }
        x.d.update(raw);
      } else if (x.board) {
        x.frame = (x.frame + raw * x.v * 0.75) % 2;
        x.board.material.map = x.im[Math.floor(x.frame)];
        const hh = SIZE[x.type];
        x.board.scale.set(hh * x.aspect, hh, 1); x.board.position.set(x.x, hh / 2, -x.s);
        x.board.rotation.y = Math.atan2(camPos.x - x.x, camPos.z + x.s);
      }
      // 보호자: 앉은 아이 목 앞에 오게(아이 키에 비례) — 내 아이가 1m 앞까지 오면 무릎 꿇고 안는다
      const o = ownerOf(x);
      if (o) {
        o.holder.position.set(x.x, 0, -(STOP + 0.25 + 0.38 * h));
        if (x.me && x.fin != null && !hugged && x.s > STOP - 1) { hugged = true; o.to(o.act.Hug, 0.25); }
        o.update(raw, x.me ? clamp((0.95 - h) * 1.1, 0, 0.45) : 0);
      }
    }

    // 카메라: 출발 전엔 위에서 내려오며 훑고, 달릴 땐 내 아이 뒤를 따라가며(빠를수록 다가가고 화각 넓게), 골인하면 옆으로 돌아 안기는 모습
    const sp = clamp(me.v / VMAX, 0, 1.2), camS = Math.min(me.s, STOP);
    if (!started) {
      const k = clamp(t / 3, 0, 1), e = k * k * (3 - 2 * k);
      wantPos.set(me.x * 0.6 + Math.sin(k * 2.2) * 6 * (1 - e), 1.15 + 11 * (1 - e), 2.6 + 22 * (1 - e) - 30 * (1 - e) * Math.sin(k * Math.PI));
      wantLook.set(me.x * 0.5, 0.45, -16 + 10 * e);
      camPos.copy(wantPos); camLook.copy(wantLook);
    } else if (me.fin != null) {
      // 내 아이 뒤 위쪽으로 올라가 보호자 얼굴과 안기는 모습을 내려다본다 — 옆으로 돌면 옆 레인 보호자가 가리고, 앞으로 넘어가면 무릎 꿇은 보호자 등에 아이가 가렸다(11/2)
      const k = clamp((t - endT) / 2.4, 0, 1), e = k * k * (3 - 2 * k), mid = -(STOP + 0.25 + 0.2 * heightOf(me));
      wantPos.set(me.x * (0.6 + 0.4 * e) - 0.6 * e, 1.2 + 0.8 * e, (1 - e) * (-camS + 2.6) + e * (-L + 0.5));   // 결승 아치 앞, 현수막(2.2m) 아래에서 내려다본다 — 넘어가면 현수막을 뚫었다
      wantLook.set(me.x, 0.5 + 0.1 * e, (1 - e) * (-camS - 5) + e * mid);
      lerpV(camPos, wantPos, raw * 3); lerpV(camLook, wantLook, raw * 4);
    } else {
      bobT += raw * (4 + me.v);
      const dist = 2.6 - sp * 0.55 - (t < spurtUntil ? 0.2 : 0);
      wantPos.set(me.x * 0.6, 1.2 + Math.abs(Math.sin(bobT)) * 0.03 * sp, -camS + dist);
      wantLook.set(me.x * 0.5, 0.5, -camS - 6);
      lerpV(camPos, wantPos, raw * 6); lerpV(camLook, wantLook, raw * 7);
      camPos.z = wantPos.z; camLook.z = wantLook.z;   // 앞뒤는 바로 따라간다(늦게 따라가면 빠를수록 아이가 멀어져 작게 보였다)
    }
    shake = Math.max(0, shake - raw * 1.7);
    const sh = shake * shake * 0.12;
    camera.position.set(camPos.x + (r() - 0.5) * sh, camPos.y + (r() - 0.5) * sh, camPos.z);
    camera.fov = 54 + (me.fin == null ? sp * 12 + (t < spurtUntil ? 5 : 0) : 0); camera.updateProjectionMatrix();
    camera.lookAt(camLook);
    camera.rotateZ((me.frame ? 1 : -1) * 0.008 * sp * (me.fin == null ? 1 : 0));
    sun.position.set(me.x - 6, 14, -camS + 6); sun.target.position.set(me.x, 0, -camS - 2);
    arena.update(t, raw, camS, t < spurtUntil ? 0.4 : 0);
    // 입자
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i]; q.t += raw;
      if (q.t > q.life) { scene.remove(q.s); q.s.material.dispose(); puffs.splice(i, 1); continue; }
      q.v.y -= 0.6 * raw; q.s.position.addScaledVector(q.v, raw);
      const a = 1 - q.t / q.life; q.s.material.opacity = a; q.s.scale.setScalar(0.12 * (1 + (1 - a) * 1.6));
    }
    for (const c of confetti) { c.v.y -= 2.2 * raw; c.v.multiplyScalar(0.99); c.m.position.addScaledVector(c.v, raw); c.m.rotation.x += c.w.x * raw; c.m.rotation.y += c.w.y * raw; c.m.rotation.z += c.w.z * raw; }
    el.style.setProperty('--fire', t < spurtUntil && me.fin == null ? '0.24' : '0');
    renderer.render(scene, camera);
    if (finAt != null && t - finAt > 4.2 && !over) { over = true; cleanup(); done(result.score); return; }   // 안기는 데까지 본다
    raf = requestAnimationFrame(frame);
  };
  const cleanup = () => {
    cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', size); clearTimeout(flash.t); clearTimeout(pop.t);
    renderer.dispose(); renderer.forceContextLoss();   // 그래픽을 바로 돌려준다 — 안 하면 판마다 쌓여 브라우저가 방의 움직이는 아이 그래픽까지 끊었다(11/3)
    scene.traverse((o) => { o.geometry?.dispose?.(); });
  };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}
