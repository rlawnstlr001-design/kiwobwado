import { createLoop, createCanvas, makeSprite, drawSprite, vibrate } from '../../core/dom.js';
import { STACK_CONFIG, createStackState, stepStack, dropStack, stackResult } from './logic.js';

export const stackGame = {
  id: 'stack',
  defaultSkin: {
    player: null, // 맨 위에 올라타는 캐릭터. null이면 options.character
    hueStart: 24, // 블록 색 (HSL 색상각)
    hueStep: 11,
    bgTop: '#ffe9d1',
    bgBottom: '#fff8ef',
  },
  describe: (r) => `퍼펙트 ${r.perfects}번 · 최대 콤보 ${r.maxCombo}`,

  create(stage, ctx) {
    const fx = (name, v) => (ctx.fx ? ctx.fx(name) : vibrate(ctx.haptics, v));   // 앱이 넘긴 효과음·진동(키워봐도될까 11/2), 없으면 웹 진동만
    const S = ctx.strings;
    const skin = ctx.skin;
    const view = createCanvas(stage);
    const player = makeSprite(skin.player || ctx.character, '🐥');
    const state = createStackState(STACK_CONFIG);
    const falling = []; // 잘려 떨어지는 조각 (화면 효과만)
    let cam = 0; // 카메라가 따라 올라간 층 수
    let landed = 0; // 캐릭터 착지 애니메이션
    let gameOverAt = null;

    const color = (i) => `hsl(${(skin.hueStart + i * skin.hueStep) % 360} 75% 62%)`;
    const shade = (i) => `hsl(${(skin.hueStart + i * skin.hueStep) % 360} 60% 48%)`;

    const tap = (e) => {
      if (e) e.preventDefault();
      if (state.over) return;
      const ev = dropStack(state);
      const n = state.blocks.length - 1;
      if (ev.cut) falling.push({ ...ev.cut, level: ev.type === 'miss' ? n + 1 : n, vy: 0, y: 0, color: ev.type === 'miss' ? n + 1 : n });
      if (ev.type === 'perfect') {
        const { W, blockH, baseY } = metrics();
        ctx.float(`${S.perfect}${ev.combo > 1 ? ` ×${ev.combo}` : ''}`, (ev.block.l + ev.block.w / 2) * W, levelY(n, baseY, blockH) - 20, '#ff8a3d');
        fx('perfect', 15);
      } else if (ev.type !== 'miss') fx('drop');
      if (ev.type === 'miss') {
        fx('miss', [60, 40, 60]);
        gameOverAt = performance.now();
      }
      landed = 1;
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === 'Enter') tap(e);
    };
    view.canvas.addEventListener('pointerdown', tap);
    window.addEventListener('keydown', onKey);

    function metrics() {
      const W = view.width;
      const H = view.height;
      const blockH = Math.max(22, Math.min(W * 0.075, H * 0.06));
      const baseY = H - blockH * 1.5; // 바닥 블록의 윗면
      return { W, H, blockH, baseY };
    }
    // i층 블록의 윗면 y (카메라 반영)
    const levelY = (i, baseY, blockH) => baseY - (i - cam) * blockH;

    // 캣타워 층(키워봐도될까 11/2 사용자 "캣타워로 바꾸자"): 위 50% = 카펫 받침(둥근 모서리), 아래 50% = 가운데 스크래처 기둥(사이잘 줄무늬).
    // 바닥(0층)은 넓은 받침판. 잘려 떨어지는 조각은 받침만. skin.tower = false면 원래 색 블록
    function drawBlock(g, b, i, y, W, blockH, piece = false) {
      if (skin.tower === false) {
        g.fillStyle = color(i); g.fillRect(b.l * W, y, b.w * W, blockH);
        g.fillStyle = shade(i); g.fillRect(b.l * W, y + blockH * 0.78, b.w * W, blockH * 0.22);
        return;
      }
      const x = b.l * W, w = b.w * W, padH = i === 0 ? blockH : blockH * 0.5, r = Math.min(8, padH / 2, w / 2);
      if (i > 0 && !piece) {   // 기둥: 받침 아래, 아래층 받침까지
        const pw = Math.max(10, Math.min(w * 0.32, blockH * 1.1)), px = x + w / 2 - pw / 2, py = y + padH, ph = blockH - padH;
        g.fillStyle = '#C9A26B'; g.fillRect(px, py, pw, ph);
        g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
        g.strokeStyle = 'rgba(120,84,40,.45)'; g.lineWidth = 1.2;
        for (let k = -ph; k < pw; k += 5) { g.beginPath(); g.moveTo(px + k, py + ph); g.lineTo(px + k + ph, py); g.stroke(); }   // 사이잘 줄(기둥 안만)
        g.restore();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(px + pw * 0.72, py, pw * 0.28, ph);
      }
      const pal = skin.pads || ['#E9DDCB', '#B9C7D6', '#E3C4B3', '#C8D3B8'];
      g.fillStyle = i === 0 ? '#A98767' : pal[i % pal.length];
      g.beginPath(); g.roundRect(x, y, w, padH, r); g.fill();
      g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(x + r / 2, y + padH * 0.72, w - r, padH * 0.28);   // 받침 옆면 그늘
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + r, y + 2, w - 2 * r, Math.max(1.5, padH * 0.12));   // 카펫 윗면 빛
    }

    function draw(dt) {
      const { ctx: g } = view;
      const { W, H, blockH, baseY } = metrics();
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, skin.bgTop);
      bg.addColorStop(1, skin.bgBottom);
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // 화면 위쪽 40% 지점까지 쌓이면 카메라가 따라 올라감
      const visibleLevels = (baseY - H * 0.4) / blockH;
      const targetCam = Math.max(0, state.blocks.length - visibleLevels);
      cam += (targetCam - cam) * Math.min(1, dt * 6);

      state.blocks.forEach((b, i) => {
        const y = levelY(i, baseY, blockH);
        if (y > H + blockH || y < -blockH * 2) return;
        drawBlock(g, b, i, y, W, blockH);
      });

      const n = state.blocks.length;
      if (state.cur) drawBlock(g, state.cur, n, levelY(n, baseY, blockH), W, blockH);

      for (const f of falling) {
        f.vy += 1600 * dt;
        f.y += f.vy * dt;
        g.globalAlpha = Math.max(0, 1 - f.y / H);
        drawBlock(g, f, f.color, levelY(f.level, baseY, blockH) + f.y, W, blockH, true);
        g.globalAlpha = 1;
      }
      while (falling.length && falling[0].y > H) falling.shift();

      // 캐릭터: 맨 위 블록에 올라탐
      const topB = state.blocks[n - 1];
      const size = blockH * 1.7;
      landed = Math.max(0, landed - dt * 5);
      const squash = 1 - landed * 0.15;
      const cx = (topB.l + topB.w / 2) * W;
      const cy = levelY(n - 1, baseY, blockH) - (size * squash) / 2 + 2;
      drawSprite(g, player, cx, cy, size * squash);

      if (n === 1 && !state.over) {
        g.fillStyle = 'rgba(43,33,24,.55)';
        g.font = '700 16px sans-serif';
        g.textAlign = 'center';
        g.fillText(skin.hint || '화면을 눌러 떨어뜨리기', W / 2, H * 0.3);
      }
    }

    const loop = createLoop((dt) => {
      stepStack(state, dt);
      draw(dt);
      ctx.hud([
        { label: S.score, value: state.score },
        { label: S.combo, value: state.combo },
      ]);
      if (state.over && gameOverAt && performance.now() - gameOverAt > 700) {
        loop.stop();
        ctx.end(stackResult(state));
      }
    });

    return {
      start: () => loop.start(),
      destroy() {
        loop.destroy();
        window.removeEventListener('keydown', onKey);
        view.destroy();
      },
    };
  },
};
