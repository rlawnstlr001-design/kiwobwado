// 소리 — 녹음 파일 없이 Web Audio로 만든다(받을 파일·저작권 없음, 용량 0)
// 효과음(sfx)과 배경음(amb)을 따로 켜고 끈다(이 기기에만 저장). 브라우저 규칙상 첫 터치 뒤에야 소리가 난다
// 쓰는 곳: app.js(버튼·코인·사건·자랐어요), room.js(밥 붓기·오도독·골골·헥헥·발소리·현관·하트·낑낑/야옹)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } };

let ctx = null, master = null, noiseBuf = null, brownBuf = null;
const on = { sfx: lsGet('kiwo:sfx') !== '0', amb: lsGet('kiwo:amb') !== '0' };
const VOL = { sfx: 0.5, amb: 0.35 };
let ambNodes = null, ambTod = null, birdTimer = 0;

export const soundOn = (kind) => on[kind];
export function setSound(kind, v) {
  on[kind] = v;
  lsSet(`kiwo:${kind}`, v ? '1' : '0');
  if (kind === 'amb') { if (v) ambient(ambTod); else stopAmbient(); }
}

// 첫 터치에서 오디오를 깨운다(그 전엔 아무 소리도 안 낸다)
function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  // 하얀 소음 2초(바삭·딸깍), 갈색 소음 4초(방 공기·골골)
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const w = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
  const m = ctx.sampleRate * 4;
  brownBuf = ctx.createBuffer(1, m, ctx.sampleRate);
  const b = brownBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < m; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  if (ambTod) ambient(ambTod);
}
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });
// 앱이 뒤로 가면 소리를 멈춘다
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

const ready = (kind = 'sfx') => ctx && ctx.state === 'running' && on[kind];
const out = (vol, kind = 'sfx') => { const g = ctx.createGain(); g.gain.value = vol * VOL[kind]; g.connect(master); return g; };

// 짧은 음: 주파수 f0→f1, 길이 dur(초)
function tone(f0, f1, dur, { type = 'sine', vol = 0.3, at = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = out(0);
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * VOL.sfx, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  o.start(t); o.stop(t + dur + 0.02);
}
// 소음 한 번: 띠(bp) 주파수·Q로 소리 색을 정한다
function burst(dur, { bp = 3000, q = 1, vol = 0.3, at = 0, hp = 0 } = {}) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q;
  let tail = f;
  if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); tail = h; }
  const g = out(0);
  g.gain.setValueAtTime(vol * VOL.sfx, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); tail.connect(g);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}

// ---------- 효과음 ----------
export const sfx = {
  tap() { if (ready()) tone(900, 520, 0.05, { vol: 0.18 }); },
  coin() { if (!ready()) return; tone(1319, 1319, 0.09, { type: 'triangle', vol: 0.25 }); tone(1976, 1976, 0.22, { type: 'triangle', vol: 0.25, at: 0.08 }); },
  pop() { if (ready()) tone(620, 1240, 0.08, { vol: 0.14 }); },
  ding() { if (!ready()) return; tone(1047, 1047, 0.5, { vol: 0.16 }); tone(1568, 1568, 0.6, { vol: 0.1, at: 0.09 }); },
  fanfare() { if (!ready()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.32, { type: 'triangle', vol: 0.18, at: i * 0.11 })); },
  // 패드 갈기·모래 치우기: 사각사각
  rustle() { if (!ready()) return; for (let i = 0; i < 7; i++) burst(0.07, { bp: 1600 + Math.random() * 1400, q: 0.8, vol: 0.22, at: i * 0.09 + Math.random() * 0.03 }); },
  // 약욕: 거품 보글보글
  bubbles() { if (!ready()) return; for (let i = 0; i < 9; i++) { const f = 500 + Math.random() * 700; tone(f, f * 1.8, 0.06, { vol: 0.08, at: i * 0.12 + Math.random() * 0.05 }); } },
  door() { if (!ready()) return; tone(110, 70, 0.25, { vol: 0.35, attack: 0.01 }); burst(0.12, { bp: 400, q: 0.7, vol: 0.2 }); },
  // 사료 붓기: 알갱이가 그릇에 떨어지는 딸깍 40번(점점 뜸해짐)
  pour() { if (!ready()) return; for (let i = 0; i < 40; i++) burst(0.025, { bp: 3500 + Math.random() * 2500, q: 4, vol: 0.3 + Math.random() * 0.15, at: Math.pow(i / 40, 1.6) * 0.75 }); },
  // 오도독: 서너 번 씹고 쉬기를 dur초 동안
  crunch(dur = 3) {
    if (!ready()) return () => {};
    let t = 0.1;
    while (t < dur) {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n && t < dur; i++) { burst(0.045, { bp: 1800 + Math.random() * 1600, q: 1.2, vol: 0.42, at: t }); burst(0.03, { bp: 350, q: 1, vol: 0.22, at: t }); t += 0.13 + Math.random() * 0.06; }
      t += 0.35 + Math.random() * 0.3;
    }
    return () => {};
  },
  // 걷는 발소리(강아지 발톱이 마룻바닥에 톡톡). 고양이는 조용히 걷는다
  steps(ms, every = 0.24) { if (!ready()) return; for (let t = 0; t < ms / 1000; t += every) burst(0.012, { bp: 4500, q: 2, vol: 0.09, at: t + Math.random() * 0.03 }); },
  // 배고프다고 부르기: 강아지 '낑' / 고양이 '야옹'(합성이라 실제 목소리와 다르다)
  call(species) {
    if (!ready()) return;
    const t = ctx.currentTime;
    if (species === 'dog') {
      const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = out(0);
      o.frequency.setValueAtTime(760, t); o.frequency.linearRampToValueAtTime(1150, t + 0.18); o.frequency.linearRampToValueAtTime(820, t + 0.55);
      v.frequency.value = 7; vg.gain.value = 18; v.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * VOL.sfx, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); o.start(t); v.start(t); o.stop(t + 0.62); v.stop(t + 0.62);
    } else {
      // 톱니파 + 두 개의 공명(입 모양)이 '이→아→오'로 움직인다
      const o = ctx.createOscillator(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = out(0);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(560, t); o.frequency.linearRampToValueAtTime(820, t + 0.16); o.frequency.linearRampToValueAtTime(520, t + 0.5);
      for (const [f, a, b, c] of [[f1, 2600, 1400, 900], [f2, 3400, 2600, 2000]]) {
        f.type = 'bandpass'; f.Q.value = 6;
        f.frequency.setValueAtTime(a, t); f.frequency.linearRampToValueAtTime(b, t + 0.22); f.frequency.linearRampToValueAtTime(c, t + 0.5);
        o.connect(f); f.connect(g);
      }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * VOL.sfx, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.start(t); o.stop(t + 0.57);
    }
  },
};

