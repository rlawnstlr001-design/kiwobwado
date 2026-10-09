// 키워봐도될까 — 내 생활 그대로 30일 키워 보고 반려 준비도를 확인하는 입양 전 체험
import * as db from './db.js?v=202610091653';
import * as E from './engine.js?v=202610091653';
import { C, loadContent, eventById, lessonById, foodById } from './content.js?v=202610091653';
import { track } from './track.js?v=202610091653';
import { roomHTML, mountRoom, timeOfDay, loadAnim, clipInfo } from './room.js?v=202610091653';
import { openGames, GAMES, titleOf } from './games.js?v=202610091653';
import * as K from './care.js?v=202610091653';
import { openShop, openVet, openTreats } from './shop.js?v=202610091653';
import { isApp, initNative, scheduleCare, exactAlarm } from './native.js?v=202610091653';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 빠른 체험(지인 테스트용): 주소에 ?dev 또는 설정에서 켜기 — 시간을 앞으로 돌려 30일을 짧게 겪어 본다
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 저장 불가 */ } };
let DEV = new URLSearchParams(location.search).has('dev') || lsGet('kiwo:fast') === '1';
const { won, toMin, toHM, TYPES, COURSE_DAYS } = E;

// ---------- 상태 ----------
const fresh = () => ({
  profile: null, stats: E.startStats(), results: {}, arrange: {}, closed: [], lastClosed: 0,
  dayEvents: {}, answers: [], pending: [], seen: [], chains: [], triggers: [], ledger: [],
  quiz: { right: 0, total: 0 }, offset: 0, petted: {}, freePlay: {},
  coins: 0, earned: {}, best: {}, coinLog: [], // 미니게임 코인(1코인 = 1,000원)
  wearing: { neck: null, head: null }, inv: null, skin: null, allergy: null, vet: { visits: 0, lastExam: null }, buyLog: [], treatLog: {}, careNotes: [], // 살림·피부(care.js)
});
const COIN_CAP = 50; // 하루에 벌 수 있는 코인
let S = fresh();
const save = () => db.put('kv', S, 'state');

const now = () => new Date(Date.now() + S.offset);
const todayKey = () => E.dayKeyOf(now());
const nowMin = () => { const d = now(); return d.getHours() * 60 + d.getMinutes(); };
const P = () => S.profile;
const T = () => TYPES[P().type];
const species = () => T().species;
const petName = () => P()?.name || '아이';
const fill = (t) => E.fill(t, petName());
const dayNow = () => E.dayNo(P().startKey, todayKey());
const keyOf = (n) => E.addDays(P().startKey, n - 1);
const imgOf = (type, stage) => `art/pet/${type}_${stage}.webp`;
const word = { dog: '강아지', cat: '고양이' };

// ---------- 살림·피부 ----------
// 숨은 알레르기와 데려온 날의 살림은 펫마다 정해진 난수로(같은 사람이면 같은 결과). 예전 저장본에도 채워 준다
function initCare() {
  const r = E.rng(`${P().seed}:care`);
  S.allergy = K.pickAllergy(r, C.shop.allergy[species()]);
  S.inv = K.starterInv(C.shop, species(), S.allergy, r);
  S.skin = K.skinStart();
  S.vet = S.vet ?? { visits: 0, lastExam: null };
}
const careApi = {
  S: () => S, save: () => save(), shop: () => C.shop, costs: () => C.costs, species: () => species(), type: () => P().type,
  day: () => dayNow(), key: () => todayKey(), weeks: () => E.ageWeeks(dayNow()), weight: () => E.weightClass(P().type, E.ageWeeks(dayNow())),
  toast: (m) => toast(m), openSheet: (h, o) => openSheet(h, o), showSources: (k) => showSources(k), track: (n) => track(n), won: (n) => won(n),
  fx: (st, f) => E.applyFx(st, f), room: () => ROOM, rerender: () => route(),
};
const NOTE = {
  itch_start: ['피부', '{name:이/가} 자꾸 몸을 긁고 발을 핥아요', '가려움의 흔한 원인은 벼룩·진드기, 피부 감염, 아토피, 음식 알레르기예요. 병원에서 원인을 하나씩 좁혀 가요.'],
  infected: ['피부', '긁은 자리가 빨개지고 냄새가 나요', '계속 긁으면 피부에 2차 세균 감염이 생길 수 있어요. 병원에 가 보세요.'],
  healed: ['피부', '피부 감염이 가라앉았어요', '처방대로 꾸준히 치료한 덕분이에요. 가려움의 원인(음식 등)이 남아 있으면 다시 생길 수 있어요.'],
  itch_gone: ['피부', '가려움이 줄었어요', '요즘 덜 긁어요. 무엇이 달라졌는지(사료·간식) 기억해 두세요.'],
  trial_broken: ['피부', '식이 제한 중에 다른 걸 먹였어요', '처방 사료와 물 말고 다른 걸 먹으면 시험 결과를 믿기 어려워져요. 간식·다른 사료는 시험이 끝날 때까지 참아요.'],
  trial_better: ['피부', '식이 제한 4주째, 가려움이 거의 사라졌어요', '병원에서 재도전 시험(예전 사료를 다시 먹여 원인 확인)을 상의해 보세요.'],
  found: ['피부', '원인을 찾았어요', ''],
  challenge_clear: ['피부', '다시 먹여도 괜찮았어요', '2주 동안 예전 사료를 먹였는데 가려움이 돌아오지 않았어요. 그 사료의 재료는 원인이 아닐 가능성이 커요.'],
  food_out: ['살림', '사료가 다 떨어졌어요', '펫샵에서 사 와야 내일 밥을 줄 수 있어요.'],
};

// ---------- 앱 돌봄 알림 ----------
// 오늘 남은 요청과 내일 요청을 그 시각에 알린다(집 비운 시간의 요청·빠른 체험은 빼고)
function careAlarms(ask) {
  if (!isApp || !P() || S.offset) return;
  const d = dayNow(), at = (key, hm) => { const [y, m, dd] = key.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };
  const items = [];
  for (const n of [d, d + 1]) {
    if (n < 1 || n > COURSE_DAYS) continue;
    const key = keyOf(n);
    for (const t of E.dayPlan(P(), key)) {
      const when = at(key, t.time);
      if (t.away || when <= new Date() || statusFor(t, key, n)) continue;
      items.push({ at: when, title: `${petName()} — ${t.label}`, body: `지금 ${t.label} 시간이에요. ${E.WINDOW}분 안에 챙기면 '제때'예요.` });
    }
  }
  scheduleCare(items, ask);
}

// ---------- 알림·시트 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
function openSheet(html, { onClose } = {}) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-back"></div><section class="sheet" role="dialog" aria-modal="true"><span class="grip" aria-hidden="true"></span>${html}</section>`;
  root.classList.add('on');
  const close = () => { root.classList.remove('on'); root.innerHTML = ''; onClose?.(); };
  root.querySelector('.sheet-back').addEventListener('click', close);
  const sheet = root.querySelector('.sheet');
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  return { sheet, close };
}
function sourcesHTML(keys) {
  const list = [...new Set(keys)].map((k) => C.sources[k]).filter(Boolean);
  return `<ul class="src-list">${list.map((s) => `<li><span class="grade ${s.grade}">${s.grade}</span><b>${esc(s.org)}</b> — ${esc(s.title)}${s.year ? ` (${s.year})` : ''}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></li>`).join('')}</ul>
    <p class="fine">A 법령·정부·수의학회 · B 대형 조사 · C 언론·업체 공개가(참고). 진료비는 2025 진료비 게시제 전국 평균이에요.</p>`;
}
function showSources(keys) {
  openSheet(`<h2>출처</h2>${sourcesHTML(keys)}<button class="btn btn-wide" data-close>닫기</button>`);
}

// ---------- 하루 처리 (지난날 마감·사건 준비) ----------
function arrangeOf(key) { return S.arrange[key] ?? null; }
function statusFor(task, key, n) {
  const r = S.results[task.id];
  if (r) return r;
  const arr = arrangeOf(key);
  if (task.away && arr && arr !== 'none') return { status: 'done', how: arr };
  if (n === 1 && toMin(task.time) < (P().startMin ?? 0)) return { status: 'skip' };
  return null;
}
function ensureEvents(n) {
  const key = keyOf(n);
  if (S.dayEvents[key]) return;
  const picks = E.pickEvents(P(), n, { events: C.events.items, seen: new Set(S.seen), chains: S.chains, triggers: S.triggers, lateToday: E.isLateDay(P(), key) });
  S.dayEvents[key] = picks.map((e) => e.id);
  for (const e of picks) { S.seen.push(e.id); S.pending.push({ id: e.id, day: n }); }
}
function aloneFor(key, n, visited) {
  if (n !== 1) return E.aloneStretch(P(), key, visited);
  const st = P().startMin ?? 0;
  return E.awaySpans(P(), key).reduce((m, [a, b]) => Math.max(m, b - Math.max(a, st)), 0);
}
function closeDayN(n) {
  const key = keyOf(n);
  const plan = E.dayPlan(P(), key);
  const results = {};
  for (const t of plan) results[t.id] = statusFor(t, key, n) ?? { status: 'missed' };
  const arr = arrangeOf(key);
  const visited = !!arr && arr !== 'none';
  const stretch = aloneFor(key, n, visited);
  const r = E.closeDay(P(), key, plan, results, stretch);
  S.stats = E.applyFx(S.stats, r.fx);
  S.triggers = r.triggers;
  S.closed.push({ day: n, key, count: r.count, alone: stretch, over: r.over, sitter: arr === 'sitter' ? 1 : 0, fx: r.fx });
  if (S.inv) {
    const did = (kind) => plan.some((t) => t.kind === kind && ['done', 'late'].includes(results[t.id]?.status));
    const c = K.closeCareDay(S.inv, S.skin, C.shop, { day: n, fed: did('feed'), cleaned: did('potty') || did('litter'), treatsGiven: S.treatLog[key] || [], allergy: S.allergy, species: species() });
    S.stats = E.applyFx(S.stats, c.fx);
    for (const code of c.notes) S.careNotes.push({ day: n, code, read: false });
  }
  S.lastClosed = n;
  // 마감 후 지난 날의 무작위 사건은 남기지 않는다(병원·법 같은 정해진 일만 이어서)
  S.pending = S.pending.filter((p) => p.day > n || ['fixed', 'chain'].includes(eventById(p.id)?.when.type) || p.day === n);
}
function sync() {
  if (!P()) return;
  const d = dayNow();
  const last = Math.min(d - 1, COURSE_DAYS);
  let changed = false;
  for (let n = S.lastClosed + 1; n <= last; n++) { ensureEvents(n); closeDayN(n); changed = true; }
  if (d <= COURSE_DAYS && !S.dayEvents[keyOf(d)]) { ensureEvents(d); changed = true; }
  if (changed) save();
}
// 사건이 보이는 시각: 평일 = 퇴근 30분 뒤, 주말·재택 = 오전 11시 (야근 사건은 오후 3시)
function eventShowMin(e, n) {
  if (e.when.cond === 'lateNight') return toMin('15:00');
  const key = keyOf(n);
  const spans = E.awaySpans(P(), key);
  if (E.isWeekend(key) || !spans.length) return toMin('11:00');
  return Math.min(spans[0][1] + 30, toMin(P().life.sleep) - 30);
}
function visibleEvents() {
  const d = dayNow();
  return S.pending.filter((p) => p.day < d || (p.day === d && nowMin() >= eventShowMin(eventById(p.id), p.day)));
}

