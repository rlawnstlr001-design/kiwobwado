// 반려 살림·피부 (순수 로직, selftest 대상) — 사료·패드·모래 재고, 숨은 식이 알레르기, 가려움 → 2차 피부 감염,
// 약욕(개)·먹는 약(고양이), 식이 제한 시험(가수분해 사료만 8주), 재도전 시험. 수치 근거는 content/shop.json의 src
// 다른 모듈을 가져오지 않는다(배포 때 ?v= 붙는 경로 문제를 피하려고) — 난수는 부르는 쪽에서 넘긴다

export const PROTEIN = { beef: '소고기', chicken: '닭고기', lamb: '양고기', fish: '생선', dairy: '유제품', wheat: '밀', pork: '돼지고기', hydro: '가수분해 단백질' };
export const ALLERGY_CHANCE = 0.5; // 체험용으로 실제(가려운 개의 일부)보다 자주 생기게 한다 — 화면에 그렇게 밝힌다

// 피부 가려움 단계 기준
export const ITCHY_AT = 45;      // 이 이상이면 '자꾸 긁어요'
export const INFECT_AT = 70;     // 가려운 상태로 며칠 지나 이 이상이면 2차 감염
export const INFECT_DAYS = 4;
export const HEAL_DAYS = 14;     // 치료를 제대로 한 날이 이만큼 쌓이면 감염이 가라앉는다
export const TRIAL_DAYS = 56;    // 식이 제한 시험 8주
export const BATHS_PER_WEEK = 2; // 약욕 주 2회

// 숨은 알레르기: 절반은 없음, 있으면 흔한 순서(표의 비율)대로 뽑는다
export function pickAllergy(rand, table) {
  if (rand() >= ALLERGY_CHANCE) return null;
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [p, w] of table) { r -= w; if (r < 0) return p; }
  return table[0][0];
}

export const itemsFor = (shop, species) => shop.items.filter((i) => i.sp === species || i.sp === 'both');
export const itemById = (shop, id) => shop.items.find((i) => i.id === id);
export const hasProtein = (item, p) => !!p && (item?.protein ?? []).includes(p);

// 데려온 날의 살림: 데려온 곳에서 먹던 성장기 사료 7일분 + 패드(또는 모래) 7일분.
// 알레르기가 있으면 70% 확률로 그 재료가 든 사료를 먹던 중 — 30일 안에 증상이 드러나 배울 수 있게
export function starterInv(shop, species, allergy, rand) {
  const foods = itemsFor(shop, species).filter((i) => i.cat === 'food' && !i.rx);
  const bad = foods.filter((f) => hasProtein(f, allergy));
  const pool = allergy && bad.length && rand() < 0.7 ? bad : foods;
  const first = pool[Math.floor(rand() * pool.length)];
  return { cur: first.id, food: { [first.id]: 7 }, pads: species === 'dog' ? 7 : 0, litter: species === 'cat' ? 7 : 0, treats: {}, medshampoo: 0, meds: 0, toys: [] };
}
export const skinStart = () => ({ itch: 0, state: 'ok', itchyDays: 0, heal: 0, rx: false, trial: null, challenge: null, found: null, baths: [], med: [], seen: [] });

// 지금 먹이는 사료가 떨어졌으면 남은 다른 사료로 바꾼다. 바꾼 사료 id(또는 null)
export function ensureFood(inv) {
  if ((inv.food[inv.cur] || 0) > 0) return inv.cur;
  const next = Object.keys(inv.food).find((id) => inv.food[id] > 0);
  if (next) inv.cur = next;
  return next ?? null;
}

// 산 물건을 살림에 넣는다(재고는 '며칠분' 또는 '개수')
export function addItem(inv, item, type) {
  if (item.cat === 'food') { inv.food[item.id] = (inv.food[item.id] || 0) + item.days[type]; if (!(inv.food[inv.cur] > 0)) inv.cur = item.id; return; }
  if (item.use === 'pads') inv.pads += item.days[type];
  else if (item.use === 'litter') inv.litter += item.days[type];
  else if (item.use === 'medshampoo') inv.medshampoo += item.count;
  else if (item.use === 'meds') inv.meds += item.count;
  else if (item.cat === 'treat') inv.treats[item.id] = (inv.treats[item.id] || 0) + item.count;
  else if (item.cat === 'toy' && !inv.toys.includes(item.id)) inv.toys.push(item.id);
}

