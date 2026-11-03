// 지갑(원) — 11/3 사용자 "미니게임을 돈으로 바꾸자 · 한 판 = 1시간 일한 느낌 · 모든 건 미니게임으로 번 돈으로 사야"
// 미니게임 한 판 = 1시간 근무. 시급은 2027년 최저임금 10,700원(고용노동부 고시, 사용자 지정 "내년 기준") + 점수 성과급 최대 50%.
// 하루 근무 시간 제한 없음(사용자). 0원에서 시작(입양비·첫 1주 살림은 모아 둔 돈으로 냈다고 친다).
// 돈이 모자라면 못 산다 — 병원비만 외상(지갑이 마이너스 = 빚, 다음에 번 돈으로 먼저 갚아진다)
// 순수 로직(상태 S를 받아 바꾼다) — 다른 모듈을 가져오지 않는다

export const WAGE = 10700;
export const WAGE_SRC = ['moel_wage2027'];
export const BONUS_MAX = 0.5;
const r10 = (n) => Math.round(n / 10) * 10;

// 옛 코인(1코인 = 1,000원) → 원. 처음 한 번만
export function migrate(S) {
  if (S.cash == null) S.cash = (S.coins || 0) * 1000;
  S.work ??= {};      // { 'YYYY-MM-DD': 일한 시간 }
  S.workLog ??= [];   // { day, game, score, base, bonus, pay, repaid }
  S.spendLog ??= [];  // { day, label, won, debt }
}

// 한 판(1시간) 급여: perf 0~1(게임 점수를 그 게임의 최고 보상 기준으로 나눈 값)
export function payFor(perf) {
  const p = Math.max(0, Math.min(1, perf || 0));
  const bonus = r10(WAGE * BONUS_MAX * p);
  return { base: WAGE, bonus, pay: WAGE + bonus };
}

// 일한 한 시간을 지갑에 넣는다. 빚이 있으면 먼저 갚아진다(repaid)
export function work(S, { day, key, game, score, perf }) {
  const p = payFor(perf);
  const repaid = S.cash < 0 ? Math.min(-S.cash, p.pay) : 0;
  S.cash += p.pay;
  S.work[key] = (S.work[key] || 0) + 1;
  S.workLog.push({ day, game, score, ...p, repaid });
  if (S.workLog.length > 200) S.workLog.splice(0, S.workLog.length - 200);
  return { ...p, repaid, hours: S.work[key], cash: S.cash };
}

export const canPay = (S, won, { debt = false } = {}) => debt || S.cash >= won;

// 낸다. debt(병원비)면 모자라도 내고 지갑이 마이너스가 된다. 못 내면 false
export function spend(S, won, label, { day, debt = false } = {}) {
  if (!won) return true;
  if (!canPay(S, won, { debt })) return false;
  const short = Math.max(0, won - Math.max(0, S.cash));
  S.cash -= won;
  S.spendLog.push({ day, label, won, debt: debt ? short : 0 });
  if (S.spendLog.length > 300) S.spendLog.splice(0, S.spendLog.length - 300);
  return true;
}
// 되돌리기(펫시터 취소 등)
export function refund(S, won, label, { day } = {}) {
  S.cash += won;
  S.spendLog.push({ day, label: `${label} 취소`, won: -won, debt: 0 });
}

// 이 값이 몇 시간 일한 돈인지(시급 기준, 0.5시간 단위로 올림)
export const hoursOf = (won) => Math.max(0.5, Math.ceil((won / WAGE) * 2) / 2);
