// 진입점. 앱에서는 이 파일만 import 하면 된다.
//
//   import { startMiniGame, createRewardTracker } from './minigames/src/index.js';
//   const game = startMiniGame('catch', containerEl, { onReward, onExit, showRewardedAd });
//   // 화면을 떠날 때: game.destroy()

import { runMiniGame } from './core/runner.js';
import { catchGame } from './games/catch/game.js';
import { stackGame } from './games/stack/game.js';
import { memoryGame } from './games/memory/game.js';
import { quizGame } from './games/quiz/game.js';

export const GAMES = {
  catch: catchGame,
  stack: stackGame,
  memory: memoryGame,
  quiz: quizGame,
};

export const GAME_IDS = Object.keys(GAMES);

export function startMiniGame(id, container, options) {
  const def = GAMES[id];
  if (!def) throw new Error(`없는 미니게임: ${id} (가능: ${GAME_IDS.join(', ')})`);
  return runMiniGame(def, container, options);
}

export { createRewardTracker, REWARD_RULES, computeReward, dateKey } from './core/rewards.js';
export { createLocalStorage, createMemoryStorage } from './core/storage.js';
export { STRINGS_KO } from './core/strings.js';
export { QUESTIONS_KO } from './games/quiz/questions.ko.js';