// ---------- 라우팅 ----------
function setTab(name) {
  document.body.dataset.route = name;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  const b = $('#day-badge');
  if (P()) { const d = dayNow(); b.hidden = false; b.textContent = d > COURSE_DAYS ? '체험 완료' : `${d}일째 / ${COURSE_DAYS}`; }
}
function route() {
  if (!P()) return onboarding();
  sync();
  const h = location.hash.replace('#/', '');
  const [name] = h.split('/');
  if (name === 'book') return book();
  if (name === 'learn') return learn();
  if (name === 'report') return report();
  return today();
}
window.addEventListener('hashchange', route);

// ---------- 시작: 입양 서류 작성 ----------
function onboarding() {
  document.body.dataset.route = 'onboard';
  const dr = {
    species: 'dog', type: 'small', route: 'shelter', name: '',
    life: { wake: '07:00', leave: '08:20', back: '19:00', sleep: '23:30', late: 1, weekendOut: false, remote: false },
    home: { kind: 'apt', rent: false, petOK: 'yes' },
    people: { live: 'alone', agree: 'na', helper: false },
    allergy: 'none', budget: 200000,
  };
  let step = 0;
  const N = 9;
  const typesOf = (sp) => Object.entries(TYPES).filter(([, t]) => t.species === sp);
  const chip = (attr, val, cur, label) => `<button class="chip${val === cur ? ' on' : ''}" ${attr}="${val}">${label}</button>`;
  const steps = [
    () => `<p class="ob-k">입양 전 30일 체험</p><h1>키우고 싶은 마음,<br>내 생활로 먼저 확인해 봐요</h1>
      <div class="hero"><figure class="photo"><span class="clip"></span><img src="${imgOf('medium', 'baby')}" alt="아기 강아지 사진"><figcaption>입양 신청서 첨부 사진</figcaption></figure></div>
      <p class="ob-sub">내 출퇴근 시간 그대로 아기 ${word.dog}·${word.cat}를 30일 키워 봐요. 밥·배변·산책·병원·돈까지 실제 평균값으로 겪고, 끝나면 <b>반려 준비도</b>를 솔직하게 알려 드려요.</p>
      <div class="ob-note">이 앱은 법정 입양 전 교육(동물사랑배움터)을 대신하지 않아요. 교육은 지식, 이 앱은 <b>내 생활에서 감당되는지</b>를 미리 겪어 보는 도구예요. 모든 비용·건강 정보에 출처를 달았어요.</div>`,
    () => `<p class="ob-k">1 / 8 · 누구를 키워 볼까요</p><h1>강아지? 고양이?</h1>
      <div class="pick-grid">${['dog', 'cat'].map((sp) => `<button class="pick${dr.species === sp ? ' on' : ''}" data-sp="${sp}"><img src="${imgOf(sp === 'dog' ? 'medium' : 'short', 'baby')}" alt=""><b>${word[sp]}</b><small>${sp === 'dog' ? '산책·배변 훈련·혼자 있는 시간이 관건' : '화장실·놀이·털 관리, 조용한 책임'}</small></button>`).join('')}</div>
      <p class="fine" style="margin-top:12px">월 양육비 평균(병원비 제외): 강아지 ${won(C.costs.monthly.dog.amount)} · 고양이 ${won(C.costs.monthly.cat.amount)} <button class="src-btn" data-src="kb2025">출처</button></p>`,
    () => `<p class="ob-k">2 / 8 · 어떤 아이인가요</p><h1>성향을 골라 주세요</h1><p class="ob-sub">품종이 아니라 '이런 아이'예요. 운동량·털 관리가 달라요.</p>
      <div class="pick-grid${dr.species === 'dog' ? ' three' : ''}">${typesOf(dr.species).map(([k, t]) => `<button class="pick${dr.type === k ? ' on' : ''}" data-type="${k}"><img src="${imgOf(k, 'adult')}" alt=""><b>${t.label}</b><small>다 크면 ${t.adultKg}<br>${t.exercise}${t.brushDaily ? '<br>빗질 매일' : ''}</small></button>`).join('')}</div>
      <p class="fine" style="margin-top:10px">사진은 다 자란 모습이에요. 체험은 생후 8주 아기부터 시작해요. <button class="src-btn" data-src="kennelclub">운동량 출처</button></p>`,
    () => `<p class="ob-k">3 / 8 · 어디서 데려올까요</p><h1>데려오는 길</h1>
      <div class="opt-list">${Object.entries(C.costs.adopt).map(([k, a]) => `<button class="opt${dr.route === k ? ' on' : ''}" data-route="${k}"><span><b>${a.label}</b><small>${esc(a.note)}</small></span><span class="amt">${a.amount ? won(a.amount) : '지원 제도'}</span></button>`).join('')}</div>
      <button class="src-btn" data-src="kb2025,kara_adopt">출처</button>`,
    () => `<p class="ob-k">4 / 8 · 내 하루</p><h1>평소 하루를 알려 주세요</h1><p class="ob-sub">돌봄 요청이 이 시간에 맞춰 와요. 혼자 있는 시간도 여기서 계산돼요.</p>
      <div class="card" style="margin-top:0">
        <div class="field"><label for="f-wake">일어나는 시간</label><input type="time" id="f-wake" value="${dr.life.wake}"></div>
        <div class="field"><label>재택 근무</label><div class="chips">${chip('data-remote', 'no', dr.life.remote ? 'yes' : 'no', '아니요')}${chip('data-remote', 'yes', dr.life.remote ? 'yes' : 'no', '네')}</div></div>
        <div ${dr.life.remote ? 'hidden' : ''}>
          <div class="field"><label for="f-leave">집을 나서는 시간</label><input type="time" id="f-leave" value="${dr.life.leave}"></div>
          <div class="field"><label for="f-back">집에 오는 시간</label><input type="time" id="f-back" value="${dr.life.back}"></div>
          <div class="field"><label>야근(주)</label><div class="chips">${[0, 1, 2, 3].map((n) => chip('data-late', String(n), String(dr.life.late), n ? `${n}번` : '없음')).join('')}</div></div>
        </div>
        <div class="field"><label for="f-sleep">자는 시간</label><input type="time" id="f-sleep" value="${dr.life.sleep}"></div>
        <div class="field"><label>토요일 외출</label><div class="chips">${chip('data-wout', 'no', dr.life.weekendOut ? 'yes' : 'no', '집에 있어요')}${chip('data-wout', 'yes', dr.life.weekendOut ? 'yes' : 'no', '보통 나가요')}</div></div>
      </div>`,
    () => `<p class="ob-k">5 / 8 · 사는 곳</p><h1>집은 어떤가요?</h1>
      <div class="q"><p>집 형태</p><div class="chips">${[['apt', '아파트·빌라'], ['oneroom', '원룸·오피스텔'], ['house', '단독주택']].map(([v, l]) => chip('data-kind', v, dr.home.kind, l)).join('')}</div></div>
      <div class="q"><p>자가인가요, 임대인가요?</p><div class="chips">${chip('data-rent', 'no', dr.home.rent ? 'yes' : 'no', '자가·가족 집')}${chip('data-rent', 'yes', dr.home.rent ? 'yes' : 'no', '전월세')}</div></div>
      <div class="q" ${dr.home.rent ? '' : 'hidden'}><p>계약서에 반려동물이 허락돼 있나요?</p><div class="chips">${[['yes', '허락받았어요'], ['no', '금지예요'], ['unknown', '잘 몰라요']].map(([v, l]) => chip('data-petok', v, dr.home.petOK, l)).join('')}</div></div>
      <p class="fine" style="margin-top:14px">해외 입양 기관들은 세입자에게 집주인 허락부터 확인해요. <button class="src-btn" data-src="dogstrust_ready,korea_checklist">출처</button></p>`,
    () => `<p class="ob-k">6 / 8 · 함께 사는 사람</p><h1>누구와 살고 있나요?</h1>
      <div class="q"><p>함께 사는 사람</p><div class="chips">${chip('data-live', 'alone', dr.people.live, '혼자 살아요')}${chip('data-live', 'family', dr.people.live, '가족·동거인과')}</div></div>
      <div class="q" ${dr.people.live === 'family' ? '' : 'hidden'}><p>모두 동의했나요?</p><div class="chips">${chip('data-agree', 'all', dr.people.agree, '모두 찬성')}${chip('data-agree', 'some', dr.people.agree, '반대하는 사람이 있어요')}</div></div>
      <div class="q"><p>바쁠 때 부탁할 사람이 있나요?</p><div class="chips">${chip('data-helper', 'yes', dr.people.helper ? 'yes' : 'no', '있어요')}${chip('data-helper', 'no', dr.people.helper ? 'yes' : 'no', '없어요')}</div></div>
      <div class="q"><p>동물 털 알레르기는?</p><div class="chips">${[['none', '없어요'], ['yes', '있는 사람이 있어요'], ['unknown', '확인 안 해 봤어요']].map(([v, l]) => chip('data-allergy', v, dr.allergy, l)).join('')}</div></div>
      <p class="fine" style="margin-top:14px">많은 입양 단체가 가족 전원 동의를 입양 조건으로 둬요. <button class="src-btn" data-src="kara_adopt,korea_checklist">출처</button></p>`,
    () => `<p class="ob-k">7 / 8 · 돈</p><h1>한 달에 얼마까지 쓸 수 있나요?</h1><p class="ob-sub">사료·용품·병원비·돌봄비를 모두 합쳐서요.</p>
      <p class="budget-out" id="budget-out">${won(dr.budget)}</p>
      <input type="range" id="f-budget" min="50000" max="600000" step="10000" value="${dr.budget}" aria-label="한 달 예산">
      <div class="cmp"><div><span class="fine">${word[dr.species]} 월 양육비 평균</span><b>${won(C.costs.monthly[dr.species].amount)}</b><span class="fine">병원비 제외</span></div><div><span class="fine">1년이면</span><b>${Math.round(C.costs.yearly[dr.species].min / 10000)}만~${Math.round(C.costs.yearly[dr.species].max / 10000)}만원</b><span class="fine">병원비 포함 범위 [계산]</span></div></div>
      <button class="src-btn" data-src="kb2025,mafra2025">출처</button>`,
    () => `<p class="ob-k">8 / 8 · 이름</p>
      <div class="hero" style="width:min(220px,60vw)"><figure class="photo"><span class="clip"></span><img src="${imgOf(dr.type, 'baby')}" alt=""><figcaption>생후 8주</figcaption></figure></div>
      <h1 class="center">이름을 지어 주세요</h1>
      <input class="ob-input" id="f-name" maxlength="8" placeholder="예: 보리" value="${esc(dr.name)}" autocomplete="off">
      <div class="chips" style="justify-content:center;margin-top:10px">${['보리', '콩이', '두부', '호두', '나비'].map((x) => `<button class="chip" data-nm="${x}">${x}</button>`).join('')}</div>
      <div class="ob-note">오늘부터 30일, 내 하루에 맞춰 돌봄 요청이 와요. 응답 창은 요청 시각부터 ${E.WINDOW}분이에요. 가상이라도 <b>진짜처럼</b> 대해 주세요 — 그래야 결과가 정확해요.</div>
      <div class="q"><p>체험 방식</p><div class="chips">${chip('data-fast', 'no', dr.fast ? 'yes' : 'no', '실제 30일')}${chip('data-fast', 'yes', dr.fast ? 'yes' : 'no', '빠른 체험(시간 앞당기기)')}</div><p class="fine" style="margin:6px 0 0">빠른 체험은 버튼으로 시간을 넘기며 며칠을 금방 겪어 보는 방식이에요. 설정에서 언제든 바꿀 수 있어요.</p></div>`,
  ];
  const ok = () => (step === 8 ? !!dr.name.trim() : true);
  const draw = () => {
    view.innerHTML = `<section class="onboard">${steps[step]()}
      <div class="ob-nav">${step ? '<button class="btn" id="ob-back">이전</button>' : '<span></span>'}<button class="btn btn-main" id="ob-next" ${ok() ? '' : 'disabled'}>${step === 0 ? '체험 시작하기' : step === N - 1 ? `${esc(dr.name || '이 아이')}${dr.name ? E.josa(dr.name, '과/와').slice(-1) : '와'} 30일 시작` : '다음'}</button></div></section>`;
    window.scrollTo(0, 0);
  };
  const readTimes = () => {
    for (const [id, k] of [['f-wake', 'wake'], ['f-leave', 'leave'], ['f-back', 'back'], ['f-sleep', 'sleep']]) { const el = $('#' + id); if (el?.value) dr.life[k] = el.value; }
  };
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.src) return showSources(b.dataset.src.split(','));
    readTimes();
    if (b.id === 'ob-back') { step--; return draw(); }
    if (b.id === 'ob-next') {
      if (step === 4 && !dr.life.remote && toMin(dr.life.back) <= toMin(dr.life.leave)) return toast('집에 오는 시간이 나서는 시간보다 늦어야 해요');
      if (step < N - 1) { step++; return draw(); }
      return start(dr);
    }
    const d = b.dataset;
    if (d.sp) { dr.species = d.sp; dr.type = d.sp === 'dog' ? 'small' : 'short'; }
    if (d.type) dr.type = d.type;
    if (d.route) dr.route = d.route;
    if (d.remote) dr.life.remote = d.remote === 'yes';
    if (d.late) dr.life.late = Number(d.late);
    if (d.wout) dr.life.weekendOut = d.wout === 'yes';
    if (d.kind) dr.home.kind = d.kind;
    if (d.rent) { dr.home.rent = d.rent === 'yes'; dr.home.petOK = dr.home.rent ? 'unknown' : 'yes'; }
    if (d.petok) dr.home.petOK = d.petok;
    if (d.live) { dr.people.live = d.live; dr.people.agree = d.live === 'family' ? 'all' : 'na'; }
    if (d.agree) dr.people.agree = d.agree;
    if (d.helper) dr.people.helper = d.helper === 'yes';
    if (d.allergy) dr.allergy = d.allergy;
    if (d.nm) dr.name = d.nm;
    if (d.fast) dr.fast = d.fast === 'yes';
    draw();
  };
  view.oninput = (e) => {
    if (e.target.id === 'f-budget') { dr.budget = Number(e.target.value); $('#budget-out').textContent = won(dr.budget); }
    if (e.target.id === 'f-name') { dr.name = e.target.value.trim(); $('#ob-next').disabled = !ok(); $('#ob-next').textContent = dr.name ? `${dr.name}${E.josa(dr.name, '과/와').slice(-1)} 30일 시작` : '이름을 지어 주세요'; }
  };
  draw();
}

