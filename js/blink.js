// 눈 깜빡임(11/2 — 볼트 [[동물-몸짓언어]]): tools/rig_pet.py가 넣은 셰이프키 'Blink'(1 = 감음)를 무작위 박자로 재생한다.
// 개 자발 깜빡임 ≈ 분당 6.5회(26마리 평균 — PMC8962689) → 평균 9초, 4~14초 사이 무작위.
// 빨리 감고(0.1초) 잠깐 머문 뒤(0.03초) 천천히 뜬다(0.15초) — 고양이 눈꺼풀 실측(Gruart 1995)이 '내릴 때 빠르고 올릴 때 느리다'. 개 실측은 없다.
const CLOSE = 0.1, HOLD = 0.03, OPEN = 0.15;

export function makeBlinker(root, { rate = 6.5 } = {}) {
  const ms = [];
  root.traverse((o) => {
    const i = o.isMesh ? o.morphTargetDictionary?.Blink : undefined;
    if (i !== undefined) ms.push([o, i]);
  });
  const mean = 60 / rate, gap = () => mean * (0.45 + Math.random() * 1.1);
  let wait = 1 + Math.random() * mean, t = -1, base = 0;
  const curve = (x) => (x < CLOSE ? x / CLOSE : x < CLOSE + HOLD ? 1 : 1 - (x - CLOSE - HOLD) / OPEN);
  return {
    has: ms.length > 0,
    get base() { return base; },
    set base(v) { base = v; },   // 0.5 = 반쯤 감은 눈(졸림·부드러운 눈)
    blink() { t = 0; },
    update(dt) {
      if (!ms.length) return;
      if (t < 0 && (wait -= dt) <= 0) { t = 0; wait = gap(); }
      let w = 0;
      if (t >= 0) {
        t += dt;
        if (t >= CLOSE + HOLD + OPEN) t = -1;
        else w = curve(t);
      }
      for (const [o, i] of ms) o.morphTargetInfluences[i] = Math.max(base, w);
    },
  };
}

