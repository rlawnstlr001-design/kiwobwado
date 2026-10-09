// 앱(Capacitor) 안에서만 쓰는 기능. 웹에서는 isApp=false라 건너뛴다.
// 돌봄 알림: 오늘·내일 남은 돌봄 요청 시각마다 로컬 알림 — "앱을 안 켜 놔도 밥 시간이 온다"가 이 체험의 핵심
const C = window.Capacitor;
export const isApp = !!C?.isNativePlatform?.();
export const platform = isApp ? C.getPlatform() : 'web';

const plug = (name) => (isApp ? C.registerPlugin(name) : null);
const App = plug('App');
const Haptics = plug('Haptics');
const StatusBar = plug('StatusBar');
const Notify = plug('LocalNotifications');

const CARE_BASE = 7000; // 돌봄 알림 id 7000~7099
let lastKey = '';

export function haptic(kind = 'light') {
  if (!isApp) { try { navigator.vibrate?.(kind === 'light' ? 12 : [20, 40, 30]); } catch { /* 미지원 */ } return; }
  Haptics.vibrate({ duration: kind === 'light' ? 14 : 40 }).catch(() => {});
}

async function permission(ask) {
  let p = await Notify.checkPermissions();
  if (p.display !== 'granted' && ask) p = await Notify.requestPermissions();
  return p.display === 'granted';
}

// items: [{ at: Date, title, body }] — 바뀐 게 없으면 다시 예약하지 않는다
export async function scheduleCare(items, ask = false) {
  if (!isApp) return false;
  const key = items.map((i) => `${+i.at}|${i.title}`).join(',');
  if (key === lastKey && !ask) return true;
  try {
    const pending = await Notify.getPending().catch(() => ({ notifications: [] }));
    const old = pending.notifications.filter((n) => n.id >= CARE_BASE && n.id < CARE_BASE + 100).map((n) => ({ id: n.id }));
    if (old.length) await Notify.cancel({ notifications: old });
    if (!items.length || !(await permission(ask))) return false;
    if (platform === 'android') await Notify.createChannel({ id: 'care', name: '돌봄 요청', description: '밥·배변·산책·놀이 시간 (내 하루에 맞춘 요청)', importance: 4, vibration: true }).catch(() => {});
    await Notify.schedule({ notifications: items.slice(0, 60).map((i, n) => ({ id: CARE_BASE + n, title: i.title, body: i.body, channelId: 'care', schedule: { at: i.at, allowWhileIdle: true }, extra: { hash: '#/' } })) });
    lastKey = key;
    return true;
  } catch { return false; }
}

export function initNative({ onBack, onResume }) {
  if (!isApp) return;
  document.documentElement.classList.add('is-app', `is-${platform}`);
  StatusBar.hide().catch(() => {}); // 가로 게임 화면 — 상단 막대 없이 꽉 차게
  App.addListener('backButton', () => { if (!onBack()) App.exitApp(); });
  App.addListener('resume', () => { StatusBar.hide().catch(() => {}); onResume?.(); });
  Notify.addListener('localNotificationActionPerformed', () => onResume?.());
}

// 안드로이드 12+: '알람 및 리마인더'를 허용해야 알림이 정확한 시각에 온다(안 하면 몇 분 늦을 수 있다)
export async function exactAlarm(open = false) {
  if (!isApp || platform !== 'android') return null;
  try {
    if (open) await Notify.changeExactNotificationSetting();
    const r = await Notify.checkExactNotificationSetting();
    return r.exact_alarm === 'granted';
  } catch { return null; }
}
