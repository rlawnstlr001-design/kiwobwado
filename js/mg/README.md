# 미니게임 4종 (육성 앱용)

| id | 이름 | 한 판 | 조작 | 보상(기본값) | 하루 보상 횟수 |
|---|---|---|---|---|---|
| `catch` | 먹이 받기 | 45초 또는 목숨 3개 소진 | 좌우 드래그 | 먹이 = 점수(최대 30), 코인 = 점수÷4 | 5 |
| `stack` | 높이 쌓기 | 실패할 때까지 (보통 20~60초) | 화면 탭 | 코인 = 층수 + 퍼펙트 (최대 40) | 5 |
| `memory` | 짝 맞추기 | 60초, 4×4 | 카드 탭 | 코인 = 점수÷5, 경험치 = 맞춘 쌍 | 5 |
| `quiz` | 오늘의 OX 퀴즈 | 5문제, 문제당 12초 | O/X 탭 | 코인 = 정답×5, 경험치 = 정답×2 | 1 |

- 순수 JavaScript, 외부 라이브러리 없음. 캐릭터·아이템은 기본이 이모지이고 이미지 주소로 바꿀 수 있음
- 결과 화면에 **"광고 보고 2배 받기"** (보상형 광고 연결 시에만 표시)
- 일일 보상 횟수 제한·최고 기록은 기기에 저장 (localStorage 또는 직접 넘긴 저장소)
- 분석 이벤트: `game_start`, `game_end`, `game_quit`, `ad_double_click`, `reward_claim`, `game_exit`

## 폴더

```
src/index.js              진입점 (startMiniGame, createRewardTracker …)
src/core/                 공통: 흐름(runner), 보상 규칙(rewards), 문구(strings), 스타일, 저장소
src/games/{id}/logic.js   게임 규칙 (화면과 분리된 순수 함수 → 테스트 대상, 다른 엔진으로 옮길 때 기준)
src/games/{id}/game.js    화면 (catch·stack은 canvas, memory·quiz는 DOM)
src/games/quiz/questions/*.json  OX 문제 원본 1,018개 (분야별 파일) — 고칠 때는 여기
src/games/quiz/questions.ko.js   위 JSON을 합친 자동 생성 파일 (npm run questions)
bridge/webview.js         네이티브 앱 WebView 연결부
dist/                     빌드 결과 (npm run build)
test/logic.test.js        규칙 테스트 21개 (npm test)
demo/                     데모 화면 소스
```

## 앱에 붙이는 방법 — 앱 종류별

### A. 웹 기반 앱 (React / Vue / Svelte / Capacitor / Ionic 등)

`src/` 폴더를 통째로 복사하거나 `dist/minigames.esm.js` 한 파일만 복사.

```js
import { startMiniGame, createRewardTracker } from './minigames/src/index.js';

const tracker = createRewardTracker(); // 앱 저장소를 쓰려면 아래 "저장소 바꾸기" 참고

const game = startMiniGame('catch', containerEl, {   // containerEl은 높이가 있어야 함 (예: 전체 화면)
  tracker,
  character: '/assets/pet-lv3.png',                   // 지금 키우는 캐릭터 그림 (이모지도 가능)
  showRewardedAd: () => ads.showRewarded(),           // 끝까지 봤으면 true를 돌려주는 Promise
  onReward: ({ reward }) => wallet.add(reward),       // { coins?, food?, exp? }
  onEvent: (name, params) => analytics.log(name, params),
  onExit: () => router.back(),
});
// 화면을 떠날 때 반드시: game.destroy()
```

React 예:

```jsx
function MiniGameScreen({ id, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = startMiniGame(id, ref.current, { tracker, onReward: addReward, onExit: onClose });
    return () => g.destroy();
  }, [id]);
  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />;
}
```

### B. 네이티브 앱 (React Native / Flutter / Swift / Kotlin)

`dist/minigames-webview.html` 한 파일을 앱 에셋에 넣고 WebView로 연다.
주소 뒤에 `#game=catch&character=🐥` (게임: `catch` | `stack` | `memory` | `quiz`, 광고 끄기: `&ads=0`).

웹 → 앱 메시지(JSON 문자열):

| type | 내용 | 앱이 할 일 |
|---|---|---|
| `ready` | 로드 완료 | – |
| `reward` | `{ gameId, reward: {coins?, food?, exp?}, doubled, result }` | 재화에 더하기 |
| `ad_request` | `{ requestId }` | 보상형 광고 띄우고 → `MiniGameBridge.adResult(requestId, 끝까지봤는지)` 실행 |
| `event` | `{ name, params }` | 분석 도구로 전달 |
| `exit` | – | WebView 닫기 |

메시지 채널 이름: React Native `window.ReactNativeWebView`, Flutter JavaScriptChannel `MiniGameChannel`,
iOS `webkit.messageHandlers.miniGame`, Android `addJavascriptInterface(…, "AndroidMiniGame")`.

React Native 예:

```jsx
<WebView
  ref={webRef}
  source={require('./minigames-webview.html')} // 안드로이드는 file:///android_asset/minigames-webview.html#game=catch
  originWhitelist={['*']}
  onMessage={(e) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'reward') addReward(m.reward);
    if (m.type === 'ad_request') showRewarded().then((ok) =>
      webRef.current.injectJavaScript(`MiniGameBridge.adResult(${m.requestId}, ${ok}); true;`));
    if (m.type === 'exit') navigation.goBack();
  }}
/>
```