function start(dr) {
  view.onclick = null; view.oninput = null;
  S = fresh();
  const key = todayKey();
  if (dr.fast) { DEV = true; lsSet('kiwo:fast', '1'); }
  S.profile = { ...dr, seed: crypto.randomUUID?.() ?? String(Math.random()), startKey: key, startMin: nowMin(), startedAt: Date.now() };
  const a = C.costs.adopt[dr.route];
  if (a.amount) S.ledger.push({ day: 1, label: `입양비 — ${a.label}`, amount: a.amount, src: a.src });
  const m = C.costs.monthly[TYPES[dr.type].species];
  S.ledger.push({ day: 1, label: '첫 달 양육비(사료·간식·용품 평균, 병원비 제외)', amount: m.amount, src: m.src });
  initCare();
  save();
  track('start');
  careAlarms(true); // 앱: 첫 돌봄 알림 허락을 여기서 묻는다
  location.hash = '#/';
  route();
  toast(`${dr.name}${E.josa(dr.name, '이/가').slice(-1)} 집에 왔어요`);
}

// ---------- 오늘 ----------
// 지금 모습: 문구 + 상태 그림(평소·기쁨·배고픔·잠·아픔·말썽)
function moodOf(plan, key) {
  const nm = nowMin();
  const sleep = toMin(P().life.sleep), wake = toMin(P().life.wake);
  if (nm >= sleep || nm < wake) return { text: '새근새근 자고 있어요', state: 'sleep' };
  const hungry = plan.some((t) => t.kind === 'feed' && E.taskPhase(t, nm) !== 'early' && !statusFor(t, key, dayNow()));
  if (hungry) return { text: '배가 고파서 밥그릇 앞을 서성여요', state: 'hungry' };
  if (S.stats.health < 50) return { text: '기운이 없어 보여요', state: 'sick' };
  if (now() - (S.lastDone ?? 0) < 20 * 60000) return { text: species() === 'dog' ? '신이 나서 꼬리를 흔들어요' : '기분이 좋아 장난감을 쫓아요', state: 'happy' };
  if (S.stats.habit < 15) return { text: species() === 'dog' ? '심심해서 뭔가를 물어뜯고 있어요' : '심심해서 사고를 치고 있어요', state: 'oops' };
  if (S.stats.bond < 30) return { text: '아직 보호자를 조금 어려워해요', state: 'idle' };
  return { text: species() === 'dog' ? '졸졸 따라다니며 눈을 맞춰요' : '창밖을 구경하다 눈을 깜빡여요', state: 'idle' };
}
const STATE_STAGES = new Set(['baby', 'teen', 'adult']); // 상태 그림(6가지)이 있는 단계
const photoOf = (stage, state) => (STATE_STAGES.has(stage) ? `art/pet/${P().type}_${stage}_${state}.webp` : imgOf(P().type, stage));
function today() {
  setTab('today');
  const d = dayNow();
  if (d > COURSE_DAYS) {
    view.innerHTML = `<section class="card done-day"><span class="stamp">30일 완료</span><h2 style="margin-top:14px">${esc(petName())}${E.josa(petName(), '과/와').slice(-1)} 30일을 함께했어요</h2><p class="sub">이제 반려 준비도 리포트를 확인해 보세요.</p><a class="btn btn-main btn-wide" href="#/report">리포트 보기</a></section>`;
    return;
  }
  const key = todayKey();
  const plan = E.dayPlan(P(), key);
  const nm = nowMin();
  const weeks = E.ageWeeks(d);
  const stage = E.stageOf(weeks);
  const spans = E.awaySpans(P(), key);
  const awayTasks = plan.filter((t) => t.away && statusFor(t, key, d)?.status !== 'skip');
  const arr = arrangeOf(key);
  const stretch = aloneFor(key, d, !!arr && arr !== 'none');
  const limit = E.aloneLimit(species(), weeks);
  const evs = visibleEvents();
  const mood = S.skin?.state !== 'ok' && S.skin ? { text: S.skin.state === 'infected' ? '피부가 빨갛게 부어 계속 긁어요' : '자꾸 몸을 긁고 발을 핥아요', state: S.skin.state === 'infected' ? 'sick' : 'idle' } : moodOf(plan, key);
  const firstAway = awayTasks.length ? Math.min(...awayTasks.map((t) => toMin(t.time))) : 0;
  const canArrange = awayTasks.length > 0 && nm < firstAway + E.WINDOW;
  const helperOK = P().people.helper || P().people.live === 'family';
  const arrLabel = { self: '내가 점심에 들러요', helper: '가족·지인에게 부탁했어요', sitter: '펫시터를 불렀어요', none: '오늘은 못 챙겨요' };
  const sleepNow = nm >= toMin(P().life.sleep) || nm < toMin(P().life.wake);
  const roomState = sleepNow ? 'sleep' : mood.state;
  const acts = actsFor(plan, key, d, nm, stage);
  const openKinds = acts.filter((a) => a.cls === 'now').map((a) => a.kind);
  const NEED = { feed: '배고파요!', potty: '쉬 마려워요', walk: '나가고 싶어요!', play: '놀아 주세요!', litter: '화장실이 지저분해요', train: '뭐 배울까요?', brush: '털이 엉켰어요' };
  const need = !sleepNow && openKinds.length ? NEED[openKinds[0]] : roomState === 'sick' ? '몸이 안 좋아요…' : !sleepNow && S.skin?.state !== 'ok' ? '긁적긁적…' : '';
  const dirty = (kind) => plan.some((t) => t.kind === kind && E.taskPhase(t, nm) !== 'early' && !statusFor(t, key, d));
  const prop = species() === 'dog' ? { pad: dirty('potty') ? 'used' : 'clean' } : { litter: dirty('litter') ? 'used' : 'clean' };
  // 방 안 물건이 맡는 일(밥그릇·패드·화장실·현관)은 물건을 누르고, 나머지는 오른쪽 아래 도구로
  const OBJ = new Set(species() === 'dog' ? ['feed', 'potty', 'walk'] : ['feed', 'litter']);
  const spots = Object.fromEntries(acts.filter((a) => OBJ.has(a.kind)).map((a) => [a.kind, { cls: a.cls, sub: a.sub }]));
  const tools = acts.filter((a) => !OBJ.has(a.kind));
  tools.push({ kind: 'treat', label: '간식', icon: 'treat', cls: '', sub: `${Object.values(S.inv.treats).reduce((x, y) => x + y, 0)}개` });
  if (S.skin.rx && species() === 'dog') { const w = S.skin.baths.filter((x) => x > d - 7).length; tools.push({ kind: 'bath', label: '약욕', icon: 'bath', cls: w < K.BATHS_PER_WEEK && !S.skin.baths.includes(d) ? 'now' : 'done', sub: `이번 주 ${w}/${K.BATHS_PER_WEEK}` }); }
  if (S.skin.rx && species() === 'cat') { const t = S.skin.med.includes(d); tools.push({ kind: 'meds', label: '약', icon: 'pill', cls: t ? 'done' : 'now', sub: t ? '오늘 ✓' : '지금!' }); }
  const low = (n) => (n <= 2 ? ' class="low"' : '');
  const foodLeft = K.ensureFood(S.inv) ? S.inv.food[S.inv.cur] : 0;
  const notes = S.careNotes.map((x, i) => ({ ...x, i })).filter((x) => !x.read).slice(-3);
  const mg = (k, label, c) => `<span>${label}<i style="--v:${S.stats[k]}%;--c:${c}"></i></span>`;
  const KIND = { vet: '병원', food: '음식', behavior: '행동', life: '생활', law: '법·의무' };
  const awayAlert = awayTasks.length && (canArrange || arr);
  view.innerHTML = `<section class="game" id="game">
    ${roomHTML({ type: P().type, stage, state: roomState, tod: timeOfDay(nm), need, prop: { ...prop, bowl: 'empty' }, spots })}
    <div class="hud hud-tl"><div class="hud-card">
      <div class="hud-name"><b>${esc(petName())}</b><span>생후 ${Math.floor(weeks)}주 · ${d}일째/${COURSE_DAYS}</span><time>${toHM(nm)}</time></div>
      <div class="mini-g">${mg('health', '건강', 'var(--sky)')}${mg('bond', '마음', 'var(--apricot)')}${mg('habit', '습관', 'var(--forest)')}</div>
      <p class="hud-stock"><span${low(foodLeft)}>사료 ${foodLeft}일분</span><span${low(species() === 'dog' ? S.inv.pads : S.inv.litter)}>${species() === 'dog' ? '패드' : '모래'} ${species() === 'dog' ? S.inv.pads : S.inv.litter}일분</span></p>
      <p class="hud-mood">${esc(fill(`{name:은/는} ${sleepNow ? '새근새근 자고 있어요' : mood.text}`))}</p>
    </div>
      ${evs.map((p) => { const e = eventById(p.id); return `<button class="alert hot" data-ev="${e.id}"><span class="pill ${e.kind}">${KIND[e.kind]}</span><span>${esc(fill(e.title))}</span></button>`; }).join('')}
      ${notes.map((x) => `<button class="alert hot" data-note="${x.i}"><span class="pill vet">${NOTE[x.code][0]}</span><span>${esc(fill(NOTE[x.code][1]))}</span></button>`).join('')}
      ${awayAlert ? `<button class="alert${arr ? '' : ' hot'}" data-hud="away"><span class="pill life">낮</span><span>${arr ? arrLabel[arr] : `${toHM(spans[0][0])}~${toHM(spans[0][1])} 누가 챙길까요?`}</span></button>` : ''}
      <button class="alert" data-hud="plan"><span class="pill law">오늘</span><span>일정 · 혼자 ${stretch ? `${Math.floor(stretch / 60)}시간${stretch % 60 ? ` ${stretch % 60}분` : ''}` : '없음'}${limit && stretch > limit ? ' ⚠' : ''}</span></button>
    </div>
    <nav class="hud hud-tr" aria-label="메뉴">
      <button class="hud-btn coin" data-hud="wallet" aria-label="코인"><i class="ci"></i> ${S.coins}</button><button class="hud-btn" data-hud="shop">샵</button><button class="hud-btn" data-hud="vet">병원</button><button class="hud-btn" data-hud="games">미니게임</button>
      <button class="hud-btn icon" data-hud="menu" aria-label="메뉴·설정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg></button>
    </nav>
    <div class="hud hud-br">${tools.map((a) => `<button class="tool ${a.cls}" data-act="${a.kind}">${ICON[a.icon]}<b>${a.label}</b><small>${a.sub}</small></button>`).join('')}</div>
    ${DEV ? `<div class="hud hud-dev"><button class="hud-btn" data-dev="h">+1시간</button><button class="hud-btn" data-dev="h3">+3시간</button><button class="hud-btn" data-dev="d">다음 날</button></div>` : ''}
    <div class="rotate-hint${lsGet('kiwo:portrait') ? ' dismissed' : ''}" id="rotate-hint"><b>휴대폰을 가로로 돌려 주세요</b><p>방 전체가 한 화면에 보여요.</p>
      <div class="chips" style="justify-content:center"><button class="btn btn-main" data-hud="land">가로 화면으로</button><button class="btn" data-hud="portrait">세로로 볼게요</button></div></div>
  </section>`;
  view.onclick = onTodayClick;
  ROOM = mountRoom({
    type: P().type, stage, state: roomState,
    wear: Object.values(S.wearing).filter(Boolean).map((id) => C.shop.items.find((i) => i.id === id)).filter(Boolean).map((i) => ({ src: `art/wear/${i.art}.webp`, slot: i.slot, wf: i.wf, fb: i.fb })),
    canPet: () => !sleepNow,
    onStroke: (n) => {
      if (sleepNow) { if (n === 1) ROOM?.nudge('자는 아이는 깨우지 말고 쉬게 둬요'); return; }
      if (n === 3) {
        const k = todayKey();
        S.petted[k] = (S.petted[k] || 0) + 1;
        if (S.petted[k] <= 5) { S.stats = E.applyFx(S.stats, { bond: 1 }); save(); }
      }
    },
  });
  track('day_open');
  careAlarms(false);
}
let ROOM = null;
let BUSY = false;
const ICON = {
  bowl: '<svg viewBox="0 0 32 32"><path d="M4 15h24c0 7-5 11-12 11S4 22 4 15z"/><path d="M10 12c1-2 3-3 6-3s5 1 6 3"/></svg>',
  pad: '<svg viewBox="0 0 32 32"><rect x="5" y="7" width="22" height="18" rx="2"/><path d="M9 11h14M9 16h14M9 21h9"/></svg>',
  litter: '<svg viewBox="0 0 32 32"><path d="M4 13h24l-3 12H7z"/><path d="M8 13c2-3 5-4 8-4s6 1 8 4"/></svg>',
  leash: '<svg viewBox="0 0 32 32"><circle cx="9" cy="9" r="5"/><path d="M13 12l12 13M22 25h5v-5"/></svg>',
  ball: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><path d="M8 11c5 2 11 2 16 0M8 21c5-2 11-2 16 0"/></svg>',
  feather: '<svg viewBox="0 0 32 32"><path d="M6 26L22 10"/><path d="M22 10c4-4 6-4 6-4s0 6-5 9c-3 2-6 1-6 1s-1-3 5-6z"/></svg>',
  star: '<svg viewBox="0 0 32 32"><path d="M16 5l3 7 7 .6-5.4 4.6 1.7 7.3L16 20.8 9.7 24.5l1.7-7.3L6 12.6l7-.6z"/></svg>',
  comb: '<svg viewBox="0 0 32 32"><rect x="5" y="9" width="22" height="6" rx="2"/><path d="M8 15v8M12 15v8M16 15v8M20 15v8M24 15v8"/></svg>',
  treat: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><circle cx="12" cy="13" r="1.3"/><circle cx="19" cy="12" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>',
  bath: '<svg viewBox="0 0 32 32"><path d="M4 16h24v3a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7z"/><path d="M8 16V8a3 3 0 0 1 6 0"/><circle cx="20" cy="10" r="1.5"/><circle cx="24" cy="7" r="1"/></svg>',
  pill: '<svg viewBox="0 0 32 32"><rect x="5" y="11" width="22" height="10" rx="5" transform="rotate(-35 16 16)"/><path d="M13 9l6 14" /></svg>',
  hand: '<svg viewBox="0 0 32 32"><path d="M10 28c-3-3-5-7-6-11-1-2 2-3 3-1l2 3V8c0-2 3-2 3 0v8h1V5c0-2 3-2 3 0v11h1V7c0-2 3-2 3 0v10h1V10c0-2 3-2 3 0v11c0 4-1 7-3 9z"/></svg>',
};
// 할 일 버튼과 지금 상태: 지금!/늦었어요/다음 시각/오늘 완료/집 비움
function actsFor(plan, key, d, nm, stage) {
  const dog = species() === 'dog';
  const list = dog
    ? [['feed', '밥 주기', 'bowl'], ['potty', '패드 갈기', 'pad'], ['walk', stage === 'baby' ? '바깥 구경' : '산책', 'leash'], ['play', '놀아 주기', 'ball'], ['train', '훈련', 'star'], ['brush', '빗질', 'comb']]
    : [['feed', '밥 주기', 'bowl'], ['litter', '화장실', 'litter'], ['play', '사냥 놀이', 'feather'], ['brush', '빗질', 'comb'], ['pet', '쓰다듬기', 'hand'], ['free', '장난감', 'ball']];
  return list.map(([kind, label, icon]) => {
    if (kind === 'pet') return { kind, label, icon, cls: '', sub: '몸을 문질러요' };
    if (kind === 'free') return { kind, label, icon, cls: '', sub: '언제든' };
    const ts = plan.filter((t) => t.kind === kind);
    if (!ts.length) return { kind, label, icon, cls: '', sub: '언제든' };
    const open = ts.find((t) => !statusFor(t, key, d) && E.taskPhase(t, nm) !== 'early' && !(t.away && arrangeOf(key) === 'none'));
    if (open) {
      if (open.away && !arrangeOf(key)) return { kind, label, icon, cls: 'away', sub: '집 비움', task: open };
      return { kind, label, icon, cls: 'now', sub: E.taskPhase(open, nm) === 'open' ? '지금!' : '늦었어요', task: open };
    }
    const next = ts.find((t) => !statusFor(t, key, d) && E.taskPhase(t, nm) === 'early');
    if (next) return { kind, label, icon, cls: '', sub: next.time, next };
    return { kind, label, icon, cls: 'done', sub: '오늘 완료' };
  });
}
async function doAct(kind) {
  if (BUSY || !ROOM) return;
  const key = todayKey(), d = dayNow(), nm = nowMin();
  const plan = E.dayPlan(P(), key);
  const a = actsFor(plan, key, d, nm, E.stageOf(E.ageWeeks(d))).find((x) => x.kind === kind);
  if (kind === 'pet') return ROOM.nudge('아이 몸에 손을 대고 살살 문질러 보세요');
  if (kind === 'treat') return openTreats(careApi);
  if (kind === 'bath' || kind === 'meds') return careAct(kind);
  if (kind === 'walk' && a?.cls === 'now' && S.wearing.neck !== 'w_tag') toast('인식표 없이 외출하면 과태료 대상이에요 — 펫샵 옷·액세서리에서 달아 주세요');
  if (kind === 'feed' && a?.cls === 'now' && !K.ensureFood(S.inv)) { ROOM.nudge('사료가 없어요 — 펫샵에서 사 와요'); return setTimeout(() => openShop(careApi, 'food'), 900); }
  if (kind === 'potty' && a?.cls === 'now' && S.inv.pads <= 0) { ROOM.nudge('새 패드가 없어요 — 펫샵에서 사 와요'); return setTimeout(() => openShop(careApi, 'hygiene'), 900); }
  if (kind === 'litter' && a?.cls === 'now' && S.inv.litter <= 0) { ROOM.nudge('모래가 없어요 — 펫샵에서 사 와요'); return setTimeout(() => openShop(careApi, 'hygiene'), 900); }
  if (nm >= toMin(P().life.sleep) || nm < toMin(P().life.wake)) return ROOM.nudge('지금은 잘 시간이에요');
  if (a?.task && a.cls === 'now') {
    BUSY = true;
    const status = E.judge(a.task, nm);
    S.results[a.task.id] = { status, at: nm };
    S.lastDone = now().getTime();
    await save();
    track('task_done');
    await ROOM.play(kind);
    BUSY = false;
    toast(status === 'done' ? `${a.task.label} — 제때 했어요` : `${a.task.label} — 늦었지만 챙겼어요`);
    return today();
  }
  if (a?.cls === 'away') return ROOM.nudge('지금은 집에 없어요 — 아래에서 낮 돌봄을 정해요');
  // 요청이 없을 때 자유롭게 놀아 주기: 하루 3번까지 마음 +1
  if (kind === 'play' || kind === 'free') {
    const n = S.freePlay[key] || 0;
    if (n >= 3) return ROOM.nudge('오늘은 충분히 놀았어요. 쉬는 것도 중요해요');
    BUSY = true;
    S.freePlay[key] = n + 1;
    S.stats = E.applyFx(S.stats, { bond: 1 });
    S.lastDone = now().getTime();
    await save();
    await ROOM.play('play');
    BUSY = false;
    return today();
  }
  if (a?.next) {
    const tip = kind === 'feed' ? ' 밥은 정해진 시간에 정해진 양을 주는 게 좋아요.' : '';
    return ROOM.nudge(`다음 ${a.next.label}은 ${a.next.time}예요.${tip}`);
  }
  return ROOM.nudge(`오늘 ${a?.label ?? ''}은 다 했어요`);
}
// 약욕(개, 주 2회)·먹는 약(고양이, 하루 1번) — 병원에서 처방받았을 때만
async function careAct(kind) {
  const d = dayNow();
  const sk = S.skin;
  if (kind === 'bath') {
    if (S.inv.medshampoo <= 0) return ROOM.nudge('약용 샴푸를 다 썼어요 — 병원에서 다시 처방받아요');
    if (sk.baths.includes(d)) return ROOM.nudge('오늘은 이미 씻겼어요. 너무 자주 씻기면 피부가 마를 수 있어요');
    S.inv.medshampoo--; sk.baths.push(d);
  } else {
    if (S.inv.meds <= 0) return ROOM.nudge('약을 다 먹였어요');
    if (sk.med.includes(d)) return ROOM.nudge('오늘 약은 이미 먹였어요');
    S.inv.meds--; sk.med.push(d);
  }
  if (S.inv.medshampoo <= 0 && S.inv.meds <= 0) sk.rx = sk.state === 'infected';
  BUSY = true;
  await save();
  track(kind);
  await ROOM.play(kind);
  BUSY = false;
  today();
}
function openNote(i) {
  const nt = S.careNotes[i];
  if (!nt) return;
  nt.read = true; save();
  const [tag, title, text] = NOTE[nt.code];
  const body = nt.code === 'found' ? `예전 사료를 다시 먹였더니 가려움이 돌아왔어요 → <b>${K.PROTEIN[S.skin.found]}</b> 알레르기로 확인됐어요. 앞으로 ${K.PROTEIN[S.skin.found]}이(가) 없는 사료·간식을 골라요. 펫샵에서 피해야 할 상품에 표시가 붙어요.` : esc(text);
  const { sheet, close } = openSheet(`<span class="pill vet">${tag}</span><h2>${esc(fill(title))}</h2><p>${body}</p>
    <div class="chips">${tag === '살림' ? '<button class="chip" data-go="shop">펫샵 가기</button>' : '<button class="chip" data-go="vet">병원 가기</button>'}</div>
    <button class="btn btn-wide" data-close>확인</button>`, { onClose: () => route() });
  sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return; close(); if (b.dataset.go === 'shop') openShop(careApi, 'food'); else openVet(careApi); });
}
function taskRow(t, key, d, nm) {
  const st = statusFor(t, key, d);
  const phase = E.taskPhase(t, nm);
  let right;
  if (st?.status === 'skip') right = '<span class="st skip">시작 전</span>';
  else if (st?.status === 'done') right = `<span class="st done">${st.how ? { self: '내가 들름', helper: '부탁함', sitter: '펫시터' }[st.how] : '제때 ✓'}</span>`;
  else if (st?.status === 'late') right = '<span class="st late">늦음</span>';
  else if (st?.status === 'missed') right = '<span class="st missed">놓침</span>';
  else if (t.away && arrangeOf(key) === 'none') right = '<span class="st missed">못 챙김</span>';
  else if (phase === 'early') right = '<span class="st wait">예정</span>';
  else if (t.away && !arrangeOf(key)) right = phase === 'open' ? '<span class="st late">집 비움</span>' : '<span class="st missed">놓침</span>';
  else right = `<button class="btn btn-sm ${phase === 'open' ? 'btn-main' : 'btn-soft'}" data-task="${t.id}">${phase === 'open' ? '했어요' : '늦게라도 했어요'}</button>`;
  const sub = t.away ? '집 비운 시간' : `${t.minutes}분 정도`;
  return `<li class="task${phase === 'open' && !st ? ' open' : ''}"><time>${t.time}</time><span><span class="t-label">${esc(t.label)}</span><span class="t-sub">${sub}</span></span>${right}</li>`;
}
async function markTask(id) {
  const t = E.dayPlan(P(), todayKey()).find((x) => x.id === id);
  const status = E.judge(t, nowMin());
  S.results[t.id] = { status, at: nowMin() };
  S.lastDone = now().getTime();
  await save();
  track('task_done');
  toast(status === 'done' ? `${t.label} — 제때 했어요` : `${t.label} — 늦었지만 챙겼어요`);
}
async function setArrange(v) {
  const key = todayKey();
  const prev = S.arrange[key];
  if (prev === 'sitter' && v !== 'sitter') S.ledger = S.ledger.filter((l) => !(l.day === dayNow() && l.tag === 'sitter-day'));
  if (v === 'sitter' && prev !== 'sitter') S.ledger.push({ day: dayNow(), label: '낮 돌봄 — 방문 펫시터 1시간', amount: C.costs.care.sitter_hour.amount, src: C.costs.care.sitter_hour.src, tag: 'sitter-day' });
  S.arrange[key] = v;
  await save();
}
async function onTodayClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.src) return showSources(b.dataset.src.split(','));
  if (b.dataset.act) return doAct(b.dataset.act);
  if (b.dataset.ev) return openEvent(b.dataset.ev);
  if (b.dataset.dev) return devAction(b.dataset.dev);
  if (b.dataset.hud) return hudAction(b.dataset.hud);
  if (b.dataset.note) return openNote(Number(b.dataset.note));
}

