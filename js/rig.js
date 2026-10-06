// 평소 모습 살리기: 정지 그림 한 장(art/sprite/<성향>_<단계>_idle.webp)을 촘촘한 격자로 덮고 부위별로 살짝 휘어 움직인다(Live2D식 변형)
// 부위 = 머리(목 기준 회전)·귀(붙은 자리 기준 회전)·꼬리(뿌리 기준 회전)·가슴(숨)·눈(위아래로 눌러 깜빡임)
// 좌표는 모두 원본 스프라이트 픽셀 기준. 칸 사이가 이어져 있어 부위를 잘라 붙일 때 생기는 틈·겹침이 없다
// 큰 동작(걷기·먹기)은 영상 클립/프레임이 맡고, 여기는 가만히 있을 때만 쓴다

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); const dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
const NX = 72, NY = 100;

export function mountRig(canvas, src, cfg, { cat = false } = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return null;
  const st = { look: 0, pet: 0, petTarget: 0, blink: 0, nextBlink: 1.5, blinkT: -1, flick: [0, 0], nextFlick: 3, tilt: 0, tiltTarget: 0, nextTilt: 4, wag: 0, happy: 0, force: null };
  let W = 0, H = 0, rest, pos, draw, idx, buf, prog, loc, alive = true, ready = false;
  const t0 = performance.now(); let last = t0;
  // 귀가 붙은 자리보다 아래로 늘어진 귀면 바깥으로 들리는 방향이 반대
  const earOut = cfg.ears.map((e, i) => (e.cy > e.py ? 1 : -1) * (i === 0 ? 1 : -1));

  const img = new Image();
  img.onload = () => { if (!alive) return; W = img.width; H = img.height; setup(); ready = true; canvas.dispatchEvent(new Event('rigready')); requestAnimationFrame(frame); };
  img.src = src;

  function setup() {
    const vs = 'attribute vec2 p; attribute vec2 u; uniform vec2 sz; varying vec2 v; void main(){ v=u; vec2 c=p/sz*2.0-1.0; gl_Position=vec4(c.x,-c.y,0,1); }';
    const fs = 'precision mediump float; varying vec2 v; uniform sampler2D tex; void main(){ gl_FragColor=texture2D(tex,v); }';
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); gl.useProgram(prog);
    const n = (NX + 1) * (NY + 1);
    rest = new Float32Array(n * 2); pos = new Float32Array(n * 2); draw = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const k = (j * (NX + 1) + i) * 2;
      rest[k] = (i / NX) * W; rest[k + 1] = (j / NY) * H; uv[k] = i / NX; uv[k + 1] = j / NY;
    }
    const ids = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; ids.push(a, b, c, b, d, c); }
    idx = new Uint16Array(ids);
    const ub = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    const ul = gl.getAttribLocation(prog, 'u'); gl.enableVertexAttribArray(ul); gl.vertexAttribPointer(ul, 2, gl.FLOAT, false, 0, 0);
    buf = gl.createBuffer();
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    loc = { sz: gl.getUniformLocation(prog, 'sz'), p: gl.getAttribLocation(prog, 'p') };
  }

  function deform(t, dt) {
    const c = cfg, f = st.force || {};
    // 깜빡임: 2.5~6초마다. 쓰다듬는 중이면 지그시 감은 눈
    if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      const b = st.blinkT;
      st.blink = b < .09 ? b / .09 : b < .15 ? 1 : b < .3 ? 1 - (b - .15) / .15 : 0;
      if (b >= .3) { st.blinkT = -1; st.nextBlink = t + 2.5 + Math.random() * 3.5; }
    }
    st.pet += (st.petTarget - st.pet) * Math.min(1, dt * 5);
    const close = f.close ?? Math.max(st.blink, st.pet * .82);
    // 귀 쫑긋: 가끔 한쪽씩
    if (t > st.nextFlick) { st.flick[Math.random() < .5 ? 0 : 1] = 1; st.nextFlick = t + 2 + Math.random() * 4; }
    st.flick = st.flick.map((v) => v * Math.exp(-dt * 6));
    // 갸웃: 가끔 고개를 기울였다 돌아옴
    if (t > st.nextTilt) { st.tiltTarget = st.tiltTarget ? 0 : (Math.random() < .5 ? -1 : 1) * .11; st.nextTilt = t + (st.tiltTarget ? 1.6 : 4 + Math.random() * 4); }
    st.tilt += (st.tiltTarget - st.tilt) * Math.min(1, dt * 4);

    const breath = Math.sin(t * Math.PI * 2 / (cat ? 3.6 : 3.2));
    const head = f.head ?? Math.sin(t * Math.PI * 2 / 5.5) * .03 + st.tilt + st.look * .09 - st.pet * .09;
    // 꼬리: 강아지는 빠르게 흔들고(기분 좋으면 더 빠르게), 고양이는 끝을 천천히 살랑
    const period = cat ? 2.4 : st.happy ? .34 : .55;
    st.wag += dt * Math.PI * 2 / period * (1 + st.pet * (cat ? .4 : 1.2));
    const amp = cat ? .1 : .2 + st.pet * .06;
    const tail = (f.tail ?? (cat ? .04 : .12) + Math.sin(st.wag) * amp) * (c.tail?.dir ?? 1);
    const ears = [0, 1].map((i) => earOut[i] * (Math.sin(t * (1.1 + i * .2) + i) * .02 + st.flick[i] * (cat ? .2 : .15) - st.pet * .05));

    const [ncx, ncy] = c.neck, g = c.ground, tl = c.tail;
    for (let k = 0; k < rest.length; k += 2) {
      let x = rest[k], y = rest[k + 1];
      // 눈: 눈 가운데 가로선으로 위아래를 눌러 감는다
      if (close > 0) for (const e of c.eyes) {
        const dx = (x - e[0]) / (e[2] * 1.9), dy = (y - e[1]) / (e[3] * 2.2);
        const d = dx * dx + dy * dy;
        if (d < 1) { const w = (1 - d) * (1 - d); y = e[1] + (y - e[1]) * (1 - close * .95 * w * Math.min(1, 1.6 - Math.abs(dy))); }
      }
      // 귀: 붙은 자리 기준 회전(귀 영역 안에서만)
      for (let i = 0; i < 2; i++) {
        const e = c.ears[i];
        const dx = (x - e.cx) / e.rx, dy = (y - e.cy) / e.ry;
        const w = smooth(1, .55, Math.sqrt(dx * dx + dy * dy));
        if (w > 0) [x, y] = rot(x, y, e.px, e.py, ears[i] * w);
      }
      // 꼬리: 상자 안, 뿌리에서 멀수록 많이 돈다
      if (tl) {
        const [x0, y0, x1, y1] = tl.box;
        const rx = rest[k], ry = rest[k + 1];
        const w = smooth(x0 - 8, x0 + 6, rx) * smooth(x1 + 8, x1 - 6, rx) * smooth(y0 - 8, y0 + 6, ry) * smooth(y1 + 8, y1 - 6, ry)
          * smooth(4, 34, Math.hypot(rx - tl.px, ry - tl.py));
        if (w > 0) [x, y] = rot(x, y, tl.px, tl.py, tail * w);
      }
      // 머리: 목 기준 회전 + 쓰다듬으면 살짝 내려옴 + 커서 쪽으로
      const hw = smooth(c.headBottom, c.headTop, rest[k + 1]);
      if (hw > 0) { [x, y] = rot(x, y, ncx, ncy, head * hw); y += st.pet * 4 * hw; x += st.look * 3 * hw; }
      // 숨: 바닥 기준으로 몸을 아주 살짝 늘였다 줄임, 가슴은 옆으로 조금
      const cw = Math.exp(-(((x - c.chest[0]) / 70) ** 2 + ((y - c.chest[1]) / 80) ** 2));
      y = g + (y - g) * (1 + breath * .012);
      x += (x - c.chest[0]) * breath * .025 * cw;
      pos[k] = x; pos[k + 1] = y;
    }
  }

  function frame(now) {
    if (!alive) return;
    if (!canvas.isConnected) { destroy(); return; }   // 화면이 다시 그려져 캔버스가 빠지면 스스로 정리
    const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!document.hidden && canvas.offsetParent !== null) {
      deform(t, dt);
      const dpr = Math.min(2, devicePixelRatio || 1);
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (cw && ch) {
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        gl.viewport(0, 0, cw, ch);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        const pad = cfg.pad ?? 24;
        gl.uniform2f(loc.sz, W + pad * 2, H + pad);
        for (let k = 0; k < pos.length; k += 2) { draw[k] = pos[k] + pad; draw[k + 1] = pos[k + 1] + pad; }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, draw, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 0, 0);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }
    }
    requestAnimationFrame(frame);
  }

  function destroy() {
    alive = false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  return {
    // 캔버스 가로/세로 비율(위·옆 여백 포함) — 그림이 늦게 오면 0
    aspect: () => (ready ? (W + (cfg.pad ?? 24) * 2) / (H + (cfg.pad ?? 24)) : 0),
    // 원본 그림 높이 대비 캔버스 높이(여백만큼 커짐) → 방 안에서 같은 키로 보이게 맞출 때
    scale: () => (ready ? (H + (cfg.pad ?? 24)) / H : 1),
    look(v) { st.look = Math.max(-1, Math.min(1, v)); },
    pet(on) { st.petTarget = on ? 1 : 0; },
    mood(happy) { st.happy = happy ? 1 : 0; },
    debug(f) { st.force = f; },   // 시험용: {close, tail, head} 고정
    destroy,
  };
}