Flutter 예 (webview_flutter):

```dart
controller
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..addJavaScriptChannel('MiniGameChannel', onMessageReceived: (msg) async {
    final m = jsonDecode(msg.message);
    if (m['type'] == 'reward') wallet.add(m['reward']);
    if (m['type'] == 'ad_request') {
      final ok = await showRewardedAd();
      controller.runJavaScript('MiniGameBridge.adResult(${m['requestId']}, $ok)');
    }
    if (m['type'] == 'exit') Navigator.pop(context);
  })
  ..loadFlutterAsset('assets/minigames-webview.html'); // 해시(#game=…)는 load 후 runJavaScript('MiniGameBridge.start("stack")')로 지정
```

### C. 게임 엔진 (Unity / Godot 등)으로 직접 다시 만들 경우

화면 코드는 버리고 `src/games/{id}/logic.js` 의 규칙과 `src/core/rewards.js` 의 보상 숫자를 그대로 옮긴다.
`test/logic.test.js` 의 테스트 항목이 그대로 검수 목록이 된다.

## 바꾸기

- **보상 숫자·하루 횟수**: `src/core/rewards.js` 의 `REWARD_RULES`
- **난이도**: 각 `logic.js` 맨 위 `*_CONFIG` (속도, 시간, 판정 너그러움)
- **그림**: `options.skin` — 게임별 `defaultSkin` 참고
  ```js
  startMiniGame('catch', el, { skin: { food: ['/img/feed1.png', '/img/feed2.png'], bomb: '/img/rock.png' } });
  startMiniGame('memory', el, { skin: { pairs: [/* 8개 */] } });
  startMiniGame('quiz', el, { skin: { questions: myQuestions } }); // [{ q, a: true|false, exp }]
  ```
- **색**: `.mg-root { --mg-accent: #5b8cff; }` 처럼 CSS 변수 덮어쓰기
- **문구·다국어**: `options.strings` 에 `STRINGS_KO` 와 같은 모양의 객체
- **저장소 바꾸기** (앱 저장 계층 사용):
  ```js
  const tracker = createRewardTracker({ storage: { get: (k) => myStore.get(k), set: (k, v) => myStore.set(k, v) } });
  ```
  get은 동기 함수여야 한다. AsyncStorage처럼 비동기면 앱 시작 때 값을 메모리에 올려두고 감싸서 넘긴다.

## 알아둘 한계 (냉정하게)

1. **부정 방지 없음**: 하루 보상 제한은 기기 저장소 기준이라 앱 데이터 삭제나 시간 변경으로 우회된다. 재화가 결제와 엮이면 서버에서 날짜·횟수를 검증해야 한다.
2. **보상 숫자는 출발점일 뿐**: 앱 재화 가격과 대조하지 않았다. 미니게임 보상이 기존 재화 공급원보다 효율이 좋아지지 않게 맞출 것.
3. **OX 문제 1,018개**: 날짜 순서대로 돌아가며 내서 약 203일 동안 같은 문제가 다시 나오지 않는다. 대신 문제를 추가·삭제하면 출제 순서가 새로 섞이므로 출시 후에는 모아서 가끔 한 번에 바꿀 것.
   - 분야: 동물 30, 포유류 100, 새 100, 바다·파충류 100, 곤충·작은 생물 100, 반려동물 98, 식물 100, 음식 93, 우리 몸 99, 지구·날씨 99, 우주·과학 99 (O 542 / X 476)
   - AI가 쓰고 다른 AI가 교차 검수했다(정답 오류 0건, 해설·표현 수정 20건, 중복 12건 삭제). **사람 검수는 아니다.** 출시 전에 분야별로 몇십 개씩 직접 훑어보고, 앱에 '문제 신고' 버튼을 두는 걸 권장
   - 문제 은행이 묶음 파일에 들어가 `dist/` 파일이 약 350KB가 됐다. 더 줄이려면 questions.ko.js를 별도 JSON으로 빼서 퀴즈를 열 때 불러오면 된다
4. **효과음·배경음 없음**: 넣으려면 `game.js`의 이벤트(catch/bomb/perfect/match) 자리에 재생 코드 추가.
5. **이모지 그림은 기기마다 다르게 보임**: 출시 전에 앱 그림으로 바꾸는 걸 권장.
6. **숨은 그림 찾기는 미포함**: 그림 자원이 필요해서 이번 범위에서 뺐다.

## 출시 후 볼 지표

- 미니게임 참여율 = `game_start` 한 사용자 / 하루 사용자(DAU)
- 게임별 한 판 끝까지 하는 비율 = `game_end` / `game_start` (`game_quit`이 많으면 너무 어려움)
- 광고 2배 선택률 = `ad_double_click` / `reward_claim`
- 미니게임 도입 전후 1일·7일 리텐션 (D1/D7)

## 명령

```
npm install      # esbuild (빌드할 때만 필요)
npm test         # 규칙 테스트 (Node 18+)
npm run questions  # questions/*.json → questions.ko.js (문제 고친 뒤)
npm run build    # dist/ 다시 만들기
```
