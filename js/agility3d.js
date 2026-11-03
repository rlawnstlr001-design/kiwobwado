// 장애물 경주 3D 시험판(10/27 사용자 "장애물 경주 하나 3d로 시험판 먼저 · 맵의 구성요소도 3d로")
// 규칙·판정·점수·조작은 js/race.js agilityGame과 같다. 그리는 것만 three.js 진짜 3D로:
//  경기장(깎은 잔디·코스 선·광고판 펜스·관중석과 관중·나무·언덕·구름·깃발·결승 아치) + 장애물(허들·휘어진 천 터널·위브 폴·A자 경사로)
//  아이·보호자는 우리 수채 그림(뒷모습 2걸음)을 3D 공간에 세운 판 — 그림체는 그대로, 공간·빛·그림자·카메라는 3D
// 좌표: x 오른쪽 · y 위 · 코스는 -z 방향(아이 위치 s m → z = -s)
import * as THREE from 'three';
import { sfx } from './sound.js?v=202611031058';
import { rng } from './engine.js?v=202611031058';
import { haptic } from './native.js?v=202611031058';
import { SIZE, STAGE_K, clamp, shuffleR, canvasTex, stripeTex, roundTex, makeStage, std, mesh, buildArena, loadPet3d, loadOwners, backFrames, loadTex, SHIRT } from './arena3d.js?v=202611031058';

const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const COLOR = { up: '#E8657A', down: '#4F8FC0', left: '#C98A2E', right: '#3F6B4F' };
const AH = 1.5, AW = 0.6, TR = 0.45;   // A자 경사로 꼭대기·반폭, 터널 반지름
// 경기장·아이 3D·보호자 3D는 js/arena3d.js(반려 경주 3D와 같이 쓴다, 11/2)

