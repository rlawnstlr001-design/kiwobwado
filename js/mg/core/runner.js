// 모든 미니게임이 같이 쓰는 흐름: 설명 → 플레이 → 결과 → 보상(광고 2배) → 다시 하기/나가기

import { el, button, makeSprite, spriteNode } from './dom.js';
import { injectStyles } from './styles.js';
import { STRINGS_KO } from './strings.js';
import { createRewardTracker, dateKey, isEmptyReward, REWARD_KEYS } from './rewards.js';

/**
 * @param {object} def 게임 정의 { id, defaultSkin, create(stage, ctx) => { start(), destroy() } }
 * @param {HTMLElement} container 높이가 정해진 요소. 게임이 이 안을 꽉 채운다.
 * @param {object} [options]
 * @param {(e: {gameId, result, reward, doubled}) => void} [options.onReward] 보상 지급 시 1번. 앱 재화에 더하는 곳
 * @param {() => void} [options.onExit] 나가기/닫기
 * @param {(name: string, params: object) => void} [options.onEvent] 분석 이벤트
 * @param {() => Promise<boolean>} [options.showRewardedAd] 보상형 광고. 끝까지 봤으면 true. 없으면 2배 버튼 숨김
 * @param {object} [options.tracker] createRewardTracker() 결과. 앱 저장소를 쓰려면 직접 만들어 넘김
 * @param {object} [options.skin] 게임별 그림 바꾸기 (각 게임의 defaultSkin 참고)
 * @param {string} [options.character] 캐릭터 이모지 또는 이미지 주소
 * @param {object} [options.strings] 문구 (STRINGS_KO 모양)
 * @param {boolean} [options.haptics=true] 진동
 * @param {number} [options.seed] 고정 시드 (테스트용)
 * @param {boolean} [options.skipIntro=false] 설명 화면 건너뛰기
 */