// ---------- 게임 화면 구석 버튼 ----------
async function goLandscape() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* 전체 화면 불가 */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* iOS 등 방향 고정 불가 */ }
}
function hudAction(k) {
  if (k === 'land') { lsSet('kiwo:portrait', null); return goLandscape(); }
  if (k === 'portrait') { lsSet('kiwo:portrait', '1'); $('#rotate-hint')?.classList.add('dismissed'); return; }
  if (k === 'menu') return openMenu();
  if (k === 'away') return openAway();
  if (k === 'plan') return openPlan();
  if (k === 'games') return openMiniGames();
  if (k === 'wallet') return openWallet();
  if (k === 'shop') return openShop(careApi);
  if (k === 'vet') return openVet(careApi);
}
function openMiniGames() {
  const name = `${P().type}_${E.stageOf(E.ageWeeks(dayNow()))}`;
  const pet = clipInfo(name, 'walk') ?? { src: `art/sprite/${name}_idle.webp`, ratio: 1 };
  track('games_open');
  openGames({
    species: species(), petName: petName(), pet, coins: S.coins, earned: S.earned[todayKey()] || 0, cap: COIN_CAP, best: { ...S.best },
    onReward: (game, score) => {
      const k = todayKey();
      const earned = S.earned[k] || 0;
      const given = Math.max(0, Math.min(GAMES[game].coins(score), COIN_CAP - earned));
      S.coins += given;
      S.earned[k] = earned + given;
      S.best[game] = Math.max(S.best[game] || 0, score);
      if (given) S.coinLog.push({ day: dayNow(), game, score, coins: given });
      save();
      track('game_end');
      return { given, earned: S.earned[k], coins: S.coins };
    },
    onClose: () => route(),
  });
}
function openWallet() {
  const recent = S.coinLog.slice(-6).reverse();
  const { sheet, close } = openSheet(`<h2><i class="ci"></i> 코인 ${S.coins}개</h2>
    <p class="sub">1코인 = 1,000원으로 쳐요. 지금 가진 코인은 실제라면 <b>${won(S.coins * 1000)}</b>이에요. 펫샵·병원 가격은 실제 평균값 그대로라, 사료 한 포대·진료 한 번이 미니게임 몇 판인지 느껴 볼 수 있어요.</p>
    <p class="mood">오늘 번 코인 ${S.earned[todayKey()] || 0} / ${COIN_CAP} — 하루에 일할 수 있는 시간이 정해져 있듯 한도가 있어요.</p>
    ${recent.length ? `<ul class="timeline">${recent.map((l) => `<li class="task"><time>${l.day}일째</time><span><span class="t-label">${titleOf(l.game, species())}</span><span class="t-sub">${l.score}점</span></span><span class="st done">+${l.coins}</span></li>`).join('')}</ul>` : '<p class="fine">아직 번 코인이 없어요. 미니게임으로 모아 보세요.</p>'}
    <button class="btn btn-main btn-wide" id="w-play">미니게임 하러 가기</button><button class="btn btn-wide" data-close>닫기</button>`);
  $('#w-play', sheet).addEventListener('click', () => { close(); openMiniGames(); });
}
function openMenu() {
  const { sheet, close } = openSheet(`<h2>메뉴</h2>
    <div class="menu-grid"><a class="btn" href="#/book" data-close>수첩·가계부</a><a class="btn" href="#/learn" data-close>배움</a><a class="btn" href="#/report" data-close>리포트</a><button class="btn" id="m-full">전체 화면</button></div>
    <button class="btn btn-soft btn-wide" id="m-settings">설정</button><button class="btn btn-wide" data-close>닫기</button>`);
  $('#m-full', sheet).addEventListener('click', () => { close(); goLandscape(); });
  $('#m-settings', sheet).addEventListener('click', () => { close(); openSettings(); });
}
function openAway() {
  const key = todayKey(), d = dayNow(), nm = nowMin();
  const plan = E.dayPlan(P(), key);
  const awayTasks = plan.filter((t) => t.away && statusFor(t, key, d)?.status !== 'skip');
  if (!awayTasks.length) return;
  const spans = E.awaySpans(P(), key);
  const arr = arrangeOf(key);
  const canArrange = nm < Math.min(...awayTasks.map((t) => toMin(t.time))) + E.WINDOW;
  const helperOK = P().people.helper || P().people.live === 'family';
  const { sheet, close } = openSheet(`<h2>${toHM(spans[0][0])}~${toHM(spans[0][1])} 집을 비워요</h2>
    <p class="sub">그사이 ${awayTasks.map((t) => t.label).join('·')}${E.josa(awayTasks.at(-1).label, '이/가').slice(-1)} 있어요. 누가 챙길까요?</p>
    <div class="chips">${[['self', '내가 점심에 들른다'], ...(helperOK ? [['helper', '가족·지인에게 부탁']] : []), ['sitter', `펫시터 1시간 ${won(C.costs.care.sitter_hour.amount)}`], ['none', '못 챙긴다']].map(([v, l]) => `<button class="chip${arr === v ? ' on' : ''}" data-arr="${v}" ${canArrange ? '' : 'disabled'}>${l}</button>`).join('')}</div>
    <p class="fine" style="margin:8px 0 0">'내가 들른다'는 실제로 가능할 때만 골라 주세요.${canArrange ? '' : ' 이미 집을 비운 시간이라 바꿀 수 없어요.'} <button class="src-btn" data-src="dogmate_price">요금 출처</button></p>
    <button class="btn btn-wide" data-close>닫기</button>`, { onClose: () => route() });
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.src) return showSources(b.dataset.src.split(','));
    if (!b?.dataset.arr) return;
    await setArrange(b.dataset.arr);
    close();
  });
}
function openPlan() {
  const key = todayKey(), d = dayNow(), nm = nowMin();
  const plan = E.dayPlan(P(), key);
  const weeks = E.ageWeeks(d);
  const arr = arrangeOf(key);
  const stretch = aloneFor(key, d, !!arr && arr !== 'none');
  const limit = E.aloneLimit(species(), weeks);
  const { sheet, close } = openSheet(`<h2>오늘 일정</h2>
    <ul class="timeline">${plan.map((t) => taskRow(t, key, d, nm)).join('')}</ul>
    <p class="fine" style="margin:8px 0 0">요청 시각부터 ${E.WINDOW}분 안에 하면 '제때', 지나면 '늦음', 그날 안에 못 하면 '놓침'이에요. 앱 버전에선 이 시각에 알림이 와요.</p>
    <div class="card"><h2>오늘 혼자 있는 시간</h2>
      <div class="alone"><div class="alone-bar">${stretch ? `<i class="${limit && stretch > limit ? 'over' : ''}" style="width:${Math.min(100, (stretch / 720) * 100)}%"></i>` : ''}${limit ? `<b style="left:${(limit / 720) * 100}%"></b>` : ''}</div><b>${stretch ? `${Math.floor(stretch / 60)}시간 ${stretch % 60 ? `${stretch % 60}분` : ''}` : '없음'}</b></div>
      <p class="fine" style="margin:6px 0 0">${limit ? `세로선 = 지금 월령의 권장 한계 약 ${Math.round(limit / 60 * 10) / 10}시간 (아기는 '월령 1개월당 1시간', 성견도 4시간 이하)` : '고양이는 혼자 두는 시간의 공식 기준을 찾지 못했어요 — 길수록 놀이·교감이 더 필요해요.'} <button class="src-btn" data-src="hw_potty,rspca_alone">출처</button></p></div>
    <p class="fine">${species() === 'dog' ? '강아지' : '고양이'} 몸에 손가락(마우스)을 대고 문지르면 쓰다듬어 줄 수 있어요.</p>
    <button class="btn btn-wide" data-close>닫기</button>`, { onClose: () => route() });
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.src) return showSources(b.dataset.src.split(','));
    if (!b?.dataset.task) return;
    await markTask(b.dataset.task);
    close();
  });
}

