// 먹이 받기: 화면과 분리된 순수 로직.
// 좌표는 0~1 비율. x는 화면 너비 기준, y는 화면 높이 기준(0=위, 1=아래).

import { createRng, pickWeighted } from '../../core/rng.js';

export const CATCH_CONFIG = {
  duration: 45, // 초
  lives: 3,
  playerY: 0.86,
  playerWidth: 0.18,
  itemWidth: 0.09,
  playerMaxSpeed: 3.2, // 너비/초. 손가락을 순간이동처럼 따라가지 않게
  spawnStart: 0.85, // 초 간격
  spawnMin: 0.32,
  fallStart: 0.32, // 높이/초
  fallGainPerSec: 0.009,
  items: [
    { kind: 'food', value: 1, weight: 64 },
    { kind: 'gold', value: 3, weight: 8 },
    { kind: 'bomb', value: 0, weight: 24 },
    { kind: 'heart', value: 0, weight: 4 },
  ],
  foodVariants: 5,
};

export function createCatchState(seed = 1, config = CATCH_CONFIG) {
  return {
    config,
    rng: createRng(seed),
    t: 0,
    score: 0,
    caught: 0,
    bombsHit: 0,
    lives: config.lives,
    playerX: 0.5,
    items: [],
    nextId: 1,
    spawnIn: 0.4,
    over: false,
  };
}

function difficulty(state) {
  return Math.min(1, state.t / state.config.duration);
}

function spawn(state) {
  const { config, rng } = state;
  let type = pickWeighted(config.items, rng);
  // 목숨이 가득이면 하트 대신 먹이
  if (type.kind === 'heart' && state.lives >= config.lives) type = config.items[0];
  const half = config.itemWidth / 2;
  state.items.push({
    id: state.nextId++,
    kind: type.kind,
    value: type.value,
    variant: Math.floor(rng() * config.foodVariants),
    x: half + rng() * (1 - config.itemWidth),
    y: -0.05,
    speed: (config.fallStart + config.fallGainPerSec * state.t) * (0.85 + rng() * 0.3),
  });
}

/**
 * 한 프레임 진행. 일어난 일을 events 배열로 돌려준다(화면 효과·진동용).
 * @param {{targetX?: number}} input targetX는 0~1
 */
export function stepCatch(state, dt, input = {}) {
  const events = [];
  if (state.over) return events;
  const { config } = state;
  state.t += dt;

  if (typeof input.targetX === 'number') {
    const half = config.playerWidth / 2;
    const target = Math.min(1 - half, Math.max(half, input.targetX));
    const maxMove = config.playerMaxSpeed * dt;
    const diff = target - state.playerX;
    state.playerX += Math.max(-maxMove, Math.min(maxMove, diff));
  }

  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    spawn(state);
    const gap = config.spawnStart - (config.spawnStart - config.spawnMin) * difficulty(state);
    state.spawnIn += gap;
  }

  const reach = (config.playerWidth + config.itemWidth) / 2 * 0.8;
  const top = config.playerY - 0.06;
  const bottom = config.playerY + 0.05;
  const kept = [];
  for (const it of state.items) {
    const prevY = it.y;
    it.y += it.speed * dt;
    const crossed = prevY <= bottom && it.y >= top; // 빠르게 지나가도 놓치지 않게
    if (crossed && Math.abs(it.x - state.playerX) < reach) {
      if (it.kind === 'bomb') {
        state.lives -= 1;
        state.bombsHit += 1;
        events.push({ type: 'bomb', x: it.x, y: config.playerY });
      } else if (it.kind === 'heart') {
        state.lives = Math.min(config.lives, state.lives + 1);
        events.push({ type: 'heart', x: it.x, y: config.playerY });
      } else {
        state.score += it.value;
        state.caught += 1;
        events.push({ type: 'catch', kind: it.kind, value: it.value, x: it.x, y: config.playerY });
      }
      continue;
    }
    if (it.y < 1.08) kept.push(it);
  }
  state.items = kept;

  if (state.lives <= 0 || state.t >= config.duration) {
    state.over = true;
    events.push({ type: 'end', reason: state.lives <= 0 ? 'lives' : 'time' });
  }
  return events;
}

export function catchResult(state) {
  return { score: state.score, caught: state.caught, bombsHit: state.bombsHit, lives: state.lives };
}
