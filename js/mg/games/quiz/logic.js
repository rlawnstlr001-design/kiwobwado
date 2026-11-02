// 오늘의 OX 퀴즈: 화면과 분리된 순수 로직.
// 날짜로 문제를 고르므로 같은 날에는 모든 사용자가 같은 문제를 받는다.
// 문제 은행: questions.ko.js (자동 생성 파일, 원본은 questions/ 폴더의 분야별 JSON)

import { createRng, hashString, shuffle } from '../../core/rng.js';

export const QUIZ_CONFIG = {
  count: 5,
  secondsPerQuestion: 12,
};

// 날짜 → 일련번호 (2026-01-01 = 0). 시간대와 무관하게 'YYYY-MM-DD' 문자열만 본다.
export function dayIndex(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
}

/**
 * 오늘의 문제. 문제 은행을 고정 시드로 한 번 섞어 두고 날짜 순서대로 count개씩 꺼낸다.
 * → 문제 수 ÷ count 일 동안(1000문제면 200일) 같은 문제가 다시 나오지 않는다.
 * 문제를 추가·삭제하면 순서가 새로 섞이므로, 출시 후에는 문제를 모아서 가끔 한 번에 바꾸는 게 좋다.
 */
export function pickDailyQuestions(bank, day, count = QUIZ_CONFIG.count) {
  if (bank.length < count) throw new Error(`문제가 ${count}개보다 적음`);
  const order = shuffle(
    bank.map((_, i) => i),
    createRng(hashString(`ox-order:${bank.length}`)),
  );
  const n = bank.length;
  const start = (((dayIndex(day) * count) % n) + n) % n;
  return Array.from({ length: count }, (_, i) => bank[order[(start + i) % n]]);
}

export function createQuizState(bank, day, config = QUIZ_CONFIG) {
  return {
    config,
    day,
    questions: pickDailyQuestions(bank, day, config.count),
    index: 0,
    phase: 'ask', // ask | reveal | done
    timeLeft: config.secondsPerQuestion,
    answers: [], // { choice: true|false|null, correct: boolean }
    correct: 0,
    over: false,
  };
}

export function currentQuestion(state) {
  return state.questions[state.index] || null;
}

/** choice: true(O) / false(X) / null(시간 초과) */
export function answerQuiz(state, choice) {
  if (state.phase !== 'ask') return null;
  const q = currentQuestion(state);
  const correct = choice !== null && choice === q.a;
  state.answers.push({ choice, correct });
  if (correct) state.correct += 1;
  state.phase = 'reveal';
  return { type: correct ? 'correct' : choice === null ? 'timeout' : 'wrong', answer: q.a };
}

export function nextQuiz(state) {
  if (state.phase !== 'reveal') return null;
  state.index += 1;
  if (state.index >= state.questions.length) {
    state.phase = 'done';
    state.over = true;
    return { type: 'end' };
  }
  state.phase = 'ask';
  state.timeLeft = state.config.secondsPerQuestion;
  return { type: 'next', index: state.index };
}

export function stepQuiz(state, dt) {
  if (state.phase !== 'ask') return null;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    return answerQuiz(state, null);
  }
  return null;
}

export function quizResult(state) {
  return { score: state.correct, correct: state.correct, total: state.questions.length };
}
