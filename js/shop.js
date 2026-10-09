// 펫샵·동물병원·간식 주기 화면. 코인(1코인 = 1,000원)으로 사고, 가격은 실제 평균값(content/shop.json·costs.json, 출처 표시)
// 상태는 앱(app.js)이 넘기는 api로만 읽고 쓴다
import { PROTEIN, itemsFor, itemById, hasProtein, addItem, TRIAL_DAYS, BATHS_PER_WEEK } from './care.js?v=202610091653';

export const coinOf = (won) => Math.ceil(won / 1000);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CI = '<i class="ci"></i>';
const TABS = { food: '사료', treat: '간식', hygiene: '위생', toy: '장난감', wear: '옷·액세서리' };

// 코인을 내고 물건을 산다. 모자라면 false
function pay(api, won, label) {
  const S = api.S();
  const c = coinOf(won);
  if (S.coins < c) { api.toast(`코인이 ${c - S.coins}개 모자라요 — 미니게임으로 모아요`); return false; }
  S.coins -= c;
  S.buyLog.push({ day: api.day(), label, coins: c, won });
  return true;
}

// ---------- 펫샵 ----------
let shopRoot = null;
export function openShop(api, tab = 'food') {
  shopRoot?.remove();
  shopRoot = document.createElement('div');
  shopRoot.className = 'mg shop';
  document.body.appendChild(shopRoot);
  document.body.classList.add('playing');
  const close = () => { shopRoot?.remove(); shopRoot = null; document.body.classList.remove('playing'); api.rerender(); };
  const draw = () => {
    const S = api.S(), shop = api.shop(), sp = api.species(), type = api.type();
    const inv = S.inv, skin = S.skin;
    const cur = itemById(shop, inv.cur);
    const list = itemsFor(shop, sp).filter((i) => i.cat === tab && !i.rx);
    const tag = (i) => {
      const t = [];
      if (i.protein) t.push(i.protein.map((p) => PROTEIN[p]).join('·'));
      if (i.days) t.push(`약 ${i.days[type]}일분`);
      if (i.count) t.push(`${i.count}${i.unit || '개'}`);
      return t.join(' · ');
    };
    const warn = (i) => {
      if (skin.found && hasProtein(i, skin.found)) return `<span class="sh-warn">${PROTEIN[skin.found]} 알레르기 — 피하세요</span>`;
      if (skin.trial && !skin.trial.done && (i.cat === 'food' || i.cat === 'treat')) return '<span class="sh-warn">식이 제한 시험 중엔 먹이면 안 돼요</span>';
      return '';
    };
    shopRoot.innerHTML = `<div class="mg-bar"><b class="mg-title">펫샵</b><span class="mg-coin">${CI} <b>${S.coins}</b></span><button class="mg-x" data-x aria-label="닫기">✕</button></div>
      <div class="shop-inv">
        <span><b>지금 사료</b> ${cur ? `${cur.emoji} ${esc(cur.name)} · ${inv.food[inv.cur] || 0}일분` : '없음'}</span>
        <span><b>${sp === 'dog' ? '패드' : '모래'}</b> ${sp === 'dog' ? inv.pads : inv.litter}일분</span>
        <span><b>간식</b> ${Object.values(inv.treats).reduce((s, n) => s + n, 0)}개</span>
      </div>
      <div class="shop-tabs">${Object.entries(TABS).filter(([k]) => k === 'wear' || itemsFor(shop, sp).some((i) => i.cat === k && !i.rx)).map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="shop-list">${tab === 'wear' ? wearList() : list.map((i) => `<div class="shop-item${i.id === inv.cur ? ' cur' : ''}">
          <span class="si-ic">${i.emoji}</span>
          <span class="si-txt"><b>${esc(i.name)}</b><small>${esc(tag(i))}</small>${warn(i)}${i.note ? `<small class="si-note">${esc(i.note)}</small>` : ''}</span>
          <span class="si-buy">${i.cat === 'food' && (inv.food[i.id] || 0) > 0 && i.id !== inv.cur ? `<button class="btn btn-sm" data-use="${i.id}">이걸로 먹이기</button>` : ''}${i.id === inv.cur ? '<small class="si-cur">지금 먹는 중</small>' : ''}
            <button class="btn btn-sm btn-main" data-buy="${i.id}">${CI} ${coinOf(i.price)}</button><small>${api.won(i.price)}</small></span>
        </div>`).join('')}</div>
      <p class="mg-note">가격은 온라인 판매가(참고값, 출처 C)예요. ${tab === 'wear' ? '옷·액세서리는 가만히 있을 때 보이고, 걷거나 먹는 영상에선 잠깐 벗겨져 보여요. ' : ''} ${tab === 'food' ? '아기 때는 성장기용(퍼피·키튼) 사료를 먹여요. 사료를 바꿀 땐 며칠에 걸쳐 섞어 바꾸는 게 좋아요. ' : ''}<button class="src-btn" data-src="${[...new Set((tab === 'wear' ? itemsFor(shop, sp).filter((i) => i.cat === 'wear') : list).flatMap((i) => i.src))].join(',')}">출처</button></p>`;
  };
  // 옷·액세서리: 산 것은 입히기·벗기기(목 하나·머리 하나)
  const wearList = () => {
    const S = api.S(), on = S.wearing;
    return itemsFor(api.shop(), api.species()).filter((i) => i.cat === 'wear').map((i) => {
      const owned = (S.inv.wear ?? []).includes(i.id), wearing = on[i.slot] === i.id;
      return `<div class="shop-item${wearing ? ' cur' : ''}"><img class="si-art" src="art/wear/${i.art}.webp" alt="">
        <span class="si-txt"><b>${esc(i.name)}</b><small>${i.slot === 'head' ? '머리' : '목'}</small>${i.note ? `<small class="si-note">${esc(i.note)}</small>` : ''}</span>
        <span class="si-buy">${owned ? `<button class="btn btn-sm ${wearing ? '' : 'btn-main'}" data-wear="${i.id}">${wearing ? '벗기기' : '입히기'}</button>` : `<button class="btn btn-sm btn-main" data-buy="${i.id}">${CI} ${coinOf(i.price)}</button><small>${api.won(i.price)}</small>`}</span></div>`;
    }).join('');
  };
  shopRoot.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x != null) return close();
    if (b.dataset.src) return api.showSources(b.dataset.src.split(','));
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    const S = api.S(), shop = api.shop();
    if (b.dataset.use) { S.inv.cur = b.dataset.use; api.save(); api.toast('사료를 바꿨어요'); return draw(); }
    if (b.dataset.wear) { const it = itemById(shop, b.dataset.wear); S.wearing[it.slot] = S.wearing[it.slot] === it.id ? null : it.id; api.save(); api.track('wear'); return draw(); }
    if (b.dataset.buy) {
      const it = itemById(shop, b.dataset.buy);
      if (!pay(api, it.price, it.name)) { b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 500); return; }
      addItem(S.inv, it, api.type());
      if (it.cat === 'wear') S.wearing[it.slot] = it.id; // 사면 바로 입혀 본다
      api.save(); api.track('shop_buy');
      api.toast(`${it.name} 샀어요`);
      draw();
    }
  });
  draw();
}

