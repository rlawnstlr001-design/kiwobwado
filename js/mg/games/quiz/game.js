import { el, button, createLoop, vibrate } from '../../core/dom.js';
import { QUIZ_CONFIG, createQuizState, currentQuestion, answerQuiz, nextQuiz, stepQuiz, quizResult } from './logic.js';
import { QUESTIONS_KO } from './questions.ko.js';

export const quizGame = {
  id: 'quiz',
  defaultSkin: {
    questions: QUESTIONS_KO, // [{ q, a: true|false, exp }]
  },
  describe: (r) => `${r.total}문제 중 ${r.correct}개 정답`,

  create(stage, ctx) {
    const S = ctx.strings;
    const state = createQuizState(ctx.skin.questions, ctx.day, QUIZ_CONFIG);

    const box = el('div', 'kpg-quiz');
    const num = el('div', 'kpg-qnum');
    const bar = el('div', 'kpg-bar');
    const fill = el('i');
    bar.appendChild(fill);
    const qText = el('div', 'kpg-q');
    const ox = el('div', 'kpg-ox');
    const oBtn = button('kpg-oxbtn o', 'O', () => choose(true));
    const xBtn = button('kpg-oxbtn x', 'X', () => choose(false));
    oBtn.setAttribute('aria-label', 'O, 맞다');
    xBtn.setAttribute('aria-label', 'X, 틀리다');
    ox.append(oBtn, xBtn);
    const reveal = el('div', 'kpg-reveal');
    reveal.hidden = true;
    box.append(num, bar, qText, ox, reveal);
    stage.appendChild(box);

    function renderAsk() {
      const q = currentQuestion(state);
      num.textContent = `${state.index + 1} / ${state.questions.length}`;
      qText.textContent = q.q;
      oBtn.disabled = false;
      xBtn.disabled = false;
      oBtn.classList.remove('is-picked');
      xBtn.classList.remove('is-picked');
      reveal.hidden = true;
      ox.hidden = false;
    }

    function renderReveal(ev, choice) {
      const q = currentQuestion(state);
      oBtn.disabled = true;
      xBtn.disabled = true;
      if (choice === true) oBtn.classList.add('is-picked');
      if (choice === false) xBtn.classList.add('is-picked');
      reveal.textContent = '';
      const good = ev.type === 'correct';
      const head = el('b', good ? 'good' : 'bad', good ? `⭕ ${S.correct}` : `❌ ${ev.type === 'timeout' ? S.timeout : S.wrong} · ${S.answerIs(q.a)}`);
      const last = state.index === state.questions.length - 1;
      const nextBtn = button('kpg-btn kpg-primary', last ? S.seeResult : S.next, () => {
        const n = nextQuiz(state);
        if (n?.type === 'end') finish();
        else renderAsk();
      });
      nextBtn.style.width = '100%';
      reveal.append(head, el('p', '', q.exp || ''), nextBtn);
      reveal.hidden = false;
      vibrate(ctx.haptics, good ? 20 : [40, 30, 40]);
    }

    function choose(choice) {
      const ev = answerQuiz(state, choice);
      if (ev) renderReveal(ev, choice);
    }

    const loop = createLoop((dt) => {
      const ev = stepQuiz(state, dt);
      if (ev) renderReveal(ev, null);
      fill.style.width = `${(state.timeLeft / QUIZ_CONFIG.secondsPerQuestion) * 100}%`;
      ctx.hud([{ label: S.score, value: state.correct }]);
    });

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      loop.stop();
      ctx.end(quizResult(state));
    }

    renderAsk();
    return {
      start: () => loop.start(),
      destroy() {
        loop.destroy();
        box.remove();
      },
    };
  },
};
