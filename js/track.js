// 익명 이용 지표 — 이름(시작·하루 열기·돌봄 완료·사건 응답·리포트)만 보낸다. 펫 이름·생활 시간·예산·선택 내용은 절대 보내지 않는다.
// 같은 기기·같은 날·같은 이름은 서버에서 하나로 합쳐진다. 설정이 비어 있으면 아무것도 보내지 않는다.
const CFG = window.KIWO_CONFIG;
const KEY = 'kiwo:device';

function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return 'nostorage-' + Date.now(); }
}

const sent = new Set();
// 로컬 미리보기(개발 중)는 지표에 섞이지 않게 보내지 않는다
// 앱(Capacitor) 안도 주소가 localhost라서 앱이 아닐 때만 막는다
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && !window.Capacitor?.isNativePlatform?.();

export function track(name) {
  if (!CFG.supabaseUrl || !CFG.supabaseKey || LOCAL) return;
  const k = `${name}:${new Date().toDateString()}`;
  if (sent.has(k)) return; // 같은 실행 중 중복 전송 방지
  sent.add(k);
  fetch(`${CFG.supabaseUrl}/rest/v1/rpc/ky_event`, {
    method: 'POST',
    headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_device: deviceId(), p_name: name }),
    keepalive: true,
  }).catch(() => {});
}