// ---------- 사건 ----------
function openEvent(id) {
  const p = S.pending.find((x) => x.id === id);
  const e = eventById(id);
  if (!p || !e) return;
  const n = p.day;
  const ctx = { w: E.weightClass(P().type, E.ageWeeks(n)), species: species() };
  const evState = { vet: 'sick', food: 'hungry', behavior: 'oops', life: 'idle', law: 'idle' }[e.kind];
  const { sheet, close } = openSheet(`<figure class="photo ev-photo"><img src="${photoOf(E.stageOf(E.ageWeeks(n)), evState)}" alt=""></figure><span class="pill ${e.kind}">${{ vet: '병원', food: '음식', behavior: '행동', life: '생활', law: '법·의무' }[e.kind]}</span>
    <h2>${esc(fill(e.title))}</h2><p>${esc(fill(e.text))}</p>
    <div id="ev-choices">${e.choices.map((c, i) => `<button class="choice" data-ci="${i}">${esc(fill(c.label))}</button>`).join('')}</div>
    <div id="ev-after"></div>
    ${e.vet ? '<p class="disclaimer">수의학적 진단이 아니에요. 실제로 이상 증상이 보이면 바로 동물병원에 문의하세요.</p>' : ''}`, { onClose: () => route() });
  sheet.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.src) return showSources(b.dataset.src.split(','));
    if (b.dataset.lesson) { close(); return openLesson(b.dataset.lesson); }
    if (b.dataset.food) { close(); return openFood(b.dataset.food); }
    if (b.dataset.ci == null) return;
    const c = e.choices[Number(b.dataset.ci)];
    const items = c.cost.map((it) => E.resolveCost(C.costs, it, ctx));
    for (const it of items) S.ledger.push({ day: dayNow(), label: `${fill(e.title)} — ${it.label}`, amount: it.amount, src: it.src });
    S.stats = E.applyFx(S.stats, c.fx);
    S.answers.push({ id: e.id, day: dayNow(), choice: Number(b.dataset.ci), score: c.score, kind: e.kind });
    S.pending = S.pending.filter((x) => x.id !== id);
    if (c.next) S.chains.push({ id: c.next.id, day: Math.min(COURSE_DAYS, n + c.next.after) });
    await save();
    track('event_answer');
    const sum = items.reduce((s, it) => s + it.amount, 0);
    $('#ev-choices', sheet).innerHTML = `<button class="choice" disabled style="border-color:var(--ink)">${esc(fill(c.label))}</button>`;
    $('#ev-after', sheet).innerHTML = `<div class="reply ${c.score > 0 ? 'good' : c.score < 0 ? 'bad' : ''}">
        <b>${c.score > 0 ? '좋은 선택이에요' : c.score < 0 ? '실제라면 위험할 수 있어요' : '이렇게 됐어요'}</b><p style="margin:4px 0 0">${esc(fill(c.reply))}</p>
        ${items.length ? `<p class="cost">장부 +${won(sum)} <span class="fine">(${items.map((it) => `${esc(it.label)} ${won(it.amount)}`).join(' · ')})</span></p>` : ''}
      </div>
      <div class="chips" style="margin-top:10px">${e.lesson ? `<button class="chip" data-lesson="${e.lesson}">레슨: ${esc(lessonById(e.lesson).title)}</button>` : ''}${e.food ? `<button class="chip" data-food="${e.food}">음식 카드 보기</button>` : ''}<button class="chip" data-src="${e.src.join(',')}">출처 보기</button></div>
      <button class="btn btn-main btn-wide" data-close>확인</button>`;
  });
}

