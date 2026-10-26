// 네트워크 우선, 실패하면 캐시 (오프라인에서도 열리게).
// 온라인일 땐 항상 최신 파일을 받으므로 배포 후 따로 캐시 버전을 올릴 필요는 없습니다.
// 단, 아래 PRECACHE 목록에 없는 페이지는 한 번 이상 방문해야 오프라인에서 열립니다.
const CACHE = "su-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/app.js",
  "./assets/tools.js",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./tools/budget/",
  "./tools/notes/",
  "./tools/liar/",
  "./tools/liar/words.js",
  "./tools/liar/game.js",
  "./tools/liar/net.js",
  "./tools/liar/firebase-config.js",
  "./tools/liar/main.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
