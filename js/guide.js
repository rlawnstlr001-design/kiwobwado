// 첫날 길잡이 — 방 화면의 물건·버튼을 하나씩 밝혀 짚어 준다(처음 한 번, 메뉴에서 다시 보기)
// steps: [{ sel, title, text }] — sel이 없으면 가운데 안내, sel이 화면에 없으면(고양이엔 현관이 없음 등) 건너뛴다
// 길잡이 중엔 body.guiding — 앱의 1분마다 다시 그리기가 이걸 보고 쉰다
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shown = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
};

export function runGuide(steps, { onDone } = {}) {
  const list = steps.filter((s) => !s.sel || shown(s.sel));
  if (!list.length) return;
  document.querySelector('.guide')?.remove();
  const root = document.createElement('div');
  root.className = 'guide';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="guide-dim"></div><div class="guide-hole"></div><div class="guide-tip" aria-live="polite"></div>';
  document.body.appendChild(root);
  document.body.classList.add('guiding');
  const hole = root.querySelector('.guide-hole'), tip = root.querySelector('.guide-tip'), dim = root.querySelector('.guide-dim');
  // 어두운 막에 대상 자리만 구멍(evenodd) — 큰 그림자(box-shadow) 방식은 일부 화면 캡처·기기에서 안 그려졌다
  const cut = (x, y, w, h) => { dim.style.clipPath = w ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)` : 'none'; };
  let i = 0, timer = 0;

  // 밝힐 자리와 말풍선 자리: 대상 아래가 넓으면 아래, 아니면 위, 둘 다 좁으면 옆. 화면 밖으로 안 나가게
  const place = () => {
    const s = list[i];
    const el = s.sel && shown(s.sel);
    const vw = innerWidth, vh = innerHeight, pad = 8, gap = 10, m = 12;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (!el) {
      Object.assign(hole.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
      cut(0, 0, 0, 0);
      Object.assign(tip.style, { left: `${(vw - tw) / 2}px`, top: `${(vh - th) / 2}px` });
      return;
    }
    const r = el.getBoundingClientRect();
    const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
    Object.assign(hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    cut(x, y, w, h);
    let tx, ty;
    if (vh - (y + h) >= th + gap + m) { ty = y + h + gap; tx = x + w / 2 - tw / 2; }
    else if (y >= th + gap + m) { ty = y - gap - th; tx = x + w / 2 - tw / 2; }
    else { ty = y + h / 2 - th / 2; tx = vw - (x + w) >= tw + gap + m ? x + w + gap : x - gap - tw; }
    tip.style.left = `${Math.max(m, Math.min(vw - tw - m, tx))}px`;
    tip.style.top = `${Math.max(m, Math.min(vh - th - m, ty))}px`;
  };
  const draw = () => {
    const s = list[i], last = i === list.length - 1;
    tip.innerHTML = `<span class="guide-n">${i + 1} / ${list.length}</span><b>${esc(s.title)}</b><p>${esc(s.text)}</p>
      <div class="guide-btns">${last ? '' : '<button class="btn btn-sm" data-g="skip">건너뛰기</button>'}<button class="btn btn-sm btn-main" data-g="next">${last ? '시작하기' : '다음'}</button></div>`;
    place();
    tip.querySelector('[data-g="next"]').focus({ preventScroll: true });
  };
  const end = () => {
    clearInterval(timer);
    removeEventListener('resize', place);
    removeEventListener('keydown', key);
    root.remove();
    document.body.classList.remove('guiding');
    onDone?.();
  };
  root.end = end;   // 안드로이드 뒤로 가기 = 길잡이 닫기
  const next = () => { if (i < list.length - 1) { i++; draw(); } else end(); };
  const key = (e) => { if (e.key === 'Escape') end(); else if (e.key === 'ArrowRight') next(); };
  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (g === 'skip') end();
    else if (g === 'next') next();
  });
  addEventListener('resize', place);
  addEventListener('keydown', key);
  timer = setInterval(place, 250);   // 아이가 돌아다녀도 따라간다
  draw();
}