// ---------- 수첩 ----------
let bookSeg = 'money';
function book() {
  setTab('book');
  const total = S.ledger.reduce((s, l) => s + l.amount, 0);
  const proj = E.monthlyProjection(P(), C.costs, { sitterPerMonth: sitterMonthly() });
  const y = C.costs.yearly[species()];
  const segs = { money: '가계부', health: '건강 기록', time: '시간 장부' };
  let body = '';
  if (bookSeg === 'money') {
    body = `<section class="card"><span class="label">지금까지 쓴 돈</span><p class="big-num" style="margin:2px 0">${won(total)}</p>
        <div class="cmp"><div><span class="fine">한 달 예상</span><b>${won(proj.total)}</b><span class="fine">양육비 ${won(proj.living)} + 병원비 월 환산 ${won(proj.vet)}${proj.care ? ` + 낮 돌봄 ${won(proj.care)}` : ''}</span></div>
        <div><span class="fine">내 예산</span><b style="color:${P().budget >= proj.total ? 'var(--forest)' : 'var(--warn)'}">${won(P().budget)}</b><span class="fine">${P().budget >= proj.total ? '감당 가능' : `한 달 ${won(proj.total - P().budget)} 부족`}</span></div></div>
        <p class="fine" style="margin:10px 0 0">1년이면 ${Math.round(y.min / 10000)}만~${Math.round(y.max / 10000)}만원 [계산]. 병원비 월 환산 = 치료비를 쓴 집의 2년 치료비 ÷ 24 [계산]. <button class="src-btn" data-src="kb2025,mafra2025,vetfee2025">출처</button></p></section>
      <section class="card"><h2>장부</h2><ul class="ledger">${[...S.ledger].reverse().map((l) => `<li><span>${l.day}일째</span><span>${esc(l.label)}</span><b>${won(l.amount)}</b></li>`).join('') || '<li><span></span><span class="sub">아직 없어요</span><b></b></li>'}</ul></section>`;
  } else if (bookSeg === 'health') {
    const vet = S.answers.filter((a) => ['vet', 'food'].includes(a.kind));
    body = `<section class="card"><h2>병원·건강 기록</h2><ul class="ledger">${vet.map((a) => { const e = eventById(a.id); return `<li><span>${a.day}일째</span><span>${esc(fill(e.title))}<br><small class="sub">${esc(fill(e.choices[a.choice].label))}</small></span><b>${a.score > 0 ? '✓' : a.score < 0 ? '!' : '·'}</b></li>`; }).join('') || '<li><span></span><span class="sub">아직 없어요</span><b></b></li>'}</ul></section>
      <section class="card"><h2>예방접종, 기준이 두 가지</h2>${lessonBody(lessonById('vaccine_two'))}</section>`;
  } else {
    const d = Math.min(dayNow(), COURSE_DAYS + 1);
    const cells = Array.from({ length: COURSE_DAYS }, (_, i) => {
      const n = i + 1;
      const c = S.closed.find((x) => x.day === n);
      let cls = '';
      if (c) { const tot = c.count.done + c.count.late + c.count.missed; const r = tot ? (c.count.done + c.count.late * 0.5) / tot : 1; cls = r >= 0.8 ? 'g' : r >= 0.5 ? 'm' : 'b'; }
      return `<span class="dcell ${cls}${n === d ? ' t' : ''}">${n}</span>`;
    }).join('');
    const plan = E.dayPlan(P(), todayKey());
    const careMin = plan.reduce((s, t) => s + t.minutes, 0);
    const avg = S.closed.length ? Math.round(S.closed.reduce((s, c) => s + c.alone, 0) / S.closed.length) : null;
    body = `<section class="card"><h2>30일 달력</h2><p class="fine" style="margin:0">초록 = 제때 80% 이상 · 연두 = 절반 이상 · 주황 = 절반 미만</p><div class="days">${cells}</div></section>
      <section class="card"><h2>하루에 드는 시간</h2><p class="big-num" style="margin:0">약 ${careMin}분</p><p class="sub" style="margin:4px 0 0">오늘 요청된 돌봄을 모두 더한 시간이에요(이동·청소 시간 제외). ${species() === 'dog' ? `다 크면 운동만 ${T().exercise}예요.` : '고양이 보호자는 실내 놀이에 하루 평균 78분을 쓴대요.'}</p>
      ${avg != null ? `<p class="sub">지난 ${S.closed.length}일 평균 최장 혼자 있는 시간: <b>${Math.floor(avg / 60)}시간 ${avg % 60}분</b></p>` : ''}<button class="src-btn" data-src="kennelclub,kb2025">출처</button></section>`;
  }
  view.innerHTML = `<div class="seg">${Object.entries(segs).map(([k, l]) => `<button class="${bookSeg === k ? 'on' : ''}" data-seg="${k}">${l}</button>`).join('')}</div>${body}`;
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.seg) { bookSeg = b.dataset.seg; return book(); }
    if (b.dataset.src) return showSources(b.dataset.src.split(','));
  };
}
function sitterMonthly() {
  const days = S.closed.length || 1;
  const sit = S.closed.reduce((s, c) => s + c.sitter, 0);
  return Math.round((sit / days) * 30) * C.costs.care.sitter_hour.amount;
}

