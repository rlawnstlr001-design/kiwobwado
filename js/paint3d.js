// 3D를 그림처럼(11/16 사용자 "3d모델링 모습의 이질적인 느낌이 불편 · 놀아주기에서 오는 이질감이 가장 커" → A안)
// 방·평소 모습은 수채 그림인데 3D 아이는 실사 빛(광택·부드러운 명암)이라 플라스틱 인형처럼 보였다. 겉모습만 그림 쪽으로 바꾼다(움직임은 그대로):
//  ① 명암을 몇 단으로 끊는 툰 셰이딩(MeshToonMaterial + 3단 그라데이션) — 수채 그림의 '밝은 면·그늘 면' 두세 덩어리
//  ② 2D 그림과 같은 갈색 테두리 선 — 뒤집은 껍데기(살을 법선 방향으로 조금 부풀려 뒷면만 칠함). 뼈·셰이프키(눈 깜빡임)를 같이 따라간다
//  ③ 수채 느낌: 윤곽 쪽이 살짝 짙은 물감 고임, 아주 옅은 종이 결, 따뜻한 크림 기운
// 쓰기: paintModel(model, { line: 두께(m) }) — loadPet3d 뒤에, 장난감 GLB에도. paintLights(scene)는 장면 빛을 그림용으로.
import * as THREE from 'three';

const INK = new THREE.Color('#5B4535');          // 2D 그림 윤곽선 색(갈색 잉크)
let _grad = null;
function gradient() {                              // 3단: 그늘 · 중간 · 밝은 면
  if (_grad) return _grad;
  const d = new Uint8Array([190, 228, 255]);
  _grad = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}

// 그림 색 쪽으로: 윤곽 쪽 물감 고임 · 종이 결 · 따뜻한 크림 기운(채도를 빼면 회색으로 탁해졌다 — 11/16 1차)
function warm(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { vec3 c = gl_FragColor.rgb;
        // 수채 가장자리: 윤곽 쪽으로 갈수록 물감이 고여 살짝 짙다
        float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        c *= 1.0 - 0.18 * fr * fr;
        // 종이 결: 화면 좌표 잡음으로 아주 옅게
        float g = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        c *= 0.97 + 0.05 * g;
        // 따뜻한 크림 쪽으로 조금
        c = mix(c, c * vec3(1.04, 1.0, 0.92), 0.6);
        gl_FragColor.rgb = c; }`);
  };
  mat.customProgramCacheKey = () => 'paint-warm';
}

/** 재질 하나를 그림체로(줄·장난감 등 직접 만든 재질용) */
export function paintMat(src) { return toon(src); }

function toon(src) {
  const m = new THREE.MeshToonMaterial({
    map: src.map ?? null, color: src.map ? 0xffffff : (src.color ?? new THREE.Color(0xffffff)),
    gradientMap: gradient(), transparent: src.transparent, opacity: src.opacity ?? 1, side: src.side,
  });
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  warm(m);
  return m;
}

function outlineMat(width) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: true, opacity: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLine = { value: width };
    sh.vertexShader = 'uniform float uLine;\n' + sh.vertexShader.replace('#include <project_vertex>',
      // 뼈·셰이프키가 적용된 뒤(objectNormal·transformed) 법선 방향으로 부풀린다
      // (MeshBasic은 뼈가 없으면 objectNormal을 만들지 않는다 — 장난감은 normal 그대로)
      '#if defined( USE_ENVMAP ) || defined( USE_SKINNING )\ntransformed += normalize(objectNormal) * uLine;\n#else\ntransformed += normalize(normal) * uLine;\n#endif\n#include <project_vertex>');
  };
  m.customProgramCacheKey = () => `paint-line-${width}`;
  return m;
}

/** model 안의 살을 그림체로. mats 배열을 주면(loadPet3d의 d.mats) 새 재질로 바꿔 넣는다(투명도 조절이 계속 먹게) */
export function paintModel(model, { line = 0.006, mats = null } = {}) {
  model.updateMatrixWorld(true);   // 선 두께를 화면 크기에 맞추려 지금 배율을 읽는다
  const meshes = [];
  model.traverse((o) => { if (o.isMesh && !o.userData.paintLine) meshes.push(o); });
  for (const o of meshes) {
    const olds = Array.isArray(o.material) ? o.material : [o.material];
    const news = olds.map(toon);
    o.material = Array.isArray(o.material) ? news : news[0];
    if (mats) olds.forEach((m, i) => { const k = mats.indexOf(m); if (k >= 0) mats[k] = news[i]; });
    if (line <= 0) continue;
    // 테두리 껍데기: 같은 살·같은 뼈대. 모델이 줄어든 크기(scale)만큼 선 두께를 키워 화면에서 일정하게
    const s = new THREE.Vector3(); o.getWorldScale(s);
    const w = line / Math.max(1e-4, s.x);
    const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, outlineMat(w)) : new THREE.Mesh(o.geometry, outlineMat(w));
    if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
    if (o.morphTargetInfluences) { ol.morphTargetInfluences = o.morphTargetInfluences; ol.morphTargetDictionary = o.morphTargetDictionary; }   // 눈 깜빡임을 같이
    ol.userData.paintLine = true; ol.frustumCulled = false; ol.castShadow = false; ol.renderOrder = -1;
    ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    o.parent.add(ol);
  }
}

/** 그림용 빛: 실사 톤매핑을 끄고(그림 색 그대로), 해는 한 방향에서 또렷하게(툰 단계가 분명하게), 바닥 그림자는 옅게 */
export function paintLights(renderer, { sun, hemi, floor } = {}) {
  renderer.toneMapping = THREE.NoToneMapping;
  if (hemi) { hemi.intensity = 2.0; hemi.color.set('#FFF8EC'); hemi.groundColor.set('#C9A77E'); }
  if (sun) sun.intensity = 1.7;
  if (floor) floor.material.opacity = 0.18;
}

/** 장면 안의 빛 받는 재질(Standard·Lambert·Phong)을 그림체로 — 경기장(경주·장애물)용. 테두리 선은 안 그린다(넓은 바닥·판에 선을 두르면 지저분했다) */
export function paintScene(root) {
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.paintLine) return;
    const conv = (m) => {
      if (!m || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
      if (!done.has(m)) { const t = toon(m); if (m.emissive && m.emissiveIntensity) { t.emissive = m.emissive.clone(); t.emissiveIntensity = m.emissiveIntensity; } done.set(m, t); }
      return done.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

// 시험·전후 비교: 주소에 ?paint=0 이면 끈다(lab/play3d)
export const PAINT_ON = !/[?&]paint=0\b/.test(globalThis.location?.search ?? '');