// 쓰다듬는 동안 이어지는 소리: 고양이 골골(낮은 소음을 초당 25번 떨게, 숨 쉬듯 커졌다 작아짐) / 강아지 헥헥
let loopNodes = null;
export function petLoop(species, playing) {
  if (!playing) {
    if (loopNodes && ctx) { const { g, srcs } = loopNodes; const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.15); setTimeout(() => srcs.forEach((s) => { try { s.stop(); } catch { /* 이미 멈춤 */ } }), 600); }
    loopNodes = null;
    return;
  }
  if (loopNodes || !ready()) return;
  const t = ctx.currentTime;
  const g = out(0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setTargetAtTime(VOL.sfx, t, 0.25);
  const s = ctx.createBufferSource(); s.buffer = species === 'cat' ? brownBuf : noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter();
  const am = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  if (species === 'cat') {
    f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.8;
    lfo.frequency.value = 25; depth.gain.value = 0.22; am.gain.value = 0.26;
  } else {
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.9;
    lfo.frequency.value = 3.2; depth.gain.value = 0.07; am.gain.value = 0.07;
  }
  lfo.connect(depth); depth.connect(am.gain);
  // 숨: 2.4초마다 커졌다 작아짐(골골은 내쉴 때 더 크다)
  const breath = ctx.createOscillator(), bd = ctx.createGain();
  breath.frequency.value = species === 'cat' ? 1 / 2.4 : 0; bd.gain.value = species === 'cat' ? 0.1 : 0;
  breath.connect(bd); bd.connect(am.gain);
  s.connect(f); f.connect(am); am.connect(g);
  s.start(t); lfo.start(t); breath.start(t);
  loopNodes = { g, srcs: [s, lfo, breath] };
}

// ---------- 배경음: 방 공기(아주 작은 갈색 소음) + 아침·낮엔 가끔 창밖 새소리 ----------
export function ambient(tod) {
  ambTod = tod;
  if (!ctx || !on.amb) return;
  if (!ambNodes) {
    const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = out(0, 'amb');
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.setTargetAtTime(0.05 * VOL.amb, ctx.currentTime, 1.2);
    s.connect(f); f.connect(g); s.start();
    ambNodes = { s, g };
  }
  clearTimeout(birdTimer);
  const bird = () => {
    if (!ambNodes || !on.amb || !['morning', 'day'].includes(ambTod)) return;
    if (ctx.state === 'running') {
      // 짧게 두세 번 '삐릿'
      const n = 2 + Math.floor(Math.random() * 3), base = 3200 + Math.random() * 1200;
      for (let i = 0; i < n; i++) {
        const at = i * (0.11 + Math.random() * 0.05), t = ctx.currentTime + at;
        const o = ctx.createOscillator(), g = out(0, 'amb');
        o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
        o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 * VOL.amb, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g); o.start(t); o.stop(t + 0.1);
      }
    }
    birdTimer = setTimeout(bird, 7000 + Math.random() * 12000);
  };
  birdTimer = setTimeout(bird, 3000 + Math.random() * 5000);
}
export function stopAmbient() {
  clearTimeout(birdTimer);
  if (ambNodes && ctx) { const { s, g } = ambNodes; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); setTimeout(() => { try { s.stop(); } catch { /* 이미 멈춤 */ } }, 1500); }
  ambNodes = null;
}
// 점검용(소리를 못 듣는 환경에서 출력 크기 재기)
export const _debug = () => ({ ctx, master });
