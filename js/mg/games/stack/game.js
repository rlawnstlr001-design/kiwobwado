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
        vibrate(ctx.haptics, 15);
      }
      if (ev.type === 'miss') {
        vibrate(ctx.haptics, [60, 40, 60]);
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

    function drawBlock(g, b, i, y, W, blockH) {
      g.fillStyle = color(i);
      g.fillRect(b.l * W, y, b.w * W, blockH);
      g.fillStyle = shade(i);
      g.fillRect(b.l * W, y + blockH * 0.78, b.w * W, blockH * 0.22);
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
        drawBlock(g, f, f.color, levelY(f.level, baseY, blockH) + f.y, W, blockH);
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
        g.fillText('화면을 눌러 떨어뜨리기', W / 2, H * 0.3);
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
