// 재미 요소(10/22 지인 피드백 "둘러보면 재미가 빠져 있다") — 순수 함수(DOM 없음, selftest에서 검사)
// ① 성격: 데려온 아이마다 하나(같은 사람이면 같은 성격). 첫 '지금 일어나는 일'에 답하면 드러난다
// ② 지금 일어나는 일(content/moments.json): 방을 보고 있으면 몇 분마다 하나 — 성격·단계에 따라 고른다
// ③ 재주: 훈련(js/train.js)으로 배우는 재주 목록과 진도

import { rng } from './engine.js?v=202610261936';

// 성격 — 아이마다 다르고 자라며 달라지기도 한다는 전제의 게임 설정(통계 아님)
export const PERSONAS = {
  shy: { dog: '겁쟁이', cat: '겁쟁이', line: { dog: '낯선 소리에 잘 숨고, 천천히 마음을 열어요', cat: '숨을 곳을 좋아하고, 먼저 다가올 때까지 시간이 걸려요' },
    traits: ['새로운 것에 겁을 잘 먹어요', '억지로 하면 더 숨어요 — 기다려 주면 스스로 나와요', '훈련할 때 반응이 조금 느려요'] },
  play: { dog: '장난꾸러기', cat: '사냥꾼', line: { dog: '물고 뜯고 달리는 게 제일 좋아요', cat: '움직이는 건 뭐든 사냥감이에요' },
    traits: ['사고를 자주 쳐요', '놀아 주면 금방 기분이 풀려요', '훈련할 때 산만해서 칭찬 타이밍이 빨라야 해요'] },
  food: { dog: '먹보', cat: '먹보', line: { dog: '세상에서 간식이 제일 중요해요', cat: '밥그릇 소리만 나면 어디서든 달려와요' },
    traits: ['먹을 것 앞에선 못 참아요', '정해진 양을 지키는 게 더 중요해요', '간식 보상 훈련을 빨리 배워요'] },
  cuddle: { dog: '애교쟁이', cat: '개냥이', line: { dog: '보호자 옆이 제일 좋은 자리예요', cat: '고양이인데 졸졸 따라다녀요' },
    traits: ['쓰다듬기를 좋아해 마음이 잘 올라요', '혼자 있으면 더 쓸쓸해해요', '칭찬만으로도 잘 배워요'] },
};
export const PERSONA_KEYS = Object.keys(PERSONAS);
export const personaOf = (seed) => PERSONA_KEYS[Math.floor(rng(`${seed}:persona`)() * PERSONA_KEYS.length)];
export const personaLabel = (p, sp) => PERSONAS[p]?.[sp] ?? '';

// 평소 모습 문구(성격별) — moodOf의 '평소' 자리에 쓴다
export const IDLE_LINE = {
  dog: { shy: '소파 옆에 붙어 조심조심 둘러봐요', play: '장난감을 물고 방을 빙빙 돌아요', food: '밥그릇 냄새를 킁킁 맡고 있어요', cuddle: '보호자를 졸졸 따라다니며 눈을 맞춰요' },
  cat: { shy: '커튼 뒤에서 눈만 내놓고 지켜봐요', play: '먼지 한 톨에도 엉덩이를 씰룩여요', food: '밥그릇 앞에 식빵 자세로 앉아 있어요', cuddle: '다리 사이를 8자로 돌며 비벼요' },
};

// ---------- 지금 일어나는 일 ----------
export const MOMENT_FIRST_MS = 20000;    // 처음 방을 연 뒤(길잡이 끝) 첫 일까지
export const MOMENT_GAP_MS = 4 * 60000;  // 그다음부터 방을 보고 있을 때 간격
export const MOMENT_DAY_CAP = 4;         // 하루 최대(현실 날짜 기준)

// 고르기: 종·단계·성격 가중치. 오늘 이미 나온 것과 최근 6개는 빼고, 다 쓰면 최근만 뺀다. n = 오늘 몇 번째인지(같은 사람·같은 날·같은 순번 = 같은 결과)
export function pickMoment(items, { species, stage, persona, seed, key, n, recent = [], todaySeen = [] }) {
  const fit = (m) => (m.species === 'both' || m.species === species) && (!m.stages || m.stages.includes(stage));
  let pool = items.filter((m) => fit(m) && !todaySeen.includes(m.id) && !recent.slice(-6).includes(m.id));
  if (!pool.length) pool = items.filter((m) => fit(m) && !todaySeen.includes(m.id));
  if (!pool.length) return null;
  const w = (m) => m.persona?.[persona] ?? 1;
  const total = pool.reduce((s, m) => s + w(m), 0);
  let x = rng(`${seed}:mo:${key}:${n}`)() * total;
  for (const m of pool) { x -= w(m); if (x <= 0) return m; }
  return pool.at(-1);
}
// 고른 답의 반응: 성격별 다른 반응이 있으면 그걸로
export const replyOf = (choice, persona) => choice.as?.[persona] ?? choice.reply;

// ---------- 재주 ----------
export const TRICKS = {
  dog: [
    { id: 'sit', label: '앉아', say: '앉아!', did: '엉덩이를 바닥에 착', pose: 'idle' },
    { id: 'paw', label: '손', say: '손!', did: '앞발을 손바닥에 톡', pose: 'paw' },
    { id: 'down', label: '엎드려', say: '엎드려!', did: '배를 바닥에 쭉', pose: 'down' },
    { id: 'stay', label: '기다려', say: '기다려!', did: '꼼짝 않고 눈만 반짝', pose: 'idle' },
  ],
  cat: [
    { id: 'come', label: '이리 와', say: '이리 와~', did: '꼬리를 세우고 총총', pose: 'come' },
    { id: 'sit', label: '앉아', say: '앉아!', did: '앞발을 모으고 얌전히', pose: 'idle' },
    { id: 'high5', label: '하이파이브', say: '하이파이브!', did: '앞발을 번쩍', pose: 'high5' },
  ],
};
export const TRICK_NEED = 6;   // 재주 하나를 배우는 데 필요한 성공 점수
// 성격별 훈련 보정: wait = 반응 전 망설임(ms 더하기), window = 칭찬을 받아 주는 시간(ms), gain = 성공 한 번의 점수, focus = 시킨 대로 할 확률 더하기
export const TRAIN_MOD = {
  shy: { wait: 700, window: 1300, gain: 1, focus: -0.05 },
  play: { wait: 0, window: 850, gain: 1, focus: -0.1 },
  food: { wait: 0, window: 1100, gain: 1.5, focus: 0 },
  cuddle: { wait: 200, window: 1200, gain: 1, focus: 0.05 },
};
// 지금 배우는 재주(앞에서부터 차례로). 다 배웠으면 null
export function nextTrick(species, prog = {}) {
  return TRICKS[species].find((t) => (prog[t.id] || 0) < TRICK_NEED) ?? null;
}
export const learned = (species, prog = {}) => TRICKS[species].filter((t) => (prog[t.id] || 0) >= TRICK_NEED);
// 시킨 대로 할 확률: 진도가 오를수록 잘한다(0.5 → 0.9)
export const focusOf = (prog, persona) => Math.max(0.35, Math.min(0.92, 0.5 + (prog / TRICK_NEED) * 0.4 + (TRAIN_MOD[persona]?.focus ?? 0)));
