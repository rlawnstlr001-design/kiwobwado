// 일정·상태·사건·장부·리포트 엔진 — DOM 없이 순수 함수 (node selftest에서 그대로 검사)
// 하루 = 체험 n일째(1부터). 시간은 'HH:MM' 문자열, 분 단위 정수로 계산한다.

export const COURSE_DAYS = 30;
export const START_WEEKS = 8;          // 강아지·고양이 모두 생후 8주에 데려온다
export const WINDOW = 60;              // 돌봄 요청 응답 창(분)
export const EARLY = 30;               // 요청 시각 30분 전부터 '했어요' 가능
const START = { health: 80, bond: 40, habit: 30 };

// ---------- 시간 ----------
export const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
export const toHM = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export function dayKeyOf(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKeyOf(new Date(y, m - 1, d + n));
}
export function dayNo(startKey, key) {
  const [a, b] = [startKey, key].map((k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86400000) + 1;
}
export const weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
export const isWeekend = (key) => [0, 6].includes(weekday(key));

// ---------- 결정적 난수 (같은 사람·같은 날 = 같은 결과) ----------
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let s = hash(String(seed)) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// ---------- 성향 ----------
export const TYPES = {
  small: { species: 'dog', label: '작고 차분한 아이', walkMin: 20, walks: 1, kg: 5, brushDaily: true, adultKg: '약 5kg', exercise: '하루 30분 이하' },
  medium: { species: 'dog', label: '활발한 중형', walkMin: 30, walks: 2, kg: 10, brushDaily: false, adultKg: '약 15kg', exercise: '하루 1시간 안팎' },
  large: { species: 'dog', label: '큰 활동견', walkMin: 60, walks: 2, kg: 20, brushDaily: false, adultKg: '약 30kg', exercise: '하루 2시간 넘게' },
  short: { species: 'cat', label: '단모 고양이', play: 3, kg: 5, brushDaily: false, adultKg: '약 4.5kg', exercise: '사냥 놀이 하루 2~3번' },
  long: { species: 'cat', label: '장모 고양이', play: 3, kg: 5, brushDaily: true, adultKg: '약 5kg', exercise: '사냥 놀이 하루 2~3번' },
};
export const ageWeeks = (day) => START_WEEKS + (day - 1) / 7;
export function stageOf(weeks) { return weeks < 16 ? 'baby' : weeks < 40 ? 'teen' : 'adult'; }
// 체중 구간(진료비 표 5/10/20kg): 아기 땐 5kg
export function weightClass(type, weeks) {
  if (TYPES[type].species === 'cat' || weeks < 16) return 5;
  return TYPES[type].kg;
}

// ---------- 내 하루 ----------
// 야근하는 평일: 주마다 정해진 개수만큼 결정적으로 고른다
export function isLateDay(profile, key) {
  const n = profile.life.late || 0;
  if (!n || isWeekend(key)) return false;
  const wd = weekday(key);                      // 1~5
  const r = rng(`${profile.seed}:late:${key.slice(0, 8)}${Math.floor((Number(key.slice(8)) - 1) / 7)}`);
  const days = [1, 2, 3, 4, 5].sort(() => r() - 0.5).slice(0, n);
  return days.includes(wd);
}
// 집을 비우는 구간 [나감, 들어옴] (분). 재택·주말 집콕이면 빈 배열
export function awaySpans(profile, key) {
  const L = profile.life;
  if (isWeekend(key)) return L.weekendOut && weekday(key) === 6 ? [[toMin('11:00'), toMin('17:00')]] : [];
  if (L.remote) return [];
  const back = toMin(L.back) + (isLateDay(profile, key) ? 180 : 0);
  return [[toMin(L.leave), back]];
}
export const aloneMinutes = (profile, key) => awaySpans(profile, key).reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
// 가장 길게 혼자 있는 시간(분). 낮에 누가 들르면(13:00~13:30) 그 앞뒤로 나뉜다
export function aloneStretch(profile, key, visited = false) {
  let best = 0;
  for (const [a, b] of awaySpans(profile, key)) {
    const v0 = toMin('13:00'), v1 = toMin('13:30');
    if (visited && a < v0 && b > v1) best = Math.max(best, v0 - a, b - v1);
    else best = Math.max(best, b - a);
  }
  return best;
}
const isAwayAt = (spans, m) => spans.some(([a, b]) => m > a + 10 && m < b - 10);

// 혼자 둘 수 있는 권장 한계(분). 강아지: 아기는 '월령 1개월당 1시간'(배변 참기), 성견 4시간. 고양이: 공식 기준 미확인 → null
export function aloneLimit(species, weeks) {
  if (species === 'cat') return null;
  return Math.min(240, Math.max(60, Math.round((weeks / 4.345) * 60)));
}

// 오늘의 돌봄 요청 목록
export function dayPlan(profile, key) {
  const day = dayNo(profile.startKey, key);
  const weeks = ageWeeks(day);
  const T = TYPES[profile.type];
  const L = profile.life;
  const weekend = isWeekend(key);
  const wake = toMin(weekend ? addMin(L.wake, 60) : L.wake);
  const sleep = toMin(L.sleep);
  const spans = awaySpans(profile, key);
  const backAt = spans.length && !weekend ? spans[0][1] : null;
  const evening = backAt ? Math.min(backAt + 15, sleep - 60) : toMin('18:30');
  const tasks = [];
  const add = (k, label, at, minutes, kind) => {
    const time = Math.max(wake, Math.min(sleep - 15, Math.round(at)));
    tasks.push({ id: `${key}:${k}`, key: k, label, time: toHM(time), minutes, kind, away: isAwayAt(spans, time) });
  };
  const meals = weeks < 26 ? 3 : 2; // 어릴 때 3~4회 → 커서 2회 (VCA)
  add('feed1', '아침 밥', wake + 20, 10, 'feed');
  if (meals === 3) add('feed2', '낮 밥', toMin('12:30'), 10, 'feed');
  add('feed3', '저녁 밥', evening, 10, 'feed');
  if (T.species === 'dog') {
    // 배변: 일어나자마자·먹은 뒤 (최소 2시간마다 — 낮엔 '낮 돌봄'으로 묶음)
    add('potty1', '아침 배변 챙기기', wake + 5, 5, 'potty');
    if (weeks < 26) add('potty2', '낮 배변 챙기기', toMin('14:30'), 5, 'potty');
    add('potty3', '저녁 배변·패드 갈기', evening + 30, 5, 'potty');
    const baby = weeks < 16; // 접종 완료 전: 짧은 바깥 구경·집 안 놀이
    const w = baby ? Math.round(T.walkMin / 2) : T.walkMin;
    const label = baby ? '놀이·바깥 구경' : '산책';
    if (T.walks >= 2) add('walk1', `아침 ${label}`, wake + 35, w, 'walk');
    add('walk2', `저녁 ${label}`, evening + 45, w, 'walk');
    add('train', '짧은 훈련(5분)', evening + 90, 5, 'train');
  } else {
    add('play1', '아침 사냥 놀이', wake + 30, 5, 'play');
    add('play2', '저녁 사냥 놀이', evening + 60, 10, 'play');
    add('play3', '자기 전 놀이', sleep - 45, 5, 'play');
    add('litter', '화장실 치우기', evening + 20, 5, 'litter');
  }
  if (T.brushDaily || weekday(key) === 0) add('brush', T.brushDaily ? '빗질(매일)' : '빗질(주 1회)', evening + 120, 5, 'brush');
  return tasks.sort((a, b) => toMin(a.time) - toMin(b.time));
}
function addMin(hm, n) { return toHM(toMin(hm) + n); }

// ---------- 응답 판정 ----------
// nowMin: 그날 0시부터 지난 분. 반환: 'early'(아직), 'open'(응답 창), 'late', 'closed'(그날 끝)
export function taskPhase(task, nowMin) {
  const t = toMin(task.time);
  if (nowMin < t - EARLY) return 'early';
  if (nowMin <= t + WINDOW) return 'open';
  return 'late';
}
export function judge(task, doneMin) {
  if (doneMin == null) return 'missed';
  return doneMin <= toMin(task.time) + WINDOW ? 'done' : 'late';
}

// ---------- 하루 마감: 상태 변화 + 다음 날 트리거 ----------
const FX = {
  feed: { done: { health: 1, bond: 1 }, late: { health: 0 }, missed: { health: -4, bond: -1 } },
  potty: { done: { habit: 2 }, late: { habit: 0 }, missed: { habit: -3 } },
  walk: { done: { bond: 2, habit: 1, health: 1 }, late: { bond: 1 }, missed: { bond: -2, habit: -2 } },
  play: { done: { bond: 2, habit: 1 }, late: { bond: 1 }, missed: { bond: -2, habit: -1 } },
  litter: { done: { habit: 2, health: 1 }, late: { habit: 0 }, missed: { habit: -3, health: -1 } },
  train: { done: { habit: 2, bond: 1 }, late: { habit: 1 }, missed: { habit: -1 } },
  brush: { done: { bond: 1, health: 1 }, late: {}, missed: { health: -1 } },
};
// 낮 돌봄(집을 비운 시간의 요청)을 어떻게 해결했는지: self(내가) | helper(가족·지인) | sitter(펫시터) → 모두 done 취급
export function closeDay(profile, key, plan, results, alone) {
  const fx = { health: 0, bond: 0, habit: 0 };
  const count = { done: 0, late: 0, missed: 0 };
  const missedKinds = new Set();
  for (const t of plan) {
    const r = results[t.id];
    const st = r?.status ?? 'missed';
    if (st === 'skip') continue;
    const s = st === 'late' ? 'late' : st === 'missed' ? 'missed' : 'done';
    count[s]++;
    if (s === 'missed') missedKinds.add(t.kind);
    for (const [k, v] of Object.entries(FX[t.kind]?.[s] ?? {})) fx[k] += v;
  }
  const day = dayNo(profile.startKey, key);
  const limit = aloneLimit(TYPES[profile.type].species, ageWeeks(day));
  const over = limit ? Math.max(0, alone - limit) : 0;
  if (over > 0) { fx.habit -= Math.min(6, Math.ceil(over / 60)); fx.bond -= Math.min(4, Math.ceil(over / 90)); }
  const triggers = [];
  if (missedKinds.has('feed')) triggers.push('missedFeed');
  if (missedKinds.has('potty')) triggers.push('missedPotty');
  if (missedKinds.has('litter')) triggers.push('missedLitter');
  if (missedKinds.has('play')) triggers.push('missedPlay');
  if (over >= 120) triggers.push('aloneLong'); else if (over > 0) triggers.push('alone');
  return { fx, count, over, triggers };
}
export const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
export function applyFx(stats, fx) {
  return { health: clamp(stats.health + (fx.health || 0)), bond: clamp(stats.bond + (fx.bond || 0)), habit: clamp(stats.habit + (fx.habit || 0)) };
}
export const startStats = () => ({ ...START });

// ---------- 사건 고르기 ----------
// seen: 이미 나온 사건 id 집합, chains: [{id, day}], triggers: 어제 마감에서 나온 조건 목록
export function pickEvents(profile, day, { events, seen, chains = [], triggers = [], lateToday = false }) {
  const sp = TYPES[profile.type].species;
  const fits = (e) => (e.species === 'both' || e.species === sp) && !seen.has(e.id);
  const out = [];
  for (const e of events) if (fits(e) && e.when.type === 'fixed' && e.when.day === day) out.push(e);
  for (const c of chains) if (c.day === day) { const e = events.find((x) => x.id === c.id); if (e && fits(e)) out.push(e); }
  const r = rng(`${profile.seed}:ev:${day}`);
  // 조건 사건: 하루 1개까지, 60% 확률 (생활 조건은 정해진 날)
  const cond = new Set(triggers);
  if (lateToday) cond.add('lateNight');
  if (day === 9 && profile.home.rent && profile.home.petOK === 'unknown') cond.add('rentUnknown');
  if (day === 12 && profile.allergy === 'unknown') cond.add('allergyUnknown');
  const trig = events.filter((e) => fits(e) && e.when.type === 'trigger' && cond.has(e.when.cond));
  const forced = trig.filter((e) => ['rentUnknown', 'allergyUnknown', 'lateNight'].includes(e.when.cond));
  if (forced.length) out.push(forced[0]);
  else if (trig.length && r() < 0.6) out.push(trig[Math.floor(r() * trig.length)]);
  // 무작위 사건: 하루 45% (주 3회 안팎)
  if (out.length < 2 && r() < 0.45) {
    const pool = events.filter((e) => fits(e) && e.when.type === 'random' && day >= e.when.from && day <= e.when.to);
    const total = pool.reduce((s, e) => s + (e.when.w || 1), 0);
    let x = r() * total;
    for (const e of pool) { x -= e.when.w || 1; if (x <= 0) { out.push(e); break; } }
  }
  return out.slice(0, 2);
}

// ---------- 비용 ----------
export function resolveCost(costs, item, ctx) {
  if (typeof item === 'object') return { amount: item.amount, label: item.label, src: item.src || [] };
  const path = item.replace('.W', `.${ctx.w}`).replace('SPECIES', ctx.species).replace('vax_combo', ctx.species === 'cat' ? 'vax_cat_combo' : 'vax_dog_combo');
  let v = costs;
  for (const p of path.split('.')) v = v?.[p];
  const head = path.split('.')[0];
  const src = costs[head]?.src ?? [];
  if (typeof v === 'number') return { amount: v, label: COST_LABEL[path.replace(/\.\d+$/, '')] ?? path, src };
  if (v && typeof v.amount === 'number') return { amount: v.amount, label: v.label, src: v.src ?? src };
  if (Array.isArray(costs[head]?.[path.split('.')[1]])) return { amount: v, label: path, src };
  throw new Error(`비용 경로 없음: ${item}`);
}
const COST_LABEL = {
  'vet.first_visit': '초진 진찰료', 'vet.revisit': '재진 진찰료', 'vet.consult': '상담료',
  'vet.inpatient_dog': '입원 1일', 'vet.inpatient_cat': '입원 1일', 'vet.vax_dog_combo': '종합백신', 'vet.vax_cat_combo': '종합백신',
  'vet.vax_rabies': '광견병 백신', 'vet.vax_kennel': '켄넬코프 백신', 'vet.vax_corona': '코로나 장염 백신', 'vet.vax_flu': '인플루엔자 백신',
  'vet.blood_cbc': '혈액검사(CBC)', 'vet.blood_chem': '혈액화학검사', 'vet.xray': '엑스선', 'vet.ultrasound': '초음파',
  'vet.heartworm_5kg': '심장사상충 예방약', 'vet.ectoparasite_5kg': '외부기생충 예방', 'register.chip_in': '동물등록(내장형 수수료)',
  'register.chip_out': '동물등록(외장형 수수료)', 'fines.register': '미등록 과태료(1차)',
};
export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

// 한 달 예상 비용: 평균 양육비 + 병원비 월 환산 + 낮 돌봄 외주
export function monthlyProjection(profile, costs, { sitterPerMonth = 0 } = {}) {
  const sp = TYPES[profile.type].species;
  const living = costs.monthly[sp].amount;
  // 치료비를 쓴 가구의 최근 2년 치료비(개 143.3만·고양이 103.2만) ÷ 24 [계산]
  const vet = Math.round((sp === 'dog' ? 1433000 : 1032000) / 24);
  return { living, vet, care: sitterPerMonth, total: living + vet + sitterPerMonth };
}

// ---------- 리포트 ----------
// input: { profile, days:[{day, count:{done,late,missed}, alone, over, sitter}], answers:[{score}], ledger:[{amount}], costs, quiz:{right,total} }
export function buildReport({ profile, days, answers, costs, quiz = { right: 0, total: 0 } }) {
  const T = TYPES[profile.type];
  const sp = T.species;
  const reasons = [];
  const tips = [];
  // 꾸준함: 제때 한 비율 (늦게 한 건 절반)
  const c = days.reduce((a, d) => ({ done: a.done + d.count.done, late: a.late + d.count.late, missed: a.missed + d.count.missed }), { done: 0, late: 0, missed: 0 });
  const total = c.done + c.late + c.missed;
  const consistency = total ? clamp(((c.done + c.late * 0.5) / total) * 100) : 0;
  if (consistency < 70) tips.push({ axis: 'consistency', text: `돌봄 요청의 ${100 - consistency}%를 놓치거나 늦었어요. 실제 동물은 기다려 주지 않아요 — 놓친 시간대를 보고 알림·루틴을 다시 짜 보세요.` });
  // 시간: 혼자 두는 시간 한도 초과 + 바쁜 시간대 돌봄
  const limit = aloneLimit(sp, START_WEEKS + 4);
  const weekdayAlone = days.filter((d) => d.alone > 0).map((d) => d.alone);
  const avgAlone = weekdayAlone.length ? weekdayAlone.reduce((a, b) => a + b, 0) / weekdayAlone.length : 0;
  const overDays = days.filter((d) => d.over > 0).length;
  let time = 100;
  if (limit) {
    time -= Math.min(50, Math.round((overDays / Math.max(1, days.length)) * 60));
    if (avgAlone > 240) time -= 15;
  } else if (avgAlone > 600) time -= 15;
  const walkNeed = sp === 'dog' ? T.walkMin * T.walks : 20;
  time -= Math.max(0, 100 - consistency) * 0.3;
  time = clamp(time);
  if (limit && overDays) tips.push({ axis: 'time', text: `평일 평균 ${Math.round(avgAlone / 60)}시간 혼자 있어요. 강아지는 성견도 4시간 이하가 권장이에요 — 낮 돌봄(가족·펫시터) 계획이 필요해요.` });
  // 돈: 예산 ÷ 예상 월 비용
  const sitterDays = days.reduce((s, d) => s + (d.sitter || 0), 0);
  const sitterPerMonth = days.length ? Math.round((sitterDays / days.length) * 30) * costs.care.sitter_hour.amount : 0;
  const proj = monthlyProjection(profile, costs, { sitterPerMonth });
  // 예산이 예상의 100% 이상이면 100점, 50% 이하면 0점
  const money = clamp((profile.budget / proj.total - 0.5) * 200);
  if (money < 100) tips.push({ axis: 'money', text: `한 달 예상 ${won(proj.total)}(양육비 평균 ${won(proj.living)} + 병원비 월 환산 ${won(proj.vet)}${proj.care ? ` + 낮 돌봄 ${won(proj.care)}` : ''})인데 예산은 ${won(profile.budget)}이에요.` });
  // 환경
  let env = 100;
  const blockers = [];
  if (profile.home.rent && profile.home.petOK === 'no') { env -= 70; blockers.push('임대 계약이 반려동물을 허락하지 않아요'); }
  else if (profile.home.rent && profile.home.petOK === 'unknown') { env -= 30; tips.push({ axis: 'env', text: '임대 계약의 반려동물 조항부터 확인하세요 — 입양 기관들이 가장 먼저 묻는 질문이에요.' }); }
  if (profile.people.live === 'family' && profile.people.agree === 'some') { env -= 40; blockers.push('함께 사는 사람이 모두 동의하지 않았어요'); }
  if (profile.allergy === 'yes') { env -= 40; tips.push({ axis: 'env', text: '함께 사는 사람에게 알레르기가 있어요. 입양 전에 검사·상담을 받아 보세요.' }); }
  else if (profile.allergy === 'unknown') { env -= 10; tips.push({ axis: 'env', text: '알레르기 여부를 모르면 입양 전에 확인해 보세요.' }); }
  env = clamp(env);
  // 지식: 사건 선택 + 음식 퀴즈
  const ans = answers.length;
  const good = answers.filter((a) => a.score > 0).length;
  const bad = answers.filter((a) => a.score < 0).length;
  const knowRaw = (good + quiz.right) / Math.max(1, ans + quiz.total);
  const knowledge = ans + quiz.total ? clamp(knowRaw * 100 - bad * 3) : 50;
  if (knowledge < 70) tips.push({ axis: 'knowledge', text: '위험한 선택이 있었어요. 배움 탭의 음식 카드·레슨을 보고, 법정 입양 전 교육(동물사랑배움터 90분)도 들어 보세요.' });
  const axes = { time, money, env, knowledge, consistency };
  const low = Object.values(axes).filter((v) => v < 50).length;
  let verdict;
  if (blockers.length || low >= 2 || consistency < 40) verdict = 'notyet';
  else if (Object.values(axes).every((v) => v >= 70)) verdict = 'ready';
  else verdict = 'conditional';
  // 다른 선택지가 더 맞는지 (강아지 시간 부족 → 고양이)
  if (sp === 'dog' && time < 60) tips.push({ axis: 'fit', text: '지금 생활 패턴이면 혼자 있는 시간에 덜 민감한 동물(예: 고양이)이 더 맞을 수 있어요. 고양이도 혼자 두는 시간의 공식 기준은 없으니 체험해 보고 정하세요.' });
  return { axes, verdict, blockers, tips, projection: proj, counts: c, avgAlone, overDays, reasons };
}

// ---------- 문구 ----------
// {name}, {name:이/가} 같은 조사 자리 채우기
export function josa(word, pair) {
  const [a, b] = pair.split('/');
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return word + b;
  const jong = (ch - 0xac00) % 28;
  if (pair === '으로/로') return word + (jong && jong !== 8 ? '으로' : '로');
  return word + (jong ? a : b);
}
export const fill = (text, name) => String(text).replace(/\{name(?::([^}]+))?\}/g, (_, p) => (p ? josa(name, p) : name));
