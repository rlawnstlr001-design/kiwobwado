// 미니게임 공통 스타일. 모든 선택자가 .kpg-root 아래라 앱 스타일과 섞이지 않는다.
// 색은 CSS 변수라서 앱 테마에 맞게 .kpg-root { --kpg-accent: ... } 로 덮어쓰면 된다.

const CSS = `
.kpg-root{--kpg-bg:#fff8ef;--kpg-surface:#ffffff;--kpg-text:#2b2118;--kpg-sub:#7a6a5c;--kpg-accent:#ff8a3d;--kpg-accent-text:#ffffff;--kpg-good:#2fa36b;--kpg-bad:#e5484d;--kpg-o:#2f7ef5;--kpg-x:#e5484d;--kpg-line:#efe3d3;
  position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;
  background:var(--kpg-bg);color:var(--kpg-text);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;box-sizing:border-box}
.kpg-root *,.kpg-root *::before,.kpg-root *::after{box-sizing:inherit}
:where(.kpg-root) button{font-family:inherit;font-size:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.kpg-top{display:flex;align-items:center;gap:8px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));flex:none}
.kpg-close{width:40px;height:40px;border-radius:12px;background:var(--kpg-surface);font-size:18px;box-shadow:0 1px 0 var(--kpg-line);flex:none}
.kpg-title{font-weight:800;font-size:17px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpg-hud{display:flex;gap:6px;flex:none}
.kpg-chip{display:flex;flex-direction:column;align-items:center;min-width:52px;padding:4px 8px;border-radius:12px;background:var(--kpg-surface);box-shadow:0 1px 0 var(--kpg-line);line-height:1.15}
.kpg-chip b{font-size:17px;font-variant-numeric:tabular-nums}
.kpg-chip small{font-size:11px;color:var(--kpg-sub)}
.kpg-stage{position:relative;flex:1;min-height:0;overflow:hidden;container-type:size}
.kpg-canvas{position:absolute;inset:0;display:block;touch-action:none}
.kpg-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(43,33,24,.45)}
.kpg-overlay[hidden]{display:none}
.kpg-card{width:100%;max-width:360px;max-height:100%;overflow:auto;background:var(--kpg-surface);border-radius:20px;padding:22px 18px 18px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.kpg-hero{font-size:56px;line-height:1;margin-bottom:8px}
.kpg-hero img{width:72px;height:72px;object-fit:contain}
.kpg-h{font-size:22px;font-weight:800;margin:0 0 8px}
.kpg-p{font-size:15px;line-height:1.55;color:var(--kpg-sub);margin:0 0 14px;white-space:pre-line}
.kpg-big{font-size:48px;font-weight:900;line-height:1.05;font-variant-numeric:tabular-nums}
.kpg-best{font-size:14px;color:var(--kpg-sub);margin:4px 0 14px}
.kpg-badge{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:var(--kpg-accent);color:var(--kpg-accent-text);font-size:12px;font-weight:800;vertical-align:middle}
.kpg-reward{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.kpg-reward span{padding:8px 12px;border-radius:12px;background:var(--kpg-bg);font-weight:800;font-size:17px}
.kpg-note{font-size:13px;color:var(--kpg-sub);margin:0 0 12px;line-height:1.5}
.kpg-btns{display:flex;flex-direction:column;gap:8px}
.kpg-btn{min-height:50px;border-radius:14px;font-size:17px;font-weight:800;background:var(--kpg-line)}
.kpg-btn.kpg-primary{background:var(--kpg-accent);color:var(--kpg-accent-text)}
.kpg-btn.kpg-ad{background:#2b2118;color:#fff}
.kpg-btn:disabled{opacity:.5;cursor:default}
.kpg-btn:active:not(:disabled){transform:scale(.98)}
.kpg-float{position:absolute;pointer-events:none;font-weight:900;font-size:22px;transform:translate(-50%,-50%);animation:kpg-float .8s ease-out forwards;text-shadow:0 2px 0 #fff}
@keyframes kpg-float{to{opacity:0;transform:translate(-50%,-150%)}}

/* 짝 맞추기 */
.kpg-grid{position:absolute;inset:0;margin:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;max-width:min(100%,480px);align-content:center}
@supports (width:1cqh){.kpg-grid{max-width:min(100%,480px,72cqh)}}
.kpg-tile{position:relative;aspect-ratio:3/4;perspective:600px}
.kpg-tile-in{position:absolute;inset:0;transition:transform .28s ease;transform-style:preserve-3d}
.kpg-tile.is-up .kpg-tile-in,.kpg-tile.is-matched .kpg-tile-in{transform:rotateY(180deg)}
.kpg-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:12px;backface-visibility:hidden;-webkit-backface-visibility:hidden;font-size:clamp(26px,9vw,42px)}
.kpg-fcard{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;text-align:center;line-height:1.15}
.kpg-ficon{font-size:clamp(22px,6.5vw,34px)}
.kpg-ftext{font-size:clamp(10px,2.6vw,13px);font-weight:700;color:var(--kpg-text);word-break:keep-all}
.kpg-back{background:var(--kpg-accent);box-shadow:inset 0 -4px 0 rgba(0,0,0,.12)}
.kpg-back::after{content:"?";color:#fff;font-weight:900;font-size:.7em;opacity:.85}
.kpg-front{background:var(--kpg-surface);transform:rotateY(180deg);box-shadow:0 1px 0 var(--kpg-line)}
.kpg-front .kpg-sprite{width:70%;height:70%;object-fit:contain;display:flex;align-items:center;justify-content:center}
.kpg-tile.is-matched .kpg-front{background:#e9f8ef;box-shadow:inset 0 0 0 3px var(--kpg-good)}
.kpg-tile.is-wrong .kpg-front{box-shadow:inset 0 0 0 3px var(--kpg-bad)}

/* OX 퀴즈 */
.kpg-quiz{position:absolute;inset:0;display:flex;flex-direction:column;padding:12px 16px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom));gap:12px;max-width:520px;margin:0 auto}
.kpg-qnum{font-size:14px;color:var(--kpg-sub);font-weight:700}
.kpg-bar{height:8px;border-radius:99px;background:var(--kpg-line);overflow:hidden}
.kpg-bar i{display:block;height:100%;background:var(--kpg-accent);transition:width .1s linear}
.kpg-q{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:clamp(20px,6vw,26px);font-weight:800;line-height:1.45;background:var(--kpg-surface);border-radius:20px;padding:20px;word-break:keep-all}
.kpg-ox{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.kpg-oxbtn{height:min(28vw,120px);border-radius:20px;font-size:min(16vw,64px);font-weight:900;color:#fff}
.kpg-oxbtn.o{background:var(--kpg-o)}
.kpg-oxbtn.x{background:var(--kpg-x)}
.kpg-oxbtn:disabled{opacity:.35}
.kpg-oxbtn.is-picked{opacity:1;outline:4px solid var(--kpg-text);outline-offset:2px}
.kpg-reveal{background:var(--kpg-surface);border-radius:16px;padding:14px;text-align:center}
.kpg-reveal b{display:block;font-size:20px;margin-bottom:4px}
.kpg-reveal b.good{color:var(--kpg-good)}
.kpg-reveal b.bad{color:var(--kpg-bad)}
.kpg-reveal p{margin:0 0 10px;font-size:15px;line-height:1.5;color:var(--kpg-sub);word-break:keep-all}
@media (prefers-reduced-motion:reduce){.kpg-tile-in{transition:none}.kpg-float{animation-duration:.01s}}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('kpg-styles')) return;
  const style = doc.createElement('style');
  style.id = 'kpg-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