// ---------- 간식 주기 ----------
export function openTreats(api) {
  const S = api.S(), shop = api.shop();
  const owned = Object.entries(S.inv.treats).filter(([, n]) => n > 0).map(([id, n]) => ({ it: itemById(shop, id), n }));
  const trial = S.skin.trial && !S.skin.trial.done;
  const { sheet, close } = api.openSheet(`<h2>간식 주기</h2>
    <p class="sub">간식은 하루 열량의 10% 이하로, 훈련 보상처럼 조금씩. ${trial ? '<b>지금은 식이 제한 시험 중이라 간식을 주면 시험이 깨져요.</b>' : ''}</p>
    ${owned.length ? `<div class="treat-list">${owned.map(({ it, n }) => `<button class="choice" data-give="${it.id}">${it.emoji} ${esc(it.name)} <small>(${n}개 · ${it.protein.map((p) => PROTEIN[p]).join('·')})</small></button>`).join('')}</div>` : '<p class="mood">간식이 없어요. 펫샵에서 사 올 수 있어요.</p>'}
    <div class="chips" style="margin-top:10px"><button class="chip" data-shop>펫샵 가기</button><button class="chip" data-src="rda2016">출처</button></div>
    <button class="btn btn-wide" data-close>닫기</button>`);
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.src) return api.showSources(b.dataset.src.split(','));
    if (b.dataset.shop != null) { close(); return openShop(api, 'treat'); }
    if (!b.dataset.give) return;
    const it = itemById(shop, b.dataset.give);
    S.inv.treats[it.id]--;
    const k = api.key();
    (S.treatLog[k] ||= []).push(it.id);
    const n = S.treatLog[k].length;
    if (n <= 2) S.stats = api.fx(S.stats, { bond: 1 });
    api.save(); api.track('treat');
    close();
    api.room()?.play('treat');
    api.toast(n <= 2 ? `${it.name} — 좋아해요!` : '오늘은 간식을 충분히 줬어요 (마음 점수는 하루 2번까지)');
  });
}