// ---------- 캔버스로 만드는 무늬 ----------
const arrowTex = (dir) => canvasTex(128, 128, (g) => {
  g.fillStyle = COLOR[dir]; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.lineWidth = 9; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = '900 78px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ARROW[dir], 64, 70);
});
// ---------- 게임 ----------
export function agility3dGame(body, ctx, done, { base = '' } = {}) {
  const r = rng(`agility:${Date.now()}`);
  const dog = ctx.species === 'dog';
  // 코스(race.js와 같다): 조각마다 판정점(at m, dir)
  const parts = [], checks = [];
  let at = 16;
  const kinds = shuffleR(['hurdle', 'tunnel', 'weave', 'aframe', 'hurdle', 'tunnel', 'hurdle', 'weave', 'aframe', 'hurdle', 'tunnel', 'weave', 'hurdle', 'aframe'], r);
  for (const k of kinds) {
    if (k === 'hurdle') { parts.push({ k, at }); checks.push({ at, dir: 'up', k }); at += 9; }
    if (k === 'tunnel') { parts.push({ k, at, len: 4, bend: (r() < 0.5 ? -1 : 1) * 0.8 }); checks.push({ at, dir: 'down', k }); at += 12; }
    if (k === 'weave') {
      const first = r() < 0.5 ? 'left' : 'right', poles = [];
      for (let i = 0; i < 6; i++) { const dir = i % 2 ? (first === 'left' ? 'right' : 'left') : first; poles.push({ at: at + i * 1.6, dir }); checks.push({ at: at + i * 1.6, dir, k }); }
      parts.push({ k, at, poles }); at += 6 * 1.6 + 8;
    }
    if (k === 'aframe') { parts.push({ k, at, len: 6 }); checks.push({ at, dir: 'up', k }); checks.push({ at: at + 3, dir: 'down', k }); at += 6 + 9; }
  }
  const END = at + 4;
  const groundY = (pos) => { for (const p of parts) if (p.k === 'aframe' && pos > p.at && pos < p.at + p.len) { const u = (pos - p.at) / p.len; return AH * (1 - Math.abs(u * 2 - 1)); } return 0; };
  const tunnelX = (p, pos) => p.bend * Math.sin(Math.PI * clamp((pos - p.at) / p.len, 0, 1));
  const tunnelAt = (pos) => parts.find((p) => p.k === 'tunnel' && pos > p.at && pos < p.at + p.len);

  // ---------- 화면(HUD는 2D 판과 같은 모양) ----------
  body.innerHTML = `<div class="race2 ag2 ag3d" id="ag"><canvas id="ag-cv"></canvas>
    <div class="r2-top"><span id="ag-life">♥♥♥</span><b id="ag-score">0점</b><span id="ag-combo"></span></div><div class="r2-prog ag-prog2"><i id="ag-bar"></i></div>
    <div class="ag-judge" id="ag-judge"></div>
    <div class="ag-legend"><span><b style="--c:#E8657A">↑</b>허들·경사로 오르기</span><span><b style="--c:#4F8FC0">↓</b>터널·경사로 내려가기</span><span><b style="--c:#C98A2E">←</b><b style="--c:#3F6B4F">→</b>${dog ? '위브 폴' : '폴 사이'} 지그재그</span></div>
    <div class="ag-pad" id="ag-pad">${['up', 'left', 'down', 'right'].map((d) => `<button type="button" data-d="${d}" class="ag-${d}" style="--c:${COLOR[d]}">${ARROW[d]}</button>`).join('')}</div>
    <div class="race-count" id="ag-count">3</div></div>`;
  const el = body.querySelector('#ag'), cv = el.querySelector('#ag-cv');
  const $ = (q) => el.querySelector(q);
  const $life = $('#ag-life'), $score = $('#ag-score'), $combo = $('#ag-combo'), $bar = $('#ag-bar'), $judge = $('#ag-judge'), $count = $('#ag-count');

  // ---------- 3D 무대 ----------
  const { renderer, scene, camera, sun } = makeStage(cv);

  const arena = buildArena(scene, { half: 1.27, lanes: 1, end: END, r });
  const shirt = SHIRT.map((c) => new THREE.Color(c));

  // ---------- 장애물 ----------
  const barT = stripeTex('#E8657A', '#FFFFFF', 6); const poleT = stripeTex('#F2A93B', '#FFFFFF', 6, true);
  const wingM = std('#4F8FC0'), whiteM = std('#FFFFFF'), woodUp = std('#D9894A'), woodDn = std('#C98446'), zoneM = std('#F2D24B'), railM = std('#6E4220');
  const tunnelMats = [];
  for (const p of parts) {
    if (p.k === 'hurdle') {
      const g = new THREE.Group(); g.position.z = -p.at;
      for (const side of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.22, 0.95, 0.06), wingM); w.position.set(side * 0.92, 0.475, 0); g.add(w);
        const cap = mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), whiteM); cap.position.set(side * 0.92, 0.97, 0); g.add(cap);
      }
      const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.62, 10), std('#ffffff', { map: barT })); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.46, 0); g.add(bar);
      scene.add(g); p.obj = g;
    }
    if (p.k === 'weave') {
      const g = new THREE.Group();
      const z0 = -(p.poles[0].at - 0.4), z1 = -(p.poles[p.poles.length - 1].at + 0.4);
      const rail = mesh(new THREE.BoxGeometry(0.08, 0.03, z0 - z1), std('#9AA3AD')); rail.position.set(0, 0.015, (z0 + z1) / 2); g.add(rail);
      for (const q of p.poles) { const pl = mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.0, 10), std('#ffffff', { map: poleT, transparent: true })); pl.position.set(0, 0.5, -q.at); g.add(pl); q.mesh = pl; }
      scene.add(g); p.obj = g;
    }
    if (p.k === 'tunnel') {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20, pos = p.at + u * p.len; pts.push(new THREE.Vector3(tunnelX(p, pos), TR, -pos)); }
      pts.unshift(pts[0].clone().add(new THREE.Vector3(0, 0, 0.01)));
      const curve = new THREE.CatmullRomCurve3(pts);
      const ribT = stripeTex('#4F8FC0', '#3D78A8', 2, false); ribT.repeat.set(14, 1);
      const mat = std('#ffffff', { map: ribT, side: THREE.DoubleSide, transparent: true, opacity: 1 });
      const tube = mesh(new THREE.TubeGeometry(curve, 48, TR, 20, false), mat); scene.add(tube);
      const ring = mesh(new THREE.TorusGeometry(TR, 0.05, 8, 24), std('#2F5F8A', { transparent: true })); ring.position.set(0, TR, -p.at); scene.add(ring);
      tunnelMats.push({ p, mats: [mat, ring.material] });
      p.obj = tube;
    }
    if (p.k === 'aframe') {
      const run = p.len / 2, slope = Math.hypot(run, AH), ang = Math.atan2(AH, run);
      for (const [dirSign, zc, mat] of [[1, p.at + run / 2, woodUp], [-1, p.at + run + run / 2, woodDn]]) {
        const g = new THREE.Group(); g.position.set(0, AH / 2, -zc); g.rotation.x = dirSign * ang;
        const plank = mesh(new THREE.BoxGeometry(AW * 2, 0.06, slope), mat); g.add(plank);
        // 접촉 구역(노랑, 바닥 쪽 1.06m) · 미끄럼 방지 살 · 양옆 난간
        const zone = mesh(new THREE.BoxGeometry(AW * 2 + 0.002, 0.062, 1.06), zoneM); zone.position.z = dirSign * (slope / 2 - 0.53); g.add(zone);
        for (let d = -slope / 2 + 0.2; d < slope / 2 - 0.1; d += 0.3) { const sl = mesh(new THREE.BoxGeometry(AW * 2 - 0.1, 0.03, 0.05), railM); sl.position.set(0, 0.045, d); g.add(sl); }
        for (const side of [-1, 1]) { const rl = mesh(new THREE.BoxGeometry(0.06, 0.1, slope), railM); rl.position.set(side * (AW + 0.03), 0.04, 0); g.add(rl); }
        scene.add(g);
      }
      // 받침 다리
      for (const side of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.06, AH * 0.9, 0.06), railM); leg.position.set(side * AW, AH * 0.45, -(p.at + run)); scene.add(leg); }
    }
  }
  // ---------- 아이·보호자(그림 판) ----------
  const H = SIZE[ctx.type] ?? 0.55;
  // 점프 높이: 아기는 낮게(성장판이 닫히기 전 과한 점프는 조심하라는 권고 — 볼트 동물-걸음걸이 '강아지 vs 성견', 10/29)
  const JH = { baby: 0.4, teen: 0.48 }[ctx.stage] ?? 0.55;
  const petMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });   // 그림 색 그대로(3D 색 보정 제외)
  const pet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), petMat); pet.renderOrder = 2; scene.add(pet);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: roundTex('rgba(40,30,20,.45)', 'rgba(40,30,20,0)'), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; scene.add(blob);
  let IM = null, petAspect = 1;
  // 보호자: 3D(art/3d/owner.glb — 팔 벌려 기다리다 아이가 오면 무릎 꿇고 안아 준다, 11/2 사용자) · 못 불러오면 그림 판
  const ownerMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, toneMapped: false });
  const owner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ownerMat); owner.visible = false; scene.add(owner);
  let owner3 = null, hugged = false, petTried = false;
  const PET_STOP = END + 0.2;   // 완주한 아이가 앉는 곳
  backFrames(ctx.type, ctx.stage, base).then((fr) => { IM = fr; petAspect = fr[0].image.width / fr[0].image.height; petMat.map = fr[0]; petMat.needsUpdate = true; });
  loadOwners(scene, base, 1, r).then(async ([o]) => {
    if (over) return;
    if (o) { owner3 = o; return; }
    const ow = await loadTex(`${base}art/race/owner${Math.floor(r() * 4)}.webp`);
    if (ow) { ownerMat.map = ow; ownerMat.needsUpdate = true; const a = ow.image.width / ow.image.height; owner.scale.set(1.15 * a, 1.15, 1); owner.position.set(0, 0.575, -(END + 0.6)); owner.visible = true; }
  });

  // 우리 아이 3D(js/arena3d.js loadPet3d) — 있으면 그림 판 대신
  let dog3 = null;
  loadPet3d(scene, base, ctx.type, ctx.stage).then((d) => {
    petTried = true;
    if (!d || over) return;
    dog3 = d; pet.visible = false; blob.material.opacity = 0.35;
  });

  // 화살표 표시(다음 3개) — 판정점 위에 떠 있는 동그란 표지
  const arrowMats = Object.fromEntries(Object.keys(ARROW).map((d) => [d, new THREE.SpriteMaterial({ map: arrowTex(d), transparent: true, depthTest: false })]));
  const arrows = [0, 1, 2].map(() => { const s = new THREE.Sprite(arrowMats.up.clone()); s.scale.set(0.42, 0.42, 1); s.renderOrder = 5; scene.add(s); return s; });

  // 입자: 흙먼지(작은 둥근 판) · 반짝 · 색종이
  const dustT = roundTex('rgba(225,205,165,.55)', 'rgba(225,205,165,0)'), sparkT = roundTex('rgba(255,240,160,1)', 'rgba(255,212,94,0)');
  const parts3 = [];
  const emit = (pos, n, { tex = dustT, speed = 0.8, up = 0.6, life = 0.6, size = 0.18, grav = -0.5 } = {}) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
      const a = r() * Math.PI * 2;
      parts3.push({ s, v: new THREE.Vector3(Math.cos(a) * speed * r(), up * (0.5 + r()), Math.sin(a) * speed * r()), t: 0, life: life * (0.7 + r() * 0.6), size, grav });
    }
  };
  const confettiM = shirt.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const confetti = [];
  const confettiBurst = (center) => {
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), confettiM[i % confettiM.length]);
      m.position.set(center.x + (r() - 0.5) * 4, center.y + 2 + r() * 2, center.z + (r() - 0.5) * 3); scene.add(m);
      confetti.push({ m, v: new THREE.Vector3((r() - 0.5) * 1.5, r() * 1.5, (r() - 0.5) * 1.5), w: new THREE.Vector3(r() * 8, r() * 8, r() * 8) });
    }
  };

  // ---------- 상태·판정(race.js와 같음) ----------
  let t = 0, last = 0, raf = 0, over = false, started = false, s = 0, lives = 3, score = 0, combo = 0, maxCombo = 0, perfect = 0, good = 0, ended = false;
  let frameNo = 0, ft = 0, jump = 0, duck = 0, sway = 0, swayTo = 0, swayV = 0, swayA = 0, heading = 0, lean = 0, bend = 0, slowUntil = 0, hitT = -9, shake = 0, lastCount = '', endT = 0;
  const speed = () => 5.2 + Math.min(2.4, (s / END) * 2.4);
  const judge = (txt, cls) => { $judge.textContent = txt; $judge.className = `ag-judge on ${cls}`; clearTimeout(judge.t); judge.t = setTimeout(() => { $judge.className = 'ag-judge'; }, 650); };
  const petPos = () => new THREE.Vector3(sway, groundY(s), -s);
  const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
  const act = (d, c) => {
    if (d === 'up' && c.k === 'hurdle') jump = 1;
    if (d === 'down' && c.k === 'tunnel') duck = 1;
    if (d === 'left' || d === 'right') swayTo = d === 'left' ? -0.46 : 0.46;
  };
  const miss = (c, why) => { c.state = 'miss'; combo = 0; lives--; judge(why, 'miss'); sfx.tap(); shake = 0.6; hitT = t; };
  const press = (d) => {
    if (!started || over || ended) return;
    haptic('tap');   // 버튼·밀기마다 가벼운 톡(11/2 사용자 "강도 너무 강하게 말고 타격감만")
    const c = checks.find((q) => !q.state);
    if (!c) return;
    const dm = c.at - s;
    if (dm > 2.4) return;
    if (d !== c.dir) { miss(c, '방향이 달라요!'); return; }
    c.state = 'ok'; act(d, c);
    combo++; maxCombo = Math.max(maxCombo, combo);
    const err = Math.abs(dm - 0.8);
    const pp = petPos().add(new THREE.Vector3(0, H * 0.6, 0));
    if (err < 0.5) { perfect++; score += 100 + combo * 5; judge(combo >= 5 ? `완벽! ×${combo}` : '완벽!', 'perfect'); sfx.coin(); slowUntil = t + 0.12; shake = Math.max(shake, 0.12); emit(pp, 14, { tex: sparkT, speed: 1.6, up: 1.2, life: 0.5, size: 0.09, grav: -1 }); arena.cheer += 0.25; }
    else { good++; score += 60 + combo * 3; judge('좋아요', 'good'); sfx.pop(); emit(pp, 6, { tex: sparkT, speed: 1, up: 0.8, life: 0.4, size: 0.07, grav: -1 }); }
  };
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
  addEventListener('keydown', onKey);
  el.__state = () => ({ s, next: checks.find((c) => !c.state), heading, bend, dog: dog3 });   // 시험용(tools/lab_capture.js)
  const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener('resize', size); size();

  // ---------- 카메라 ----------
  const camPos = new THREE.Vector3(0, 9, 14), camLook = new THREE.Vector3(0, 0, -20);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const lerpV = (a, b, k) => a.lerp(b, Math.min(1, k));

  const finish = (clear) => {
    if (ended) return;
    ended = true; endT = t;
    const total = score + maxCombo * 10 + (clear ? 200 + lives * 50 : 0);
    ctx.note = clear ? `완주! 완벽 ${perfect} · 좋아요 ${good} · 최대 ${maxCombo}콤보` : `${checks.filter((c) => c.state).length}/${checks.length}에서 넘어졌어요`;
    if (clear) { sfx.fanfare(); sfx.cheer?.(); judge(`완주! 완벽 ${perfect} · 좋아요 ${good}`, 'perfect'); arena.cheer = 1; confettiBurst(new THREE.Vector3(0, 0, -END)); }
    else { judge('넘어졌어요… 다음엔 끝까지!', 'miss'); if (parts.some((p) => p.k === 'weave' && s > p.at - 1.5 && s < p.at + p.poles.length * 1.6)) swayTo = sway < 0 ? -0.5 : 0.5; }   // 위브 폴 위에 엎드리지 않게 옆으로
    setTimeout(() => { if (over) return; over = true; cleanup(); done(total); }, clear ? 4200 : 1600);   // 완주: 걸어가 안기는 데까지 본다
  };

  const frame = (ts) => {
    const raw = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    const dt = raw * (t < slowUntil ? 0.4 : 1);
    t += dt;
    if (!started) {   // 3D 아이를 기다린다(느린 폰은 8초까지)
      const left = Math.ceil(3 - t), txt = left > 0 ? String(left) : '출발!';
      if (txt !== lastCount) { lastCount = txt; $count.textContent = txt; $count.classList.remove('pop'); void $count.offsetWidth; $count.classList.add('pop'); if (left > 0) sfx.tap(); }
      if (t >= 3 && IM && (petTried || t > 8)) { started = true; t = 0; sfx.fanfare(); setTimeout(() => $count.remove(), 600); }
    } else if (!ended) {
      s += speed() * dt;
      for (const c of checks) if (!c.state && c.at - s < -0.4) miss(c, '놓쳤어요!');
      if (lives <= 0) finish(false);
      else if (s >= END - 2.5) finish(true);
    } else if (lives > 0 && s < PET_STOP) s = Math.min(PET_STOP, s + 1.4 * dt);   // 완주면 보호자 품까지 — 걸어서(우리 걷기 'Walk', 10/28)
    ft += dt * speed() * 0.9;
    if (ft >= 1) {
      ft = 0; frameNo ^= 1;
      if (IM) { petMat.map = IM[frameNo]; }
      if (started && !ended && jump <= 0 && groundY(s) === 0 && !tunnelAt(s)) { sfx.step?.(); emit(petPos().add(new THREE.Vector3(frameNo ? 0.1 : -0.1, 0.03, 0.12)), 3, { speed: 0.4, up: 0.3, life: 0.45, size: 0.09, grav: 0.1 }); }
    }
    jump = Math.max(0, jump - dt * 1.9); duck = Math.max(0, duck - dt * 1.4);
    const inWeave = parts.some((p) => p.k === 'weave' && s > p.at - 1.5 && s < p.at + p.poles.length * 1.6);
    // 좌우 이동(10/27 사용자 "옆으로 가는게 부자연스러워"): 전엔 0.1초 만에 옆으로 미끄러지고 몸만 홱 돌았다.
    // 이제 용수철(임계 감쇠)로 S자를 그리며 옮겨 가고, 몸은 실제 진행 방향(앞 속도·옆 속도)을 보고, 도는 쪽으로 기울고, 머리가 먼저 돈다.
    if (!inWeave) swayTo *= Math.exp(-dt * 3);
    const tp = tunnelAt(s);
    if (tp) { const nx = tunnelX(tp, s); swayV = dt > 0 ? (nx - sway) / dt : 0; swayA = 0; sway = nx; swayTo = nx; }
    else if (dt > 0) { const W = inWeave ? 15 : 8.5;   // 위브는 폴 간격(1.6m)이 짧아 더 빨리 옮겨야 폴을 안 뚫는다
      swayA = W * W * (swayTo - sway) - 2 * W * swayV; swayV += swayA * dt; sway += swayV * dt; }
    const fwd = started && !ended ? speed() : ended ? 3 : 0.001;
    heading += (clamp(Math.atan2(swayV, Math.max(fwd, 1.5)) * 0.6, -0.42, 0.42) - heading) * Math.min(1, dt * 12);   // 몸통은 최대 24°만 — 더 돌면 트랙을 가로질러 뛰는 것처럼 보였다(실제 게임 화면 연속 프레임 확인)
    lean += (clamp(-swayA * 0.012, -0.22, 0.22) - lean) * Math.min(1, dt * 10);
    bend += (clamp((swayTo - sway) * 0.6 + swayV * 0.05, -0.32, 0.32) - bend) * Math.min(1, dt * 12);
    const gy = groundY(s), hj = jump > 0 ? Math.sin(jump * Math.PI) * JH : 0;

    // 아이 판: 카메라 쪽을 보게(세로축만 돌림) + 걸음 출렁임·뛰면 늘어남·숙이면 납작
    const bob = Math.abs(Math.sin(ft * Math.PI)) * 0.03;
    const hgt = H * (1 - Math.sin(duck * Math.PI) * 0.3) * (tp ? 0.82 : 1) * (jump > 0 ? 1 + Math.sin(jump * Math.PI) * 0.06 : 1);
    pet.scale.set(hgt * petAspect, hgt, 1);
    pet.position.set(sway, gy + hj + hgt / 2 + bob, -s);
    pet.rotation.set(0, Math.atan2(camPos.x - pet.position.x, camPos.z - pet.position.z), (frameNo ? 1 : -1) * 0.03 + (swayTo - sway) * 0.6);
    if (dog3) {
      const { holder, act, to } = dog3;
      const ra = dog3.cur === act.Dash || dog3.cur === act.Run ? dog3.cur : null, rc = ra ? ra.time / ra.getClip().duration : 0;
      holder.position.set(sway, gy + hj + (rc ? Math.abs(Math.sin(rc * Math.PI * 2)) * H * 0.05 : 0), -s);   // 종종 달리기는 한 바퀴에 두 번 들썩
      const slopeA = gy > 0 ? Math.atan2(AH, 3) * ((s - parts.find((p) => p.k === 'aframe' && s > p.at && s < p.at + p.len).at) / 6 < 0.5 ? 1 : -1) : 0;
      holder.rotation.set(slopeA, Math.PI + heading, lean);
      holder.scale.set(1, tp ? 0.82 : 1, 1);
      // 출발 전엔 출발선에 앉아 기다리고, 완주하면 보호자 앞에 앉고, 넘어지면 엎드린다(우리 앉기·엎드리기, 10/29) — 시바 모델은 Idle
      if (!started || (ended && s >= PET_STOP - 0.05 && lives > 0)) to(act.Sit ?? act.Idle, 0.45);
      else if (ended && lives <= 0) to(act.Down ?? act.Idle, 0.6);
      else if (ended && act.Walk) to(act.Walk, 0.3);
      else if (jump > 0.03 && act.Leap) {
        // 우리 점프 'Leap'(도약 → 정점 → 앞발 뻗기 → 착지, 10/29 — 볼트 동물-걸음걸이 '점프'): 높이 곡선(jump 1 → 0)과 같은 시간에 맞춰 직접 넘긴다
        to(act.Leap, 0.06); act.Leap.timeScale = 0; act.Leap.time = (1 - jump) * act.Leap.getClip().duration;
      } else to(act.Dash ?? act.Run, 0.12);   // 달릴 땐 우리 갤럽 'Dash'(로터리 갤럽 — 볼트 동물-걸음걸이)
      if (act.Run) act.Run.timeScale = 1.81 + (speed() - 5.2) * 0.15;   // 20프레임(11/2 16→20, 한 바퀴 시간 그대로)
      if (act.Walk) act.Walk.timeScale = 1.3;
      if (act.Dash) act.Dash.timeScale = 2.4 + (speed() - 5.2) * 0.18;   // 한 바퀴 ≈ 0.36초(작은 개 갤럽 ≈ 3Hz) — 21프레임(11/2 14→21, 발 떼는 순간을 촘촘히)
      dog3.update(raw, bend);   // 동작 → 눈 깜빡임 → 몸 휘기(머리·목은 가는 쪽, 엉덩이·꼬리는 반대)
      if (ended && lives > 0) holder.rotation.set(0, Math.PI, 0);   // 보호자 쪽을 똑바로
    }
    // 보호자: 앉은 아이 가슴이 무릎 꿇은 보호자 팔 안에 오게(아이 키에 비례) — 아이가 1m 앞까지 오면 무릎 꿇고 안는다
    if (owner3) {
      owner3.holder.position.set(0, 0, -(PET_STOP + 0.25 + 0.38 * (dog3?.height ?? H * 1.3)));   // 앉은 아이 목 앞 ≈ 0.35×키
      if (ended && lives > 0 && !hugged && s > PET_STOP - 1) { hugged = true; owner3.to(owner3.act.Hug, 0.25); }
      owner3.update(raw, clamp((0.95 - (dog3?.height ?? 0.8)) * 1.1, 0, 0.45));   // 작은 아이면 더 숙여 안는다
    }
    blob.position.set(sway, gy + 0.01, -s + 0.02); blob.scale.setScalar(H * 1.2 * (1 - hj * 0.6));
    if (gy > 0) { const u = (s - parts.find((p) => p.k === 'aframe' && s > p.at && s < p.at + p.len).at) / 6; blob.rotation.set(-Math.PI / 2 + (u < 0.5 ? 1 : -1) * Math.atan2(AH, 3), 0, 0); } else blob.rotation.set(-Math.PI / 2, 0, 0);
    // 위브: 아이가 지나간 폴은 카메라와 아이 사이에 끼어 화면을 가린다 — 흐리게
    for (const p of parts) if (p.k === 'weave' && Math.abs(p.at - s) < 14) for (const q of p.poles) { const m = q.mesh.material, want = q.at < s - 0.1 ? 0.18 : 1; m.opacity += (want - m.opacity) * Math.min(1, raw * 10); m.depthWrite = m.opacity > 0.9; }
    // 터널: 아이가 안에 있으면 천을 반투명하게 — 안의 아이가 비친다
    // 장애물 앞 5m부터 지나갈 때까지 아이를 반투명하게(11/2 사용자 "대형견이 너무 커서 앞에 있는 장애물이 잘 안보여") — 뒤에서 따라가는 카메라라 큰 아이일수록 더 가린다:
    // 화면 속 크기(성향 키 × 단계)에 맞춰 대형견 성견 약 30% ~ 소형견·고양이 아기 약 70%까지만 흐리게
    if (dog3) {
      const size = H * (STAGE_K[ctx.stage] ?? 1) / STAGE_K.baby, low = Math.min(1, Math.max(0.3, 1.25 - 1.1 * size));
      const near = parts.some((p) => { const end = p.at + (p.len ?? (p.poles ? p.poles[p.poles.length - 1].at - p.at : 0.3)); return s > p.at - 5 && s < end + 0.3; });   // 3.5m면 대형견이 4m 앞 허들을 이미 가렸다
      const want = near && started && !ended ? low : 1;
      dog3.fade(want, raw);
    }
    for (const { p, mats } of tunnelMats) { const inside = s > p.at - 0.6 && s < p.at + p.len + 0.3; for (const m of mats) { m.opacity += ((inside ? 0.35 : 1) - m.opacity) * Math.min(1, raw * 8); m.depthWrite = m.opacity > 0.9; } }

    // 카메라: 출발 전엔 코스 위에서 내려오며 훑고, 달릴 땐 뒤에서 따라가며 경사로·점프 높이를 같이 오른다. 끝나면 앞으로 돌아 보호자와 함께
    const spN = clamp((speed() - 5.2) / 2.4, 0, 1);
    if (!started) {
      const k = clamp(t / 3, 0, 1), e = k * k * (3 - 2 * k);
      wantPos.set(Math.sin(k * 2.2) * 6 * (1 - e), 0.95 + 10 * (1 - e), 2.1 + 20 * (1 - e) - 30 * (1 - e) * Math.sin(k * Math.PI));
      wantLook.set(0, 0.4, -14 + 10 * e);
      camPos.copy(wantPos); camLook.copy(wantLook);
    } else if (ended && lives > 0) {
      // 아이 뒤에서 결승 아치 너머 옆으로 돌아, 보호자 어깨 너머로 아이 얼굴이 보이게(안기는 모습, 11/2 — 아치 앞에선 기둥이 가렸다)
      const k = clamp((t - endT) / 2.2, 0, 1), e = k * k * (3 - 2 * k), mid = -(PET_STOP + 0.25);
      const ph = 2.2 * e, rr = 1.5 + 0.45 * (dog3?.height ?? 0.8);   // 아이·보호자 둘레를 돈다(뒤 → 옆 → 보호자 어깨 너머) — 결승 아치 기둥(±2.3m) 안쪽으로
      wantPos.set(sway * (1 - e) + Math.sin(ph) * rr, 1.0 + 0.2 * e, mid + Math.cos(ph) * rr);
      wantLook.set(sway * (1 - e), 0.55, mid);
      lerpV(camPos, wantPos, raw * 3); lerpV(camLook, wantLook, raw * 4);
    } else {
      const dist = 2.1 - spN * 0.25 - (combo >= 8 ? 0.15 : 0);   // 아이 바로 뒤 — 화면 아래쪽에 크게
      wantPos.set(sway * 0.45, 0.95 + gy * 0.9 + hj * 0.35, -s + dist);
      wantLook.set(sway * 0.75, 0.55 + gy + hj * 0.4, -s - 4);
      lerpV(camPos, wantPos, raw * 6); lerpV(camLook, wantLook, raw * 7);
    }
    shake = Math.max(0, shake - raw * 1.7);
    const sh = shake * shake * 0.12;
    camera.position.set(camPos.x + (r() - 0.5) * sh, camPos.y + (r() - 0.5) * sh, camPos.z);
    camera.fov = 52 + spN * 8 + (combo >= 8 ? 4 : 0); camera.updateProjectionMatrix();
    camera.lookAt(camLook);
    camera.rotateZ((swayTo - sway) * -0.04);
    // 해(그림자 상자)는 아이를 따라간다
    sun.position.set(sway - 6, 14, -s + 6); sun.target.position.set(sway, 0, -s - 2);

    // 화살표 표시
    const next = checks.filter((c) => !c.state).slice(0, 3);
    arrows.forEach((a, i) => {
      const c = next[i];
      a.visible = !!c && started;
      if (!c) return;
      if (a.material.map !== arrowMats[c.dir].map) a.material.map = arrowMats[c.dir].map;
      a.material.opacity = i ? 0.55 : 1;
      const x = c.k === 'weave' ? (c.dir === 'left' ? -0.46 : 0.46) : 0;
      const y = c.k === 'tunnel' ? 1.25 : c.k === 'aframe' ? groundY(c.at + 0.01) + 0.95 : 1.3;
      a.position.set(x, y + Math.sin(t * 5 + i) * 0.04, -c.at);
    });
    // 관중 들썩임 · 깃발 펄럭 · 구름
    arena.update(t, raw, s, combo >= 8 ? 0.5 : 0);
    // 입자
    for (let i = parts3.length - 1; i >= 0; i--) {
      const q = parts3[i]; q.t += raw;
      if (q.t > q.life) { scene.remove(q.s); q.s.material.dispose(); parts3.splice(i, 1); continue; }
      q.v.y += q.grav * raw; q.s.position.addScaledVector(q.v, raw);
      const a = 1 - q.t / q.life; q.s.material.opacity = a; q.s.scale.setScalar(q.size * (1 + (1 - a) * 1.4));
    }
    for (const c of confetti) { c.v.y -= 2.2 * raw; c.v.multiplyScalar(0.99); c.m.position.addScaledVector(c.v, raw); c.m.rotation.x += c.w.x * raw; c.m.rotation.y += c.w.y * raw; c.m.rotation.z += c.w.z * raw; }

    // 화면 효과: 빨간 번쩍(실수)·터널 안 어둑·콤보 불꽃
    el.style.setProperty('--hit', Math.max(0, 0.45 - (t - hitT) * 1.2).toFixed(3));
    el.style.setProperty('--fire', combo >= 8 ? '0.22' : '0');
    renderer.render(scene, camera);
    $life.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $bar.style.width = `${clamp(s / END, 0, 1) * 100}%`;
    $combo.textContent = combo >= 3 ? `${combo >= 8 ? '🔥 ' : ''}${combo} 콤보` : '';
    $combo.classList.toggle('fire', combo >= 8);
    $score.textContent = `${score}점`;
    raf = requestAnimationFrame(frame);
  };
  const cleanup = () => {
    cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('resize', size); clearTimeout(judge.t);
    renderer.dispose(); renderer.forceContextLoss();   // 그래픽을 바로 돌려준다 — 안 하면 판마다 쌓여 브라우저가 방의 움직이는 아이 그래픽까지 끊었다(11/3)
    scene.traverse((o) => { o.geometry?.dispose?.(); });
  };
  raf = requestAnimationFrame(frame);
  return () => { over = true; cleanup(); };
}
