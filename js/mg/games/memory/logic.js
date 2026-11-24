// 짝 맞추기: 화면과 분리된 순수 로직.

import { createRng, shuffle } from '../../core/rng.js';

export const MEMORY_CONFIG = {
  pairs: 8, // 4x4
  duration: 60, // 초
  preview: 4, // 시작 전 모든 카드를 보여 주는 시간(초) — 시간은 그 뒤부터 간다
  mismatchShow: 0.75, // 틀린 두 장을 보여주는 시간
  matchPoints: 10,
  missPoints: 2, // 틀릴 때마다 깎는 점수 — 외우지 않고 마구 눌러도 다 맞춰지던 것(11/10 평균 13,330원)을 막는다
};

export function createMemoryState(seed = 1, config = MEMORY_CONFIG) {
  const rng = createRng(seed);
  const deck = [];
  for (let p = 0; p < config.pairs; p++) deck.push(p, p);
  return {
    config,
    t: 0,
    cards: shuffle(deck, rng).map((pair, i) => ({ id: i, pair, face: 'down' })), // down | up | matched
    open: [], // 지금 뒤집혀 있는(짝 판정 전) 카드 index
    hideAt: null,
    moves: 0,
    matches: 0,
    misses: 0,
    over: false,
    won: false,
  };
}

function hideOpen(state) {
  for (const i of state.open) state.cards[i].face = 'down';
  state.open = [];
  state.hideAt = null;
}

/** 카드 탭. 상태가 바뀌었으면 이벤트를, 무시됐으면 null을 돌려준다. */
export function flipCard(state, index) {
  if (state.over) return null;
  const card = state.cards[index];
  if (!card || card.face !== 'down') return null;

  // 틀린 두 장이 보이는 동안은 누를 수 없다(예전엔 바로 덮고 진행 — 마구 누르기가 공짜였다)
  if (state.hideAt !== null) return null;

  card.face = 'up';
  state.open.push(index);
  if (state.open.length < 2) return { type: 'flip', index };

  state.moves += 1;
  const [a, b] = state.open;
  if (state.cards[a].pair === state.cards[b].pair) {
    state.cards[a].face = 'matched';
    state.cards[b].face = 'matched';
    state.open = [];
    state.matches += 1;
    if (state.matches === state.config.pairs) {
      state.over = true;
      state.won = true;
      return { type: 'win', indexes: [a, b] };
    }
    return { type: 'match', indexes: [a, b] };
  }
  state.misses += 1;
  state.hideAt = state.t + state.config.mismatchShow;
  return { type: 'mismatch', indexes: [a, b] };
}

export function stepMemory(state, dt) {
  const events = [];
  if (state.over) return events;
  state.t += dt;
  if (state.hideAt !== null && state.t >= state.hideAt) {
    const idx = state.open.slice();
    hideOpen(state);
    events.push({ type: 'hide', indexes: idx });
  }
  if (state.t >= state.config.duration) {
    state.over = true;
    events.push({ type: 'timeout' });
  }
  return events;
}

export function timeLeft(state) {
  return Math.max(0, state.config.duration - state.t);
}

export const memoryScore = (state) => Math.max(0, state.matches * state.config.matchPoints - state.misses * (state.config.missPoints || 0));

export function memoryResult(state) {
  const bonus = state.won ? Math.ceil(timeLeft(state)) : 0;
  return {
    score: memoryScore(state) + bonus,
    misses: state.misses,
    matches: state.matches,
    moves: state.moves,
    won: state.won,
    timeBonus: bonus,
  };
}
