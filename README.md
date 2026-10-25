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