// ---------- 동물병원 ----------
// 진찰(초진·재진 진찰료) → 피부 상태에 따라 검사·처치를 고른다. 일부러 '권하지 않는 검사'도 고를 수 있다(코인만 쓰고 배운다)
export function openVet(api) {
  const S = api.S(), shop = api.shop(), sp = api.species(), costs = api.costs();
  const w = api.weight();
  const skin = S.skin;
  const examined = S.vet.lastExam === api.day();
  const examWon = S.vet.visits ? costs.vet.revisit[w] : costs.vet.first_visit[w];
  const V = shop.vet;
  const F = shop.facts;
  const weeks = Math.floor(api.weeks());
  const status = { ok: '피부 깨끗함', itchy: '자꾸 긁어요', infected: '피부가 빨갛고 진물·냄새 (2차 감염)' }[skin.state];
  const trialDays = skin.trial && !skin.trial.done ? api.day() - skin.trial.start : null;
  const opts = [];
  if (examined) {
    if (skin.state !== 'ok') {
      opts.push({ id: 'cyto', label: V.cytology.label, won: V.cytology.price, src: V.cytology.src });
      opts.push({ id: 'ecto', label: '외부기생충(벼룩·진드기) 예방약', won: costs.vet.ectoparasite_5kg, src: costs.vet.src });
      if (sp === 'dog') opts.push({ id: 'rx_shampoo', label: `약용 샴푸 처방 — 주 ${BATHS_PER_WEEK}회 약욕`, won: itemById(shop, 'medshampoo').price, src: itemById(shop, 'medshampoo').src });
      else opts.push({ id: 'rx_meds', label: '먹는 약 처방 — 2주 동안 하루 1번', won: itemById(shop, 'catmeds').price, src: itemById(shop, 'catmeds').src });
      if (!skin.trial || skin.trial.done) opts.push({ id: 'trial', label: '식이 제한 시험 시작 — 가수분해 처방 사료로 8주', won: itemById(shop, `rxdiet_${sp}`).price, src: itemById(shop, `rxdiet_${sp}`).src });
    }
    if (trialDays != null && trialDays >= 28 && skin.state === 'ok' && !skin.challenge && !skin.found) opts.push({ id: 'challenge', label: '재도전 시험 — 예전 사료를 다시 먹여 원인 확인', won: 0, src: F.challenge.src });
    opts.push({ id: 'ige', label: V.ige.label, won: V.ige.price, src: V.ige.src });
    opts.push({ id: 't4', label: V.t4.label, won: V.t4.price, src: V.t4.src });
  }
  const { sheet, close } = api.openSheet(`<h2>동물병원</h2>
    <div class="vet-status"><span>지금 피부: <b>${status}</b></span>${skin.trial && !skin.trial.done ? `<span>식이 제한 시험 ${trialDays}/${TRIAL_DAYS}일</span>` : ''}${skin.rx && sp === 'dog' ? `<span>약욕 이번 주 ${skin.baths.filter((d) => d > api.day() - 7).length}/${BATHS_PER_WEEK}</span>` : ''}${skin.found ? `<span>확인된 알레르기: ${PROTEIN[skin.found]}</span>` : ''}</div>
    ${examined ? '' : `<button class="btn btn-main btn-wide" data-exam>진찰 받기 ${CI} ${coinOf(examWon)} <small>(${S.vet.visits ? '재진' : '초진'} 진찰료 ${api.won(examWon)})</small></button>`}
    <div id="vet-out">${examined ? findings() : ''}</div>
    ${opts.length ? `<div class="vet-opts">${opts.map((o) => `<button class="choice" data-opt="${o.id}">${esc(o.label)} <span class="vo-price">${o.won ? `${CI} ${coinOf(o.won)}` : '무료'}</span></button>`).join('')}</div>` : ''}
    <p class="disclaimer">수의학적 진단이 아니에요. 실제로 가려움·피부 이상이 보이면 동물병원에서 진료받으세요.</p>
    <button class="btn btn-wide" data-close>닫기</button>`, { onClose: api.rerender });

  function findings() {
    if (skin.state === 'ok' && !skin.trial) return `<div class="reply good"><b>건강해요</b><p>피부·털 상태가 좋아요. 사료나 간식을 바꾼 뒤 자꾸 긁거나 핥으면 다시 와 주세요.</p></div>`;
    if (skin.state === 'ok') return `<div class="reply good"><b>많이 좋아졌어요</b><p>${esc(F.trial.text)}</p></div>`;
    return `<div class="reply"><b>${skin.state === 'infected' ? '긁은 자리에 세균 감염이 생겼어요' : '가려움이 있어요'}</b><p>${esc(F.workup.text)}</p></div>`;
  }
  let anchor = null; // 결과는 누른 버튼 바로 아래에
  const reply = (cls, title, text, src) => { (anchor ?? $out()).insertAdjacentHTML(anchor ? 'afterend' : 'beforeend', `<div class="reply ${cls}"><b>${title}</b><p>${esc(text)}</p>${src ? `<button class="src-btn" data-src="${src.join(',')}">출처</button>` : ''}</div>`); anchor?.nextElementSibling?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const $out = () => sheet.querySelector('#vet-out');
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.src) return api.showSources(b.dataset.src.split(','));
    if (b.dataset.exam != null) {
      if (!pay(api, examWon, `${S.vet.visits ? '재진' : '초진'} 진찰`)) return;
      S.vet.visits++; S.vet.lastExam = api.day();
      api.save(); api.track('vet_exam');
      close(); return openVet(api);
    }
    const id = b.dataset.opt;
    if (!id) return;
    const o = opts.find((x) => x.id === id);
    if (o.won && !pay(api, o.won, o.label)) return;
    b.disabled = true;
    anchor = b;
    if (id === 'cyto') reply('', '세포 검사 결과', skin.state === 'infected' ? F.cyto_pos.text : F.cyto_neg.text, F.cyto_pos.src);
    if (id === 'ecto') reply('', '벼룩·진드기 흔적은 없어요', F.ecto.text, F.ecto.src);
    if (id === 'rx_shampoo') { addItem(S.inv, itemById(shop, 'medshampoo'), api.type()); skin.rx = true; reply('good', '약용 샴푸를 받았어요', F.bath.text, F.bath.src); }
    if (id === 'rx_meds') { addItem(S.inv, itemById(shop, 'catmeds'), api.type()); skin.rx = true; reply('good', '먹는 약을 받았어요', F.catskin.text, F.catskin.src); }
    if (id === 'trial') {
      const it = itemById(shop, `rxdiet_${sp}`);
      skin.trial = { start: api.day(), prev: S.inv.cur, broken: 0 }; // 재도전 시험 때 다시 먹일 예전 사료
      addItem(S.inv, it, api.type()); S.inv.cur = it.id;
      reply('good', '식이 제한 시험 시작', F.trial_start.text, F.trial_start.src);
    }
    if (id === 'challenge') { skin.challenge = { start: api.day() }; skin.trial.done = true; reply('', '재도전 시험', F.challenge.text, F.challenge.src); }
    if (id === 'ige') reply('bad', '권하지 않는 검사예요', F.ige.text, F.ige.src);
    if (id === 't4') reply(sp === 'dog' && weeks < 52 ? 'bad' : '', sp === 'dog' ? '갑상선 수치는 정상이에요' : '갑상선 수치는 정상이에요', sp === 'dog' ? F.t4_dog.text : F.t4_cat.text, sp === 'dog' ? F.t4_dog.src : F.t4_cat.src);
    api.save(); api.track('vet_opt');
  });
}
