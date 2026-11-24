import { el, createLoop, makeSprite, spriteNode, vibrate } from '../../core/dom.js';
import { MEMORY_CONFIG, createMemoryState, flipCard, stepMemory, timeLeft, memoryResult, memoryScore } from './logic.js';

export const memoryGame = {
  id: 'memory',
  defaultSkin: {
    // 짝 8개. 앱 아이템 그림으로 바꾸면 수집 욕구와 연결된다
    pairs: ['🍎', '🥕', '🍙', '🍓', '🧸', '🎀', '⚽', '🌸'],
  },
  describe: (r) => `${r.matches}쌍 · ${r.moves}번 시도${r.misses ? ` · 틀림 ${r.misses}번(−${r.misses * MEMORY_CONFIG.missPoints})` : ''}${r.won ? ` · 시간 보너스 +${r.timeBonus}` : ''}`,

  create(stage, ctx) {
    const fx = (name, v) => (ctx.fx ? ctx.fx(name) : vibrate(ctx.haptics, v));   // 앱이 넘긴 효과음·진동(키워봐도될까 11/2), 없으면 웹 진동만
    const S = ctx.strings;
    const pairs = ctx.skin.pairs.slice(0, MEMORY_CONFIG.pairs);
    if (pairs.length < MEMORY_CONFIG.pairs) throw new Error(`짝 그림이 ${MEMORY_CONFIG.pairs}개 필요`);
    // 짝 그림은 이모지·그림 주소, 또는 {a, b}(서로 다른 두 면 — 예: 위험 음식 ↔ 그 이유, 키워봐도될까 11/2). a·b = 문자열 또는 {icon, text}
    const sprites = pairs.map((p) => (typeof p === 'object' ? null : makeSprite(p)));
    const seenPair = new Set();
    const faceOf = (pair) => {
      const p = pairs[pair];
      if (typeof p !== 'object') return spriteNode(sprites[pair]);
      const side = seenPair.has(pair) ? p.b : p.a; seenPair.add(pair);
      const f = typeof side === 'object' ? side : { text: side };
      const box = el('div', 'kpg-fcard');
      if (f.icon) box.appendChild(el('span', 'kpg-ficon', f.icon));
      if (f.text) box.appendChild(el('span', 'kpg-ftext', f.text));
      return box;
    };
    const state = createMemoryState(ctx.seed, MEMORY_CONFIG);

    const grid = el('div', 'kpg-grid');
    const tiles = state.cards.map((card, i) => {
      const tile = el('button', 'kpg-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', `카드 ${i + 1}`);
      const inner = el('div', 'kpg-tile-in');
      const back = el('div', 'kpg-face kpg-back');
      const front = el('div', 'kpg-face kpg-front');
      front.appendChild(faceOf(card.pair));
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

    let started = false, peek = null;
    function onFlip(i) {
      if (!started) return;
      const ev = flipCard(state, i);
      if (!ev) return;
      if (ev.type === 'match' || ev.type === 'win') {
        const r = tiles[ev.indexes[1]].getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        const why = pairs[state.cards[ev.indexes[1]].pair]?.why;   // 짝에 이유가 있으면(위험 음식) 점수 대신 이유를 띄운다
        ctx.float(why ? `⚠️ ${why}` : `+${MEMORY_CONFIG.matchPoints}`, r.left - s.left + r.width / 2, r.top - s.top, why ? '#c0392b' : '#2fa36b');
        fx(ev.type === 'win' ? 'win' : 'match', 20);
      } else {
        fx(ev.type === 'mismatch' ? 'mismatch' : 'flip');
        if (ev.type === 'mismatch' && MEMORY_CONFIG.missPoints) { const r = tiles[ev.indexes[1]].getBoundingClientRect(), s = stage.getBoundingClientRect(); ctx.float(`−${MEMORY_CONFIG.missPoints}`, r.left - s.left + r.width / 2, r.top - s.top, '#c0392b'); }
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
        { label: S.score, value: memoryScore(state) },
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
        // 처음엔 모든 카드를 앞면으로 보여 주고(외우는 시간), 덮은 뒤부터 시간이 간다
        const sec = MEMORY_CONFIG.preview || 0;
        tiles.forEach((t) => t.classList.add('is-up'));
        ctx.hud([{ label: S.time, value: '외워요' }, { label: S.score, value: 0 }, { label: S.moves, value: 0 }]);
        peek = setTimeout(() => { peek = null; render(); started = true; loop.start(); }, sec * 1000);
      },
      destroy() {
        if (peek) clearTimeout(peek);
        loop.destroy();
        grid.remove();
      },
    };
  },
};