// 성향_단계 → 부위 좌표(원본 스프라이트 픽셀). 눈 [x, y, 반지름x, 반지름y]
// 귀 {cx, cy, rx, ry: 귀 영역 타원, px, py: 붙은 자리}. 꼬리 {box: [x0, y0, x1, y1], px, py: 뿌리, dir: 끝이 들리는 회전 방향}
export const RIG = {
  small_baby: { ground: 400, neck: [158, 200], headTop: 160, headBottom: 215, chest: [155, 255],
    eyes: [[138, 103, 11, 9], [211, 100, 11, 9]],
    ears: [{ cx: 80, cy: 112, rx: 40, ry: 58, px: 100, py: 68 }, { cx: 262, cy: 108, rx: 40, ry: 58, px: 242, py: 64 }],
    tail: { box: [0, 335, 66, 392], px: 64, py: 364, dir: 1 } },
  small_teen: { ground: 408, neck: [150, 178], headTop: 140, headBottom: 192, chest: [150, 240],
    eyes: [[118, 78, 9, 7], [182, 78, 9, 7]],
    ears: [{ cx: 62, cy: 100, rx: 30, ry: 50, px: 88, py: 55 }, { cx: 228, cy: 100, rx: 30, ry: 50, px: 205, py: 52 }],
    tail: { box: [0, 340, 58, 388], px: 58, py: 365, dir: 1 } },
  small_adult: { ground: 410, neck: [128, 180], headTop: 145, headBottom: 195, chest: [128, 250],
    eyes: [[97, 78, 9, 7], [157, 78, 9, 7]],
    ears: [{ cx: 45, cy: 120, rx: 30, ry: 75, px: 70, py: 50 }, { cx: 210, cy: 120, rx: 30, ry: 75, px: 180, py: 50 }] },
  medium_baby: { ground: 400, neck: [230, 190], headTop: 150, headBottom: 205, chest: [215, 260],
    eyes: [[200, 75, 9, 7], [265, 72, 9, 7]],
    ears: [{ cx: 145, cy: 75, rx: 32, ry: 45, px: 172, py: 38 }, { cx: 315, cy: 65, rx: 28, ry: 42, px: 292, py: 35 }],
    tail: { box: [0, 262, 78, 360], px: 70, py: 352, dir: 1 } },
  medium_teen: { ground: 407, neck: [165, 170], headTop: 128, headBottom: 182, chest: [165, 230],
    eyes: [[141, 63, 8, 6], [190, 63, 8, 6]],
    ears: [{ cx: 110, cy: 30, rx: 30, ry: 32, px: 125, py: 55 }, { cx: 218, cy: 28, rx: 30, ry: 32, px: 195, py: 52 }],
    tail: { box: [0, 295, 76, 378], px: 80, py: 368, dir: 1 } },
  medium_adult: { ground: 410, neck: [80, 180], headTop: 145, headBottom: 195, chest: [80, 250],
    eyes: [[59, 78, 8, 6], [102, 78, 8, 6]],
    ears: [{ cx: 40, cy: 30, rx: 22, ry: 34, px: 50, py: 60 }, { cx: 125, cy: 30, rx: 24, ry: 36, px: 115, py: 62 }],
    tail: { box: [199, 258, 254, 372], px: 196, py: 362, dir: -1 } },
  large_baby: { ground: 395, neck: [230, 175], headTop: 135, headBottom: 190, chest: [230, 250],
    eyes: [[195, 81, 9, 7], [255, 73, 9, 7]],
    ears: [{ cx: 145, cy: 80, rx: 30, ry: 45, px: 165, py: 45 }, { cx: 305, cy: 65, rx: 25, ry: 42, px: 290, py: 35 }],
    tail: { box: [0, 300, 84, 346], px: 86, py: 330, dir: 1 } },
  large_teen: { ground: 410, neck: [210, 150], headTop: 105, headBottom: 162, chest: [205, 230],
    eyes: [[188, 57, 8, 6], [235, 50, 8, 6]],
    ears: [{ cx: 150, cy: 45, rx: 32, ry: 38, px: 172, py: 22 }, { cx: 262, cy: 35, rx: 30, ry: 30, px: 240, py: 18 }],
    tail: { box: [0, 335, 80, 412], px: 84, py: 348, dir: 1 } },
  large_adult: { ground: 405, neck: [240, 140], headTop: 100, headBottom: 152, chest: [240, 230],
    eyes: [[213, 48, 8, 6], [262, 45, 8, 6]],
    ears: [{ cx: 178, cy: 30, rx: 30, ry: 26, px: 200, py: 18 }, { cx: 288, cy: 28, rx: 30, ry: 26, px: 262, py: 15 }],
    tail: { box: [0, 280, 98, 376], px: 100, py: 366, dir: 1 } },
  short_baby: { ground: 400, neck: [200, 190], headTop: 150, headBottom: 205, chest: [200, 260],
    eyes: [[170, 110, 11, 10], [229, 103, 11, 10]],
    ears: [{ cx: 128, cy: 55, rx: 28, ry: 35, px: 140, py: 85 }, { cx: 252, cy: 40, rx: 28, ry: 35, px: 240, py: 75 }],
    tail: { box: [40, 335, 130, 392], px: 58, py: 350, dir: -1 } },
  short_teen: { ground: 410, neck: [215, 170], headTop: 130, headBottom: 182, chest: [205, 250],
    eyes: [[189, 87, 10, 9], [237, 83, 10, 9]],
    ears: [{ cx: 165, cy: 35, rx: 22, ry: 32, px: 175, py: 65 }, { cx: 252, cy: 30, rx: 22, ry: 32, px: 245, py: 60 }],
    tail: { box: [0, 345, 92, 420], px: 90, py: 360, dir: 1 } },
  short_adult: { ground: 405, neck: [188, 170], headTop: 130, headBottom: 182, chest: [188, 250],
    eyes: [[163, 79, 11, 9], [213, 79, 11, 9]],
    ears: [{ cx: 140, cy: 30, rx: 22, ry: 32, px: 150, py: 58 }, { cx: 235, cy: 30, rx: 22, ry: 32, px: 225, py: 58 }],
    tail: { box: [0, 335, 90, 385], px: 92, py: 350, dir: 1 } },
  long_baby: { ground: 405, neck: [195, 205], headTop: 165, headBottom: 220, chest: [195, 280],
    eyes: [[163, 125, 12, 11], [223, 117, 12, 11]],
    ears: [{ cx: 112, cy: 55, rx: 28, ry: 35, px: 125, py: 85 }, { cx: 260, cy: 40, rx: 26, ry: 35, px: 250, py: 75 }],
    tail: { box: [0, 320, 82, 380], px: 82, py: 358, dir: 1 } },
  long_teen: { ground: 405, neck: [212, 175], headTop: 130, headBottom: 188, chest: [212, 260],
    eyes: [[189, 87, 10, 9], [236, 85, 10, 9]],
    ears: [{ cx: 165, cy: 35, rx: 22, ry: 32, px: 178, py: 62 }, { cx: 255, cy: 30, rx: 22, ry: 32, px: 245, py: 60 }],
    tail: { box: [0, 325, 92, 380], px: 95, py: 355, dir: 1 } },
  long_adult: { ground: 405, neck: [142, 170], headTop: 125, headBottom: 182, chest: [142, 260],
    eyes: [[117, 81, 10, 9], [167, 81, 10, 9]],
    ears: [{ cx: 90, cy: 28, rx: 22, ry: 30, px: 100, py: 52 }, { cx: 192, cy: 28, rx: 22, ry: 30, px: 182, py: 52 }],
    tail: { box: [155, 318, 333, 412], px: 300, py: 330, dir: 1 } },
};
