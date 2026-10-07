// 콘텐츠(content/*.json) 불러오기 — 웹·앱 공통. 실패하면 화면에 안내
const FILES = ['sources', 'costs', 'foods', 'lessons', 'events'];
export const C = {};
export async function loadContent() {
  const res = await Promise.all(FILES.map((f) => fetch(`content/${f}.json?v=202610080555`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
  FILES.forEach((f, i) => { C[f] = res[i]; });
  return C;
}
export const eventById = (id) => C.events.items.find((e) => e.id === id);
export const lessonById = (id) => C.lessons.items.find((l) => l.id === id);
export const foodById = (id) => C.foods.items.find((f) => f.id === id);
