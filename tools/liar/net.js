// 각자 폰 모드의 방 저장소.
// - firebase-config.js 에 설정이 있으면 Firebase Realtime Database 를 씁니다.
// - 주소에 ?dev 가 붙어 있으면 같은 브라우저의 탭끼리만 공유하는 localStorage 로 대신합니다 (개발·테스트용).
// 두 어댑터는 같은 모양(get / set / update / remove / subscribe)이라 main.js 는 어느 쪽인지 몰라도 돼요.
window.LiarNet = (() => {
  const FB_VER = "10.14.1";
  const PATH = "rooms/";

  // { "a/b/c": v } 형태의 패치를 객체에 적용. v 가 null 이면 그 키를 지웁니다 (Firebase update 와 같은 규칙).
  function applyPatch(obj, patch) {
    for (const [path, v] of Object.entries(patch)) {
      const keys = path.split("/").filter(Boolean);
      let cur = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      const last = keys[keys.length - 1];
      if (v === null || v === undefined) delete cur[last];
      else cur[last] = v;
    }
    return obj;
  }

  // ---------- localStorage 어댑터 (개발용) ----------
  function localStore() {
    const key = (code) => "su:liar:dev:" + code;
    const bus = new EventTarget(); // 같은 탭 안에서는 storage 이벤트가 안 오므로 직접 알림
    const read = (code) => { try { return JSON.parse(localStorage.getItem(key(code))); } catch { return null; } };
    const write = (code, data) => {
      if (data === null) localStorage.removeItem(key(code));
      else localStorage.setItem(key(code), JSON.stringify(data));
      bus.dispatchEvent(new CustomEvent("change", { detail: code }));
    };
    // Firebase 의 서버 시각 표시자를 숫자로 바꿔 줍니다.
    const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === "object" && x[".sv"] === "timestamp" ? Date.now() : x)));
    return {
      kind: "local",
      now: () => Date.now(),
      get: async (code) => read(code),
      set: async (code, data) => write(code, plain(data)),
      update: async (code, patch) => write(code, applyPatch(read(code) || {}, plain(patch))),
      remove: async (code) => write(code, null),
      subscribe(code, cb) {
        const fire = () => cb(read(code));
        const onStorage = (e) => { if (e.key === key(code)) fire(); };
        const onBus = (e) => { if (e.detail === code) fire(); };
        window.addEventListener("storage", onStorage);
        bus.addEventListener("change", onBus);
        setTimeout(fire, 0);
        return () => { window.removeEventListener("storage", onStorage); bus.removeEventListener("change", onBus); };
      },
    };
  }

  // ---------- Firebase Realtime Database 어댑터 ----------
  const loadScript = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error("스크립트를 못 불러왔어요: " + src));
    document.head.appendChild(s);
  });

  async function firebaseStore(config) {
    if (!window.firebase) {
      const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
      await loadScript(base + "firebase-app-compat.js");
      await loadScript(base + "firebase-database-compat.js");
    }
    if (!firebase.apps.length) firebase.initializeApp(config);
    const db = firebase.database();
    const ref = (code) => db.ref(PATH + code);
    return {
      kind: "firebase",
      now: () => firebase.database.ServerValue.TIMESTAMP,
      get: async (code) => (await ref(code).once("value")).val(),
      set: (code, data) => ref(code).set(data),
      update: (code, patch) => ref(code).update(patch),
      remove: (code) => ref(code).remove(),
      subscribe(code, cb) {
        const r = ref(code);
        const h = r.on("value", (snap) => cb(snap.val()), () => cb(null)); // 권한 오류 등은 "방 없음"으로 취급
        return () => r.off("value", h);
      },
    };
  }

  // 설정에 맞는 어댑터를 돌려줍니다. 쓸 수 있는 게 없으면 null.
  async function connect() {
    if (new URLSearchParams(location.search).has("dev")) return localStore();
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.databaseURL) return firebaseStore(cfg);
    return null;
  }

  return { connect, applyPatch };
})();
