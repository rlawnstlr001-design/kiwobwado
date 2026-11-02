// 저장소 어댑터. 앱에 이미 저장 계층(AsyncStorage, Preferences, 서버 등)이 있으면
// { get(key): string|null, set(key, value: string): void } 모양으로 감싸서 넘기면 된다.

export function createMemoryStorage() {
  const mem = new Map();
  return {
    get: (k) => (mem.has(k) ? mem.get(k) : null),
    set: (k, v) => void mem.set(k, String(v)),
  };
}

export function createLocalStorage(prefix = 'minigame:') {
  const mem = createMemoryStorage();
  const ls = () => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null; // 사생활 보호 모드 등에서 접근 자체가 예외를 던짐
    }
  };
  return {
    get(k) {
      try {
        const v = ls()?.getItem(prefix + k);
        if (v != null) return v;
      } catch {
        /* 메모리 값으로 대체 */
      }
      return mem.get(k);
    },
    set(k, v) {
      mem.set(k, v);
      try {
        ls()?.setItem(prefix + k, String(v));
      } catch {
        /* 저장 실패해도 게임은 계속 */
      }
    },
  };
}
