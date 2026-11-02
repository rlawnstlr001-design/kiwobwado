// 점수 → 보상 변환과 하루 보상 횟수 제한.
// 숫자는 출발점일 뿐이다. 앱의 재화 경제(먹이 1개 값, 상점 가격)에 맞춰 REWARD_RULES만 고치면 된다.
// 주의: 이 제한은 기기 안에서만 동작한다. 재화가 결제와 엮이면 서버에서 다시 검증해야 한다.

import { createLocalStorage } from './storage.js';

export const REWARD_RULES = {
  catch: {
    dailyRewardedPlays: 5,
    compute: (r) => ({ food: Math.min(r.score, 30), coins: Math.floor(r.score / 4) }),
  },
  stack: {
    dailyRewardedPlays: 5,
    compute: (r) => ({ coins: Math.min(r.score + (r.perfects || 0), 40) }),
  },
  memory: {
    dailyRewardedPlays: 5,
    compute: (r) => ({ coins: Math.floor(r.score / 5), exp: r.matches || 0 }),
  },
  quiz: {
    dailyRewardedPlays: 1,
    compute: (r) => ({ coins: (r.correct || 0) * 5, exp: (r.correct || 0) * 2 }),
  },
};

export const REWARD_KEYS = ['coins', 'food', 'exp'];

function normalize(reward) {
  const out = {};
  for (const k of REWARD_KEYS) {
    const v = Math.max(0, Math.floor(Number(reward?.[k]) || 0));
    if (v > 0) out[k] = v;
  }
  return out;
}

export function isEmptyReward(reward) {
  return Object.keys(normalize(reward)).length === 0;
}

export function computeReward(gameId, result, rules = REWARD_RULES) {
  const rule = rules[gameId];
  if (!rule) throw new Error(`보상 규칙이 없는 게임: ${gameId}`);
  return normalize(rule.compute(result));
}

export function scaleReward(reward, k) {
  const out = {};
  for (const [key, v] of Object.entries(reward)) out[key] = Math.floor(v * k);
  return normalize(out);
}

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function createRewardTracker({
  storage = createLocalStorage(),
  rules = REWARD_RULES,
  now = () => new Date(),
} = {}) {
  function readCounts() {
    const today = dateKey(now());
    try {
      const saved = JSON.parse(storage.get('daily') || 'null');
      if (saved && saved.date === today) return saved;
    } catch {
      /* 깨진 값이면 새로 시작 */
    }
    return { date: today, counts: {} };
  }

  function remaining(gameId) {
    const limit = rules[gameId]?.dailyRewardedPlays ?? 0;
    const used = readCounts().counts[gameId] || 0;
    return Math.max(0, limit - used);
  }

  function peek(gameId, result) {
    const capped = remaining(gameId) <= 0;
    return { reward: capped ? {} : computeReward(gameId, result, rules), capped };
  }

  // 보상을 실제로 지급할 때 한 번만 호출. 지급하지 않을 판에는 호출하지 않는다.
  function claim(gameId, result, { doubled = false } = {}) {
    const { reward, capped } = peek(gameId, result);
    if (capped || isEmptyReward(reward)) return { reward: {}, capped, doubled: false };
    const data = readCounts();
    data.counts[gameId] = (data.counts[gameId] || 0) + 1;
    storage.set('daily', JSON.stringify(data));
    return { reward: doubled ? scaleReward(reward, 2) : reward, capped: false, doubled };
  }

  function getBest(gameId) {
    return Number(storage.get(`best:${gameId}`)) || 0;
  }

  function submitBest(gameId, score) {
    const prev = getBest(gameId);
    if (score > prev) {
      storage.set(`best:${gameId}`, String(score));
      return true;
    }
    return false;
  }

  return { remaining, peek, claim, getBest, submitBest };
}