export function runMiniGame(def, container, options = {}) {
  const S = options.strings || STRINGS_KO;
  const G = S.games[def.id] || { title: def.id, howto: '' };
  const tracker = options.tracker || createRewardTracker();
  const character = options.character || '🐥';
  const skin = { ...def.defaultSkin, ...(options.skin || {}) };

  const emit = (name, params = {}) => {
    try {
      options.onEvent?.(name, { gameId: def.id, ...params });
    } catch (err) {
      console.error(err);
    }
  };

  injectStyles(container.ownerDocument);
  const root = el('div', 'kpg-root');
  const top = el('div', 'kpg-top');
  const closeBtn = button('kpg-close', '✕', () => exit('close'));
  closeBtn.setAttribute('aria-label', S.close);
  const title = el('div', 'kpg-title', G.title);
  const hudBox = el('div', 'kpg-hud');
  top.append(closeBtn, title, hudBox);
  const stage = el('div', 'kpg-stage');
  const overlay = el('div', 'kpg-overlay');
  overlay.hidden = true;
  stage.appendChild(overlay);
  root.append(top, stage);
  container.appendChild(root);

  let instance = null;
  let destroyed = false;
  let playCount = 0;
  let startedAt = 0;
  let pending = null; // 아직 받지 않은 결과
  let playing = false;
  let lastHud = '';

  function hud(items) {
    const key = items.map((i) => `${i.label}:${i.value}`).join('|');
    if (key === lastHud) return;
    lastHud = key;
    hudBox.textContent = '';
    for (const it of items) {
      const chip = el('div', 'kpg-chip');
      chip.append(el('b', '', String(it.value)), el('small', '', it.label));
      hudBox.appendChild(chip);
    }
  }

  function showOverlay(card) {
    overlay.textContent = '';
    overlay.appendChild(card);
    overlay.hidden = false;
  }

  function rewardChips(reward) {
    const box = el('div', 'kpg-reward');
    for (const k of REWARD_KEYS) {
      if (reward[k]) box.appendChild(el('span', '', `${S.icons[k]} ${S.units[k]} +${reward[k]}`));
    }
    return box;
  }

  function intro() {
    const card = el('div', 'kpg-card');
    const hero = el('div', 'kpg-hero');
    hero.appendChild(spriteNode(makeSprite(character, '🐥'), ''));
    const left = tracker.remaining(def.id);
    card.append(hero, el('h2', 'kpg-h', G.title), el('p', 'kpg-p', G.howto));
    card.appendChild(el('p', 'kpg-note', left > 0 ? S.remaining(left) : S.capped));
    const btns = el('div', 'kpg-btns');
    btns.appendChild(button('kpg-btn kpg-primary', S.start, play));
    card.appendChild(btns);
    hud([]);
    showOverlay(card);
  }

  function play() {
    if (destroyed) return;
    overlay.hidden = true;
    instance?.destroy();
    for (const n of [...stage.children]) if (n !== overlay) n.remove();
    playCount += 1;
    pending = null;
    const ctx = {
      strings: S,
      skin,
      character,
      haptics: options.haptics !== false,
      seed: (options.seed ?? (Date.now() >>> 0)) + playCount * 7919,
      day: dateKey(),
      hud,
      end,
      // 점수 튀어오르는 글자 (x, y는 stage 기준 px)
      float(text, x, y, color = 'var(--kpg-text)') {
        const f = el('div', 'kpg-float', text);
        f.style.left = `${x}px`;
        f.style.top = `${y}px`;
        f.style.color = color;
        stage.appendChild(f);
        setTimeout(() => f.remove(), 850);
      },
    };
    instance = def.create(stage, ctx);
    stage.appendChild(overlay); // 항상 맨 위
    startedAt = Date.now();
    playing = true;
    emit('game_start', { play: playCount });
    instance.start();
  }

  function end(result) {
    if (destroyed || !playing) return;
    playing = false;
    const durationMs = Date.now() - startedAt;
    const best = tracker.getBest(def.id);
    const isNewBest = tracker.submitBest(def.id, result.score);
    emit('game_end', { ...result, durationMs, isNewBest });
    pending = result;
    setTimeout(() => !destroyed && showResult(result, isNewBest, Math.max(best, result.score)), 450);
  }

  function showResult(result, isNewBest, best) {
    const { reward, capped } = tracker.peek(def.id, result);
    const card = el('div', 'kpg-card');
    card.appendChild(el('h2', 'kpg-h', S.resultTitle));
    const big = el('div', 'kpg-big', String(result.score));
    card.appendChild(big);
    const bestLine = el('div', 'kpg-best', `${S.best} ${best}`);
    if (isNewBest && result.score > 0) bestLine.appendChild(el('span', 'kpg-badge', S.newBest));
    card.appendChild(bestLine);
    if (def.describe) {
      const d = def.describe(result, S);
      if (d) card.appendChild(el('p', 'kpg-note', d));
    }

    const note = el('p', 'kpg-note');
    const btns = el('div', 'kpg-btns');
    card.append(note, btns);

    const afterClaim = (granted, msg) => {
      btns.textContent = '';
      note.textContent = msg || '';
      if (granted && !isEmptyReward(granted)) {
        rewardArea.replaceWith(rewardChips(granted));
      }
      btns.append(button('kpg-btn kpg-primary', S.retry, play), button('kpg-btn', S.exit, () => exit('exit')));
    };

    let rewardArea = el('div');
    if (capped || isEmptyReward(reward)) {
      card.insertBefore(rewardArea, note);
      pending = null;
      afterClaim(null, capped ? S.capped : S.noReward);
    } else {
      rewardArea = rewardChips(reward);
      card.insertBefore(rewardArea, note);
      if (options.showRewardedAd) {
        const adBtn = button('kpg-btn kpg-ad', `▶ ${S.adDouble}`, async () => {
          adBtn.disabled = true;
          claimBtn.disabled = true;
          note.textContent = S.adLoading;
          emit('ad_double_click');
          let ok = false;
          try {
            ok = (await options.showRewardedAd()) === true;
          } catch (err) {
            console.error(err);
          }
          if (destroyed) return;
          const granted = grant(ok);
          afterClaim(granted, ok ? S.claimed : S.adFailed);
        });
        btns.appendChild(adBtn);
      }
      const claimBtn = button('kpg-btn kpg-primary', S.claim, () => afterClaim(grant(false), S.claimed));
      btns.appendChild(claimBtn);
    }
    showOverlay(card);
  }

  // 보상 지급은 여기서만. pending을 비워서 두 번 지급되지 않게 한다.
  function grant(doubled) {
    if (!pending) return {};
    const result = pending;
    pending = null;
    const r = tracker.claim(def.id, result, { doubled });
    emit('reward_claim', { doubled: r.doubled, capped: r.capped, ...r.reward });
    if (!isEmptyReward(r.reward)) {
      try {
        options.onReward?.({ gameId: def.id, result, reward: r.reward, doubled: r.doubled });
      } catch (err) {
        console.error(err);
      }
    }
    return r.reward;
  }

  function exit(how) {
    if (destroyed) return;
    if (playing) emit('game_quit', { durationMs: Date.now() - startedAt }); // 판 도중 닫음: 보상 없음
    if (pending) grant(false); // 결과 화면에서 닫아도 기본 보상은 지급
    emit('game_exit', { how });
    destroy();
    options.onExit?.();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    instance?.destroy();
    root.remove();
  }

  if (options.skipIntro) play();
  else intro();

  return { destroy, restart: play };
}
