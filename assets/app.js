// 모든 페이지 공통: 서비스 워커 등록. 허브(index.html)에서는 도구 카드도 그립니다.
(() => {
  const root = new URL("../", document.currentScript.src);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker
      .register(new URL("sw.js", root), { scope: root.pathname })
      .catch(() => {});
  }

  const grid = document.getElementById("grid");
  if (!grid || !Array.isArray(window.TOOLS)) return;

  const q = document.getElementById("q");
  const empty = document.getElementById("empty");
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const card = (t) => `<li><a class="card" href="${esc(t.href)}">
  <span class="card-icon" aria-hidden="true">${esc(t.icon || "🔧")}</span>
  <span class="card-body"><span class="card-name">${esc(t.name)}</span><span class="card-desc">${esc(t.desc || "")}</span></span>
</a></li>`;

  const render = (filter = "") => {
    const f = filter.trim().toLowerCase();
    const items = window.TOOLS.filter(
      (t) => !f || [t.name, t.desc, t.group, ...(t.tags || [])].join(" ").toLowerCase().includes(f)
    );
    // group 이 둘 이상이면 묶음 제목을 붙여서 보여줍니다.
    const groups = [...new Set(items.map((t) => t.group || "도구"))];
    grid.innerHTML = groups
      .map((g) => {
        const list = items.filter((t) => (t.group || "도구") === g).map(card).join("");
        const title = groups.length > 1 ? `<h2 class="group-title">${esc(g)}</h2>` : "";
        return `<section class="group">${title}<ul class="grid">${list}</ul></section>`;
      })
      .join("");
    empty.hidden = items.length > 0;
  };

  render();
  if (q) {
    q.hidden = window.TOOLS.length < 6; // 도구가 몇 개 없을 땐 검색창을 숨깁니다.
    q.addEventListener("input", () => render(q.value));
  }

  // iOS Safari 에서 (홈 화면 앱이 아닌 채로) 열었을 때만 안내 문구 표시
  const hint = document.getElementById("ios-hint");
  if (hint && navigator.standalone === false) hint.hidden = false;
})();
