// 결과 공유 카드 — 리포트를 1080×1350 그림 한 장으로(인스타 세로 비율)
// 넣는 것: 아이 사진·이름·성향, 코스·함께한 날, 결론 도장, 5축 점수. 넣지 않는 것: 예산·생활 시간·집(개인 정보)
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

export async function makeCard({ name, typeLabel, title, verdict, good, axes, photo, url }) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const v = (k, d) => css.getPropertyValue(k).trim() || d;
  const C = { paper: v('--paper', '#F6F0E4'), ink: v('--ink', '#2D2A26'), ink2: v('--ink-2', '#6B645B'), card: v('--card', '#FFFDF8'), apricot: v('--apricot', '#F2B48A'), forest: v('--forest', '#3F6B4E'), warn: v('--warn', '#C8643C'), line: '#E7DFD0' };
  const font = (w, px) => `${w} ${px}px ${css.getPropertyValue('--sans') || 'sans-serif'}`;
  try { await document.fonts?.ready; } catch { /* 글꼴 대기 불가 */ }

  // 바탕: 종이색 + 아래쪽 옅은 줄무늬(서류철 느낌)
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,.035)'; g.lineWidth = 2;
  for (let y = 1000; y < H; y += 44) { g.beginPath(); g.moveTo(60, y); g.lineTo(W - 60, y); g.stroke(); }

  g.fillStyle = C.ink2; g.font = font(700, 30); g.textAlign = 'center';
  g.fillText('키워봐도될까 · 입양 전 반려 생활 체험', W / 2, 82);

  // 사진(폴라로이드)
  const img = await loadImg(photo);
  g.save();
  g.translate(W / 2 - 40, 450); g.rotate(-0.04);
  g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
  g.fillStyle = '#fff'; g.fillRect(-270, -310, 540, 640);
  g.shadowColor = 'transparent';
  g.fillStyle = '#EFE7DA'; g.fillRect(-240, -280, 480, 480);
  if (img) { const s = Math.min(480 / img.width, 480 / img.height); g.drawImage(img, -img.width * s / 2, -280 + (480 - img.height * s) / 2, img.width * s, img.height * s); }
  g.fillStyle = C.ink; g.font = font(800, 44); g.textAlign = 'center';
  g.fillText(name, 0, 262);
  g.fillStyle = C.ink2; g.font = font(600, 28);
  g.fillText(typeLabel, 0, 304);
  g.restore();

  // 결론 도장
  const col = good ? C.forest : C.warn;
  g.save();
  g.translate(790, 610); g.rotate(0.12);   // 사진 오른쪽 아래 모서리(이름·성향 글씨를 가리지 않게)
  g.font = font(900, 50);
  const tw = g.measureText(verdict).width + 64;
  g.strokeStyle = col; g.lineWidth = 7; g.globalAlpha = .92;
  roundRect(g, -tw / 2, -46, tw, 92, 18); g.stroke();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(verdict, 0, 3);
  g.restore();

  // 제목
  g.fillStyle = C.ink; g.font = font(900, 54); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(title, W / 2, 900);

  // 5축
  const names = { time: '시간', money: '돈', env: '환경', knowledge: '지식', consistency: '꾸준함' };
  let y = 975;
  for (const [k, val] of Object.entries(axes)) {
    g.fillStyle = C.ink; g.font = font(800, 34); g.textAlign = 'left';
    g.fillText(names[k], 150, y + 12);
    g.fillStyle = C.line; roundRect(g, 310, y - 14, 520, 30, 15); g.fill();
    g.fillStyle = val >= 70 ? C.forest : val >= 50 ? C.apricot : C.warn;
    roundRect(g, 310, y - 14, Math.max(30, 520 * val / 100), 30, 15); g.fill();
    g.fillStyle = C.ink; g.font = font(800, 34); g.textAlign = 'right';
    g.fillText(String(val), 930, y + 12);
    y += 58;
  }

  g.fillStyle = C.ink2; g.font = font(600, 26); g.textAlign = 'center';
  g.fillText('입양을 권하거나 말리는 앱이 아니라, 판단을 돕는 체험이에요', W / 2, 1268);
  g.fillStyle = C.ink; g.font = font(800, 28);
  g.fillText(url, W / 2, 1312);

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
