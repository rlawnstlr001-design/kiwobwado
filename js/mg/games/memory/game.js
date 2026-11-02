import { el, createLoop, makeSprite, spriteNode, vibrate } from '../../core/dom.js';
import { MEMORY_CONFIG, createMemoryState, flipCard, stepMemory, timeLeft, memoryResult } from './logic.js';

export const memoryGame = {
  id: 'memory',
  defaultSkin: {
    // 짝 8개. 앱 아이템 그림으로 바꾸면 수집 욕구와 연결된다
    pairs: ['🍎', '🥕', '🍙', '🍓', '🧸', '🎀', '⚽', '🌸'],
  },
  describe: (r) => `${r.matches}쌍 · ${r.moves}번 시도${r.won ? ` · 시간 보너스 +${r.timeBonus}` : ''}`,

  create(stage, ctx) {
    const S = ctx.strings;
    const pairs = ctx.skin.pairs.slice(0, MEMORY_CONFIG.pairs);
    if (pairs.length < MEMORY_CONFIG.pairs) throw new Error(`짝 그림이 ${MEMORY_CONFIG.pairs}개 필요`);
    const sprites = pairs.map((p) => makeSprite(p));
    const state = createMemoryState(ctx.seed, MEMORY_CONFIG);

    const grid = el('div', 'kpg-grid');
    const tiles = state.cards.map((card, i) => {
      const tile = el('button', 'kpg-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', `카드 ${i + 1}`);
      const inner = el('div', 'kpg-tile-in');
      const back = el('div', 'kpg-face kpg-back');
      const front = el('div', 'kpg-face kpg-front');
      front.appendChild(spriteNode(sprites[card.pair]));
      inner.append(back, front);
      tile.appendChild(inner);
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onFlip(i);
      });
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFlip(i);
        }
      });
      grid.appendChild(tile);
      return tile;
    });
    stage.appendChild(grid);

    function render(wrong = []) {
      state.cards.forEach((c, i) => {
        tiles[i].classList.toggle('is-up', c.face === 'up');
        tiles[i].classList.toggle('is-matched', c.face === 'matched');
        tiles[i].classList.toggle('is-wrong', wrong.includes(i));
      });
    }

    let started = false;
    function onFlip(i) {
      if (!started) return;
      const ev = flipCard(state, i);
      if (!ev) return;
      if (ev.type === 'match' || ev.type === 'win') {
        const r = tiles[ev.indexes[1]].getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        ctx.float(`+${MEMORY_CONFIG.matchPoints}`, r.left - s.left + r.width / 2, r.top - s.top, '#2fa36b');
        vibrate(ctx.haptics, 20);
      }
      render(ev.type === 'mismatch' ? ev.indexes : []);
      if (ev.type === 'win') finish();
    }

    const loop = createLoop((dt) => {
      const events = stepMemory(state, dt);
      if (events.some((e) => e.type === 'hide')) render();
      updateHud();
      if (state.over) finish();
    });

    function updateHud() {
      ctx.hud([
        { label: S.score, value: state.matches * MEMORY_CONFIG.matchPoints },
        { label: S.moves, value: state.moves },
        { label: S.time, value: Math.ceil(timeLeft(state)) },
      ]);
    }

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      updateHud();
      loop.stop();
      ctx.end(memoryResult(state));
    }

    render();
    return {
      start() {
        started = true;
        loop.start();
      },
      destroy() {
        loop.destroy();
        grid.remove();
      },
    };
  },
};