// 하루 마감: 재고를 쓰고(먹였으면 사료 1일, 배변 돌봄을 했으면 패드·모래 1일), 알레르기 노출에 따라 피부가 변한다.
// in: { day, fed, cleaned, treatsGiven:[itemId], allergy, species }
// out: { fx, notes:[code] } — 상태(inv, skin)는 그 자리에서 바꾼다
export function closeCareDay(inv, skin, shop, { day, fed, cleaned, treatsGiven = [], allergy, species }) {
  const notes = [];
  const fx = { health: 0, bond: 0, habit: 0 };
  const curItem = itemById(shop, inv.cur);
  if (fed && inv.food[inv.cur] > 0) inv.food[inv.cur] -= 1;
  if (fed && !ensureFood(inv)) notes.push('food_out');
  if (cleaned) { if (species === 'dog') inv.pads = Math.max(0, inv.pads - 1); else inv.litter = Math.max(0, inv.litter - 1); }
  // 노출: 오늘 먹은 사료·간식에 알레르기 재료가 있었나
  const treatItems = treatsGiven.map((id) => itemById(shop, id)).filter(Boolean);
  const exposed = !!allergy && ((fed && hasProtein(curItem, allergy)) || treatItems.some((t) => hasProtein(t, allergy)));
  // 식이 제한 시험 중 가수분해 사료가 아닌 걸 먹였으면 깨진다
  if (skin.trial && !skin.trial.done && ((fed && !hasProtein(curItem, 'hydro')) || treatItems.length)) { skin.trial.broken = (skin.trial.broken || 0) + 1; notes.push('trial_broken'); }
  const onTrialDays = skin.trial && !skin.trial.done ? day - skin.trial.start : 0;
  // 가려움: 노출되면 오르고, 안 되면 천천히 내린다(시험 2주가 지나면 더 빨리)
  if (exposed) skin.itch = Math.min(100, skin.itch + 12);
  else skin.itch = Math.max(0, skin.itch - (onTrialDays >= 14 ? 9 : 4));
  // 치료: 개 = 최근 7일 약욕 2번 이상, 고양이 = 오늘 약을 먹였나
  const bathsLast7 = skin.baths.filter((d) => d > day - 7).length;
  const treated = species === 'dog' ? bathsLast7 >= BATHS_PER_WEEK : skin.med.includes(day);
  if (skin.state === 'infected') {
    skin.itch = Math.max(skin.itch, 50); // 감염 자체가 가렵다
    skin.heal = treated ? skin.heal + 1 : Math.max(0, skin.heal - 1);
    if (skin.heal >= HEAL_DAYS) { skin.state = 'itchy'; skin.heal = 0; skin.rx = false; skin.itch = Math.min(skin.itch, 40); notes.push('healed'); }
  }
  if (skin.state !== 'infected') {
    if (skin.itch >= ITCHY_AT) { if (skin.state === 'ok') notes.push('itch_start'); skin.state = 'itchy'; skin.itchyDays++; }
    else { if (skin.state === 'itchy') notes.push('itch_gone'); skin.state = 'ok'; skin.itchyDays = 0; }
    if (skin.state === 'itchy' && skin.itchyDays >= INFECT_DAYS && skin.itch >= INFECT_AT && !skin.rx) { skin.state = 'infected'; skin.heal = 0; notes.push('infected'); }
  }
  // 재도전 시험: 시험이 끝난 뒤 예전 재료를 다시 먹여 가려움이 돌아오면 그 재료가 원인
  if (skin.challenge && !skin.found) {
    if (exposed && skin.itch >= ITCHY_AT) { skin.found = allergy; skin.challenge = null; notes.push('found'); }
    else if (day - skin.challenge.start >= 14) { skin.challenge = null; notes.push('challenge_clear'); }
  }
  if (skin.trial && !skin.trial.done && onTrialDays >= 28 && skin.state === 'ok') notes.push('trial_better');
  if (skin.state === 'itchy') { fx.health -= 1; }
  if (skin.state === 'infected') { fx.health -= 3; fx.bond -= 1; }
  return { fx, notes, exposed };
}
