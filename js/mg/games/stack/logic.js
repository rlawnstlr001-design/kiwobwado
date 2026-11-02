// 높이 쌓기: 화면과 분리된 순수 로직.
// 가로 좌표는 화면 너비 = 1. 블록은 왼쪽 끝 l과 너비 w로 표현.

export const STACK_CONFIG = {
  baseWidth: 0.6,
  perfectTolerance: 0.014, // 이 안으로 맞추면 퍼펙트(폭 유지)
  regrowAfterCombo: 3, // 퍼펙트 연속 n번부터 폭 회복
  regrowAmount: 0.03,
  speedStart: 0.55, // 너비/초
  speedGain: 0.035, // 한 층마다
  speedMax: 1.5,
  travel: 0.22, // 화면 밖으로 이만큼 나갔다 돌아옴
};

export function createStackState(config = STACK_CONFIG) {
  const base = { l: (1 - config.baseWidth) / 2, w: config.baseWidth };
  const state = {
    config,
    blocks: [base],
    cur: null,
    score: 0,
    perfects: 0,
    combo: 0,
    maxCombo: 0,
    over: false,
  };
  spawnNext(state);
  return state;
}

function speedFor(state) {
  const { config } = state;
  return Math.min(config.speedMax, config.speedStart + config.speedGain * state.score);
}

function spawnNext(state) {
  const top = state.blocks[state.blocks.length - 1];
  const fromLeft = state.blocks.length % 2 === 1;
  const { travel } = state.config;
  state.cur = {
    l: fromLeft ? -travel : 1 + travel - top.w,
    w: top.w,
    dir: fromLeft ? 1 : -1,
  };
}

export function stepStack(state, dt) {
  if (state.over || !state.cur) return;
  const { travel } = state.config;
  const c = state.cur;
  c.l += c.dir * speedFor(state) * dt;
  const minL = -travel;
  const maxL = 1 + travel - c.w;
  if (c.l > maxL) {
    c.l = maxL - (c.l - maxL);
    c.dir = -1;
  } else if (c.l < minL) {
    c.l = minL + (minL - c.l);
    c.dir = 1;
  }
}

/** 화면 탭. 결과 이벤트 하나를 돌려준다. */
export function dropStack(state) {
  if (state.over || !state.cur) return { type: 'none' };
  const { config } = state;
  const top = state.blocks[state.blocks.length - 1];
  const c = state.cur;

  if (Math.abs(c.l - top.l) <= config.perfectTolerance) {
    state.combo += 1;
    state.perfects += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    let w = top.w;
    let l = top.l;
    if (state.combo >= config.regrowAfterCombo) {
      const grown = Math.min(config.baseWidth, w + config.regrowAmount);
      l -= (grown - w) / 2;
      w = grown;
    }
    l = Math.max(0, Math.min(1 - w, l));
    state.blocks.push({ l, w });
    state.score += 1;
    spawnNext(state);
    return { type: 'perfect', combo: state.combo, block: { l, w } };
  }

  const left = Math.max(c.l, top.l);
  const right = Math.min(c.l + c.w, top.l + top.w);
  const overlap = right - left;
  if (overlap <= 0) {
    state.over = true;
    const miss = { l: c.l, w: c.w };
    state.cur = null;
    return { type: 'miss', cut: miss };
  }

  state.combo = 0;
  const cut = c.l < top.l ? { l: c.l, w: top.l - c.l } : { l: right, w: c.l + c.w - right };
  const block = { l: left, w: overlap };
  state.blocks.push(block);
  state.score += 1;
  spawnNext(state);
  return { type: 'place', block, cut };
}

export function stackResult(state) {
  return { score: state.score, perfects: state.perfects, maxCombo: state.maxCombo };
}