// ---------- 배움 ----------
let learnSeg = 'food';
let foodSp = null;
const VERDICT = { no: '주면 안 돼요', avoid: '피하세요', small: '조금·조건부', low: '위험 낮음', ok: '소량 괜찮아요' };
function learn() {
  setTab('learn');
  foodSp = foodSp ?? species();
  const segs = { food: '음식 카드', lesson: '레슨', src: '출처 전체' };
  let body = '';
  if (learnSeg === 'food') {
    const items = C.foods.items.filter((f) => f[foodSp]);
    body = `<section class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="chips">${['dog', 'cat'].map((sp) => `<button class="chip${foodSp === sp ? ' on' : ''}" data-fsp="${sp}">${word[sp]}</button>`).join('')}</div><button class="btn btn-sm btn-main" data-quiz>줘도 될까? 퀴즈</button></div>
      <p class="fine" style="margin:8px 0 0">${esc(C.foods.rule.text)}${foodSp === 'cat' ? ` ${esc(C.foods.cat_note)}` : ''}</p>
      <div class="food-grid">${items.map((f) => `<button class="food" data-food="${f.id}">${emojiHTML(f)}<b>${esc(f.name)}</b><span class="verdict ${f[foodSp]}">${VERDICT[f[foodSp]]}</span></button>`).join('')}</div>
      <p class="fine" style="margin-top:10px">퀴즈 기록 ${S.quiz.right}/${S.quiz.total} — 리포트 '지식'에 들어가요.</p></section>`;
  } else if (learnSeg === 'lesson') {
    const ls = C.lessons.items.filter((l) => l.species === 'both' || l.species === species());
    body = `<ul class="lesson-list">${ls.map((l) => `<li><button data-lesson="${l.id}"><b>${esc(l.title)}</b><small>${esc(l.lead)}</small></button></li>`).join('')}</ul>
      <section class="card"><h2>법정 입양 전 교육</h2><p class="sub" style="margin:0">동물사랑배움터의 반려견·반려묘 입양 전 교육(각 90분, 무료)은 이 앱과 함께 꼭 들어 보세요.</p><a class="btn btn-soft btn-wide" href="${C.sources.epis_course.url}" target="_blank" rel="noopener">동물사랑배움터 열기</a></section>`;
  } else {
    body = `<section class="card"><h2>이 앱이 쓰는 모든 출처</h2>${sourcesHTML(Object.keys(C.sources).filter((k) => !k.startsWith('_')))}</section>`;
  }
  view.innerHTML = `<div class="seg">${Object.entries(segs).map(([k, l]) => `<button class="${learnSeg === k ? 'on' : ''}" data-seg="${k}">${l}</button>`).join('')}</div>${body}`;
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.seg) { learnSeg = b.dataset.seg; return learn(); }
    if (b.dataset.fsp) { foodSp = b.dataset.fsp; return learn(); }
    if (b.dataset.food) return openFood(b.dataset.food);
    if (b.dataset.lesson) return openLesson(b.dataset.lesson);
    if (b.dataset.quiz != null) return quiz();
  };
}
const emojiHTML = (f) => (f.emoji ? `<span class="em" aria-hidden="true">${f.emoji}</span>` : `<span class="em txt" aria-hidden="true">${esc(f.name[0])}</span>`);
function openFood(id) {
  const f = foodById(id);
  const row = (sp) => (f[sp] ? `<p style="margin:4px 0"><b>${word[sp]}</b> <span class="verdict ${f[sp]}">${VERDICT[f[sp]]}</span></p>` : '');
  openSheet(`<div class="center">${emojiHTML(f)}</div><h2 class="center">${esc(f.name)}</h2>${row('dog')}${row('cat')}
    ${f.why ? `<p><b>왜?</b> ${esc(f.why)}</p>` : ''}${f.symptom ? `<p><b>증상</b> ${esc(f.symptom)}</p>` : ''}${f.note ? `<p class="sub">${esc(f.note)}</p>` : ''}
    <p class="disclaimer">먹었다면 양·시간·몸무게를 메모하고 바로 동물병원에 전화하세요. 일반 정보이며 진료를 대신하지 않아요.</p>
    <button class="src-btn" data-srcf="${f.src.join(',')}">출처 보기</button><button class="btn btn-wide" data-close>닫기</button>`).sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-srcf]'); if (b) showSources(b.dataset.srcf.split(',')); });
}
function lessonBody(l) {
  return `<p style="margin:0 0 6px"><b>${esc(l.lead)}</b></p>${l.do?.length ? `<ul class="do-list">${l.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${l.dont?.length ? `<ul class="dont-list">${l.dont.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${l.fact ? `<p class="sub">${esc(l.fact)}</p>` : ''}<button class="src-btn" data-srcl="${l.src.join(',')}">출처 보기</button>`;
}
function openLesson(id) {
  const l = lessonById(id);
  openSheet(`<span class="label">레슨</span><h2>${esc(l.title)}</h2>${lessonBody(l)}<button class="btn btn-wide" data-close>닫기</button>`).sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-srcl]'); if (b) showSources(b.dataset.srcl.split(',')); });
}
view.addEventListener('click', (e) => { const b = e.target.closest('[data-srcl]'); if (b) showSources(b.dataset.srcl.split(',')); });
function quiz() {
  const sp = foodSp;
  const pool = C.foods.items.filter((f) => f[sp] && ['no', 'ok', 'small', 'avoid'].includes(f[sp]));
  const r = E.rng(`${Date.now()}`);
  // '안 돼요'만 눌러도 다 맞지 않게 괜찮은 음식을 2개까지 섞는다
  const mix = (a) => a.sort(() => r() - 0.5);
  const safe = mix(pool.filter((f) => ['ok', 'small'].includes(f[sp]))).slice(0, 2);
  const qs = mix([...safe, ...mix(pool.filter((f) => !safe.includes(f) && !['ok', 'small'].includes(f[sp]))).slice(0, 5 - safe.length)]);
  let i = 0, right = 0;
  const { sheet, close } = openSheet('<div id="qz"></div>', { onClose: () => learn() });
  const draw = (fb) => {
    const f = qs[i];
    $('#qz', sheet).innerHTML = i >= qs.length
      ? `<div class="quiz-q"><span class="stamp">${right} / ${qs.length}</span><p>퀴즈 기록이 리포트 '지식'에 들어가요.</p></div><button class="btn btn-main btn-wide" data-close>닫기</button>`
      : `<span class="label">${word[sp]} · ${i + 1} / ${qs.length}</span><div class="quiz-q">${emojiHTML(f)}<h2>${esc(f.name)}, 줘도 될까요?</h2></div>
        ${fb ?? `<div class="quiz-btns"><button class="btn btn-soft" data-a="yes">조금은 괜찮아요</button><button class="btn btn-warn" data-a="no">안 돼요</button></div>`}`;
  };
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a) {
      const f = qs[i];
      const safe = ['ok', 'small'].includes(f[sp]);
      const good = (b.dataset.a === 'yes') === safe;
      if (good) right++;
      S.quiz.total++; if (good) S.quiz.right++;
      await save();
      return draw(`<div class="reply ${good ? 'good' : 'bad'}"><b>${good ? '맞아요' : '아니에요'} — ${VERDICT[f[sp]]}</b><p style="margin:4px 0 0">${esc(f.why || f.note || '')} ${esc(f.symptom || '')}</p></div><button class="btn btn-main btn-wide" data-nx>다음</button>`);
    }
    if (b.dataset.nx != null) { i++; return draw(); }
  });
  draw();
}

