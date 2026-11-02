// DOM·캔버스·루프 공통 도구 (브라우저 전용)

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

export function button(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** requestAnimationFrame 루프. 앱이 백그라운드로 가면 멈추고, 돌아오면 큰 dt 없이 이어간다. */
export function createLoop(tick) {
  let raf = 0;
  let last = 0;
  let wanted = false;
  const frame = (ts) => {
    if (!wanted) return;
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    tick(dt);
    if (wanted) raf = requestAnimationFrame(frame);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const onVis = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (wanted) run();
  };
  document.addEventListener('visibilitychange', onVis);
  const stop = () => {
    wanted = false;
    cancelAnimationFrame(raf);
  };
  return {
    start() {
      wanted = true;
      run();
    },
    stop,
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

/** 부모 크기에 맞춰지는 고해상도 캔버스. width/height는 CSS 픽셀. */
export function createCanvas(parent) {
  const canvas = el('canvas', 'kpg-canvas');
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, width: 1, height: 1 };
  const fit = () => {
    const r = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, r.width);
    view.height = Math.max(1, r.height);
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(parent);
  view.destroy = () => {
    ro?.disconnect();
    canvas.remove();
  };
  return view;
}

/**
 * 스프라이트: 이모지 문자열 또는 이미지 주소. 이미지가 아직 안 불러와졌으면 대체 이모지를 그린다.
 * 앱의 캐릭터·아이템 그림으로 바꾸려면 skins 옵션에 이미지 주소를 넣으면 된다.
 */
export function makeSprite(src, fallback = '❓') {
  const isImage = typeof src === 'string' && /^(https?:|data:|blob:|\.{0,2}\/)|\.(png|webp|jpe?g|gif|svg)$/i.test(src);
  if (!isImage) return { text: src || fallback };
  const img = new Image();
  img.src = src;
  return { img, text: fallback };
}

export function drawSprite(ctx, sprite, cx, cy, size) {
  if (sprite.img && sprite.img.complete && sprite.img.naturalWidth > 0) {
    ctx.drawImage(sprite.img, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.fillStyle = '#000'; // 이모지도 fillStyle 투명도를 따르므로 불투명하게
  ctx.font = `${Math.round(size * 0.9)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sprite.text, cx, cy);
  ctx.restore();
}

export function spriteNode(sprite, className = 'kpg-sprite') {
  if (sprite.img) {
    const img = el('img', className);
    img.src = sprite.img.src;
    img.alt = '';
    img.draggable = false;
    return img;
  }
  return el('span', className, sprite.text);
}

export function vibrate(enabled, pattern) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 지원 안 하는 기기 */
  }
}
