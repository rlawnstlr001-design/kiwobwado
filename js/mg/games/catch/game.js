import { createLoop, createCanvas, makeSprite, drawSprite, vibrate } from '../../core/dom.js';
import { CATCH_CONFIG, createCatchState, stepCatch, catchResult } from './logic.js';

export const catchGame = {
  id: 'catch',
  // 그림 바꾸기: 이모지 또는 이미지 주소
  defaultSkin: {
    player: null, // null이면 options.character 사용
    food: ['🍎', '🥕', '🍙', '🍓', '🌽'],
    gold: '⭐',
    bomb: '💣',
    heart: '💖',
    skyTop: '#bfe6ff',
    skyBottom: '#fff4dc',
    ground: '#9ed37a',
  },
  describe: (r) => `받은 먹이 ${r.caught}개 · 폭탄 ${r.bombsHit}번`,

  create(stage, ctx) {
    const fx = (name, v) => (ctx.fx ? ctx.fx(name) : vibrate(ctx.haptics, v));   // 앱이 넘긴 효과음·진동(키워봐도될까 11/2), 없으면 웹 진동만
    const cfg = CATCH_CONFIG;
    const S = ctx.strings;
    const skin = ctx.skin;
    const view = createCanvas(stage);
    const sprites = {
      player: makeSprite(skin.player || ctx.character, '🐥'),
      food: skin.food.map((f) => makeSprite(f, '🍎')),
      gold: makeSprite(skin.gold, '⭐'),
      bomb: makeSprite(skin.bomb, '💣'),
      heart: makeSprite(skin.heart, '💖'),
    };
    const state = createCatchState(ctx.seed, cfg);
    let targetX = 0.5;
    let flash = 0;
    let bob = 0;
    const keys = new Set();

    const toX = (e) => {
      const r = view.canvas.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    const onPointer = (e) => {
      if (e.type === 'pointerdown') view.canvas.setPointerCapture?.(e.pointerId);
      if (e.type === 'pointerdown' || e.buttons || e.pointerType === 'touch') targetX = toX(e);
    };
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (e.type === 'keydown') keys.add(e.key);
        else keys.delete(e.key);
        e.preventDefault();
      }
    };
    view.canvas.addEventListener('pointerdown', onPointer);
    view.canvas.addEventListener('pointermove', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    function draw() {
      const { ctx: g, width: W, height: H } = view;
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, skin.skyTop);
      sky.addColorStop(1, skin.skyBottom);
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = skin.ground;
      g.fillRect(0, H * 0.93, W, H * 0.07);

      const itemSize = Math.min(W * cfg.itemWidth * 1.15, H * 0.09);
      for (const it of state.items) {
        const sp = it.kind === 'food' ? sprites.food[it.variant % sprites.food.length] : sprites[it.kind];
        drawSprite(g, sp, it.x * W, it.y * H, itemSize);
      }

      const pSize = Math.min(W * cfg.playerWidth * 1.1, H * 0.13);
      const py = cfg.playerY * H + Math.sin(bob) * 2;
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.beginPath();
      g.ellipse(state.playerX * W, cfg.playerY * H + pSize * 0.45, pSize * 0.4, pSize * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      drawSprite(g, sprites.player, state.playerX * W, py, pSize);

      // 남은 시간 막대
      const left = Math.max(0, 1 - state.t / cfg.duration);
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.fillRect(12, 8, W - 24, 6);
      g.fillStyle = left < 0.2 ? '#e5484d' : '#ff8a3d';
      g.fillRect(12, 8, (W - 24) * left, 6);

      if (flash > 0) {
        g.fillStyle = `rgba(229,72,77,${flash * 0.35})`;
        g.fillRect(0, 0, W, H);
      }
    }

    const loop = createLoop((dt) => {
      if (keys.size) {
        const dir = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        targetX = Math.min(1, Math.max(0, state.playerX + dir * 0.2));
      }
      bob += dt * 10;
      flash = Math.max(0, flash - dt * 2.5);
      const events = stepCatch(state, dt, { targetX });
      for (const ev of events) {
        const x = ev.x * view.width;
        const y = ev.y * view.height - 30;
        if (ev.type === 'catch') { ctx.float(`+${ev.value}`, x, y, ev.kind === 'gold' ? '#d99500' : '#2fa36b'); fx(ev.kind === 'gold' ? 'gold' : 'catch'); }
        if (ev.type === 'heart') { ctx.float('+♥', x, y, '#e5484d'); fx('heart'); }
        if (ev.type === 'bomb') {
          flash = 1;
          ctx.float('−♥', x, y, '#e5484d');
          fx('bomb', 120);
        }
      }
      draw();
      ctx.hud([
        { label: S.score, value: state.score },
        { label: S.lives, value: '♥'.repeat(Math.max(0, state.lives)) || '0' },
        { label: S.time, value: Math.ceil(Math.max(0, cfg.duration - state.t)) },
      ]);
      if (state.over) {
        loop.stop();
        ctx.end(catchResult(state));
      }
    });

    return {
      start: () => loop.start(),
      destroy() {
        loop.destroy();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        view.destroy();
      },
    };
  },
};
