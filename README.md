# Something Useful

내가 쓰려고 만드는 작은 도구 모음. GitHub Pages 에 올려 두고 아이폰 홈 화면에 추가해서 앱처럼 씁니다.

빌드 도구 없이 순수 HTML / CSS / JS 만 씁니다. 파일을 고치고 push 하면 그게 곧 배포입니다.

## 구조

```
index.html              허브. assets/tools.js 목록을 읽어 카드로 보여줌
manifest.webmanifest    PWA 설정 (홈 화면 추가 시 이름, 아이콘)
sw.js                   서비스 워커 (오프라인 캐시)
assets/style.css        공통 스타일 (라이트/다크 자동)
assets/app.js           서비스 워커 등록 + 허브 렌더링
assets/tools.js         도구 목록 ← 도구 추가할 때 여기 한 줄
tools/<이름>/index.html  도구 하나당 폴더 하나
icons/                  앱 아이콘
```

## 도구 추가하는 법

1. `tools/새이름/index.html` 을 만든다. `tools/notes/index.html` 을 복사해서 시작하면 편하다.
   - 공통 파일은 `../../assets/style.css`, `../../assets/app.js` 처럼 상대 경로로 부른다.
   - 데이터 저장은 `localStorage` 면 충분하다. 키 이름은 `su:도구이름` 식으로.
2. `assets/tools.js` 에 한 줄 추가한다.
   ```js
   { name: "이름", desc: "한 줄 설명", href: "./tools/새이름/", icon: "🔧" },
   ```
3. 오프라인에서도 바로 열리게 하려면 `sw.js` 의 `PRECACHE` 에 `"./tools/새이름/"` 을 추가한다. (안 해도 한 번 열어 보면 그 뒤로는 캐시됨)

## 라이어 게임 "각자 폰으로" 모드 켜기 (Firebase)

`tools/liar/` 의 "한 폰으로" 모드는 그냥 됩니다. "각자 폰으로" 모드는 폰끼리 상태를 맞춰 줄 서버가 필요해서 Firebase Realtime Database 를 씁니다. 한 번만 설정하면 돼요.

1. https://console.firebase.google.com 에서 프로젝트 만들기. Google 애널리틱스는 꺼도 됨.
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**. 위치는 `asia-southeast1` (싱가포르), 보안 규칙은 "잠금 모드"로 시작.
3. 같은 화면의 **규칙** 탭에 `tools/liar/firebase.rules.json` 내용을 그대로 붙여 넣고 **게시**.
4. **프로젝트 설정(톱니) → 일반 → 내 앱 → 웹 앱(</>) 추가**. 호스팅은 체크 안 함. 나오는 `firebaseConfig` 를 `tools/liar/firebase-config.js` 에 붙여 넣기 (파일 안에 예시 있음). `databaseURL` 이 빠져 있으면 Realtime Database 화면 상단의 주소를 넣는다.
5. push. 홈 화면의 "아직 연결 전" 표시가 사라지면 끝.

### 돈 안 나가게
- 요금제는 **Spark(무료)** 그대로 둔다. 카드 등록이 없으니 한도를 넘으면 그냥 그날 멈출 뿐 청구가 안 된다. **Blaze 로 올리지 않는 것**이 유일하게 중요한 규칙.
- 무료 한도는 동시 접속 100명, 저장 1GB, 다운로드 월 10GB. 방 하나가 몇 KB 라 친구들끼리 쓰는 정도로는 근처도 못 간다.
- `firebase.rules.json` 이 하는 일: 방 목록 전체 읽기 금지(코드를 아는 방만), 정해진 모양·길이의 데이터만 쓰기 허용, 만든 지 12시간 넘은 방은 지우는 것만 가능. 낯선 사람이 저장소로 쓰거나 긁어 가는 걸 막는 용도.
- `firebase-config.js` 의 값은 비밀이 아니다(브라우저에 어차피 노출됨). 접근 제어는 전부 규칙이 한다.
- 역할·단어가 방 데이터에 그대로 들어 있어서, 개발자 도구를 열 줄 아는 친구는 치팅이 가능하다. 친구끼리 쓰는 거라 그대로 둠.

### 로컬에서 멀티 테스트
주소 뒤에 `?dev=1` 을 붙이면 Firebase 없이 같은 브라우저의 탭끼리 방을 공유한다. 탭 하나가 사람 하나.

## 로컬에서 보기

서비스 워커 때문에 파일을 더블클릭해서 여는 건 안 되고, 간단한 서버가 필요하다.

```bash
python -m http.server 8765
```

그다음 http://localhost:8765 로 접속.

## 배포 (GitHub Pages)

1. GitHub 저장소 → Settings → Pages
2. Source: **Deploy from a branch**, Branch: **main** / **(root)** → Save
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 에서 열림

이후로는 `main` 에 push 할 때마다 자동으로 반영된다.

## 아이폰 홈 화면에 추가

Safari 로 사이트를 연 뒤 하단 **공유** 버튼 → **홈 화면에 추가**. 전체 화면으로 열리고 아이콘도 따로 생긴다.

## 주의

- 경로는 전부 **상대 경로**로 쓴다. 프로젝트 사이트는 `https://계정.github.io/저장소/` 아래에 올라가므로 `/assets/...` 처럼 절대 경로를 쓰면 깨진다.
- `.nojekyll` 은 GitHub Pages 가 Jekyll 처리를 건너뛰게 하는 빈 파일이다. 지우지 말 것.
