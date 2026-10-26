// Firebase 설정. 이 값이 있으면 "각자 폰으로" 모드가 켜져요.
// 라이어 게임은 Realtime Database 만 쓰기 때문에 데이터베이스 주소 하나면 충분해요.
// (Firebase 콘솔이 주는 apiKey, appId 같은 값은 로그인 등 다른 기능용이라 넣지 않아요.)
// 접근 제한은 firebase.rules.json 이 담당합니다.
window.FIREBASE_CONFIG = {
  databaseURL: "https://somethinguseful-794c5-default-rtdb.asia-southeast1.firebasedatabase.app",
};