// ---------- 리포트 ----------
const LIFESPAN = { small: 13.53, medium: 12.7, large: 11.51, short: 11.18, long: 11.18 }; // Banfield 2023 (개는 체형별, 고양이 전체)
function report() {
  setTab('report');
  const d = dayNow();
  if (S.closed.length < 7) {
    view.innerHTML = `<section class="card locked"><span class="stamp warn">작성 중</span><h2 style="margin-top:14px">7일을 지내면 중간 점검을 볼 수 있어요</h2><p>지금 ${Math.min(d, COURSE_DAYS)}일째 · 마감된 날 ${S.closed.length}일</p><p class="fine">리포트는 지난날의 실제 응답·선택으로만 만들어요.</p></section>`;
    view.onclick = null;
    return;
  }
  const rep = E.buildReport({ profile: P(), days: S.closed, answers: S.answers, costs: C.costs, quiz: S.quiz });
  track('report_view');
  if (S.closed.length >= COURSE_DAYS) track('finish');
  const final = S.closed.length >= COURSE_DAYS;
  const V = { ready: ['지금 준비됐어요', '', '시간·돈·환경·지식·꾸준함이 모두 기준을 넘었어요.'], conditional: ['이런 조건이면 가능해요', 'warn', '몇 가지만 준비하면 함께할 수 있어요.'], notyet: ['아직은 이르다', 'warn', '지금 입양하면 서로 힘들어질 수 있어요. 아래를 먼저 해결해 보세요.'] }[rep.verdict];
  const AX = { time: '시간', money: '돈', env: '환경', knowledge: '지식', consistency: '꾸준함' };
  const life = LIFESPAN[P().type];
  const y = C.costs.yearly[species()];
  view.innerHTML = `
    <section class="card verdict-box"><span class="label">${final ? '30일 최종 리포트' : `중간 점검 · ${S.closed.length}일 기준`}</span><br><span class="stamp ${V[1]}" style="margin-top:10px">${V[0]}</span><h2>${esc(petName())}${E.josa(petName(), '과/와').slice(-1)} ${S.closed.length}일</h2><p class="sub" style="margin:0">${V[2]}</p></section>
    <section class="card"><h2>반려 준비도</h2><div class="axes">${Object.entries(rep.axes).map(([k, v]) => `<div class="axis"><span>${AX[k]}</span><span class="bar"><i class="${v >= 70 ? '' : v >= 50 ? 'mid' : 'low'}" style="width:${v}%"></i></span><span>${v}</span></div>`).join('')}</div>
      <p class="fine" style="margin:10px 0 0">제때 ${rep.counts.done} · 늦음 ${rep.counts.late} · 놓침 ${rep.counts.missed} · 사건 판단 ${S.answers.length}번 · 퀴즈 ${S.quiz.right}/${S.quiz.total}</p></section>
    ${rep.blockers.length ? `<section class="card"><h2>먼저 풀어야 할 것</h2><ul class="tips">${rep.blockers.map((b) => `<li style="border-left-color:var(--warn)">${esc(b)}</li>`).join('')}</ul></section>` : ''}
    ${rep.tips.length ? `<section class="card"><h2>이렇게 준비해 보세요</h2><ul class="tips">${rep.tips.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul></section>` : ''}
    <section class="card"><h2>앞으로의 시간</h2><div class="future"><figure class="photo" style="transform:rotate(2deg)"><img src="${photoOf('adult', 'happy')}" alt="다 자란 모습"><figcaption>다 자라면</figcaption></figure>
      <p class="sub" style="margin:0">${esc(petName())}${E.josa(petName(), '은/는').slice(-1)} 평균적으로 약 <b>${Math.round(life * 10) / 10}년</b>을 살아요. 1년 양육비 ${Math.round(y.min / 10000)}만~${Math.round(y.max / 10000)}만원이면, 평생 약 <b>${Math.round((y.min * life) / 1000000) * 100}만~${Math.round((y.max * life) / 1000000) * 100}만원</b> [계산]. 나이가 들수록 치료비가 늘어요(개 7세·고양이 6세 이후).</p></div>
      <button class="src-btn" data-src="banfield2023,kb2025,mafra2025,aaha_senior2023">출처</button></section>
    <section class="card next-steps"><h2>다음 단계</h2>
      <a href="${C.sources.epis_course.url}" target="_blank" rel="noopener">동물사랑배움터 입양 전 교육<small>반려견·반려묘 각 90분, 무료 — 법정 교육</small></a>
      <a href="https://www.animal.go.kr" target="_blank" rel="noopener">국가동물보호정보시스템<small>지역 보호센터의 입양 기다리는 동물</small></a>
      <p class="fine">이 앱은 입양을 권하거나 말리는 앱이 아니라 판단을 돕는 도구예요.</p></section>
    ${final ? '<button class="btn btn-wide" data-restart>다른 아이로 다시 체험하기</button>' : ''}`;
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.src) return showSources(b.dataset.src.split(','));
    if (b.dataset.restart != null) return confirmReset();
  };
}

// ---------- 설정 ----------
function confirmReset() {
  const { sheet, close } = openSheet(`<h2>처음부터 다시 할까요?</h2><p class="sub">${esc(petName())}의 기록이 모두 지워져요. 되돌릴 수 없어요.</p><button class="btn btn-warn btn-wide" id="do-reset">지우고 다시 시작</button><button class="btn btn-wide" data-close>취소</button>`);
  $('#do-reset', sheet).addEventListener('click', async () => { S = fresh(); await save(); close(); location.hash = '#/'; route(); });
}
$('#btn-settings').addEventListener('click', () => openSettings());
function openSettings() {
  if (!P()) return;
  const { sheet } = openSheet(`<h2>설정</h2>
    <div class="card" style="margin-top:0"><p style="margin:0"><b>${esc(petName())}</b> · ${T().label} · ${E.dayNo(P().startKey, todayKey()) > COURSE_DAYS ? '체험 완료' : `${dayNow()}일째`}</p>
    <p class="sub" style="margin:4px 0 0">기상 ${P().life.wake} · ${P().life.remote ? '재택' : `출근 ${P().life.leave} · 귀가 ${P().life.back}`} · 취침 ${P().life.sleep} · 예산 ${won(P().budget)}</p></div>
    <p class="sub">모든 기록은 이 기기에만 저장돼요. 펫 이름·생활 시간·예산은 서버로 보내지 않아요.</p>
    <p class="disclaimer">비용은 공식 통계·진료비 게시제 평균이며 지역·병원마다 달라요. 건강 정보는 일반 정보이며 진료를 대신하지 않아요.</p>
    <div class="card"><h2>빠른 체험 ${DEV ? '켜짐' : '꺼짐'}</h2><p class="sub" style="margin:0">30일을 기다리지 않고 시간을 앞으로 돌려 볼 수 있어요(체험해 보는 분용). 방 화면 위쪽에 시간 이동 버튼이 생겨요.</p><button class="btn btn-soft btn-wide" id="s-fast">${DEV ? '빠른 체험 끄기' : '빠른 체험 켜기'}</button></div>
    ${isApp ? '<div class="card"><h2>돌봄 알림</h2><p class="sub" style="margin:0">밥·배변·산책 시간마다 알림이 와요. 갤럭시는 <b>알람 및 리마인더</b>를 허용해야 제시각에 와요(안 하면 몇 분 늦을 수 있어요).</p><button class="btn btn-soft btn-wide" id="s-exact">알람 및 리마인더 설정 열기</button></div>' : ''}
    <button class="btn btn-wide" id="s-reset">처음부터 다시</button><button class="btn btn-wide" data-close>닫기</button>`);
  $('#s-reset', sheet).addEventListener('click', confirmReset);
  $('#s-exact', sheet)?.addEventListener('click', async () => { const ok = await exactAlarm(true); toast(ok ? '정확한 알림이 켜져 있어요' : '설정에서 허용해 주세요'); });
  $('#s-fast', sheet).addEventListener('click', () => { DEV = !DEV; lsSet('kiwo:fast', DEV ? '1' : null); track(DEV ? 'fast_on' : 'fast_off'); location.reload(); });
}

// ---------- 개발용 시간 이동 (?dev) ----------
async function devAction(a) {
  if (a === 'h') S.offset += 3600000;
  if (a === 'h3') S.offset += 3 * 3600000;
  if (a === 'd') { const n = now(); const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, ...P().life.wake.split(':').map(Number)); S.offset += next - n + 60000; }
  if (a === 'all') {
    const key = todayKey(); const nm = nowMin();
    for (const t of E.dayPlan(P(), key)) if (toMin(t.time) <= nm && !statusFor(t, key, dayNow())) S.results[t.id] = { status: E.judge(t, toMin(t.time) + 5), at: toMin(t.time) + 5 };
  }
  await save();
  route();
}

// ---------- 시작 ----------
(async function init() {
  try {
    await Promise.all([loadContent(), loadAnim()]);
  } catch {
    view.innerHTML = '<section class="card locked"><h2>내용을 불러오지 못했어요</h2><p>인터넷 연결을 확인하고 다시 열어 주세요.</p></section>';
    return;
  }
  const saved = await db.get('kv', 'state').catch(() => null);
  if (saved?.profile) S = { ...fresh(), ...saved };
  if (P() && !S.inv) { initCare(); save(); }
  db.askPersist();
  initNative({
    // 뒤로 가기: 열린 창 → 미니게임·펫샵 → 다른 화면이면 방으로, 방이면 앱 종료
    onBack: () => {
      const back = $('#sheet-root .sheet-back'); if (back) { back.click(); return true; }
      const x = document.querySelector('.mg .mg-x, .mg [data-x]'); if (x) { x.click(); return true; }
      if (P() && document.body.dataset.route !== 'today' && document.body.dataset.route !== 'onboard') { location.hash = '#/'; return true; }
      return false;
    },
    onResume: () => { if (P() && !document.body.classList.contains('playing')) route(); },
  });
  if (DEV) window.__kiwo = { get S() { return S; }, save, route }; // 빠른 체험(지인 테스트·점검)용 상태 보기
  route();
  // 화면을 켜 둔 채 시간이 지나면(응답 창이 열리고 닫힘) 다시 그린다
  setInterval(() => { if (P() && !$('#sheet-root').classList.contains('on') && !document.body.classList.contains('playing') && document.body.dataset.route !== 'onboard') route(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P() && !document.body.classList.contains('playing')) route(); });
})();
