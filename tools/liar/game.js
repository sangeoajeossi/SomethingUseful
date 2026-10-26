// 두 모드(한 폰 / 각자 폰)가 같이 쓰는 순수 게임 로직. DOM 을 건드리지 않아요.
window.LiarGame = (() => {
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // 고른 주제들에서 단어 쌍 하나를 뽑고, 어느 쪽이 시민 단어인지도 정합니다.
  function drawWords(catIds) {
    const cats = window.LIAR_WORDS.filter((c) => catIds.includes(c.id));
    const pool = (cats.length ? cats : window.LIAR_WORDS).flatMap((c) => c.pairs.map((p) => ({ cat: c, pair: p })));
    const pick = pool[rand(pool.length)];
    const side = rand(2); // 0 이면 앞 단어가 시민, 1 이면 뒤 단어가 시민
    const w = (i) => ({ ko: pick.pair[i * 2], en: pick.pair[i * 2 + 1] });
    return { catName: pick.cat.name, citizen: w(side), liar: w(1 - side) };
  }

  // ids 중 liars 명을 라이어로 뽑아 { id: "liar" | "citizen" } 을 돌려줍니다.
  function assignRoles(ids, liars) {
    const picked = new Set(shuffle(ids).slice(0, liars));
    const roles = {};
    ids.forEach((id) => { roles[id] = picked.has(id) ? "liar" : "citizen"; });
    return roles;
  }

  // 투표 집계. votes 는 { 투표한사람: 지목한사람 }. 최다 득표가 동점이면 out 은 null, tie 는 true.
  function tally(votes) {
    const count = {};
    Object.values(votes || {}).forEach((t) => { count[t] = (count[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(count));
    const top = Object.keys(count).filter((id) => count[id] === max);
    return { count, out: top.length === 1 ? top[0] : null, tie: top.length > 1 };
  }

  // 승패. 라이어를 다 찾으면 "citizen", 남은 라이어 수가 남은 시민 수 이상이면 "liar", 아직이면 null.
  function winner(aliveIds, roles) {
    const liars = aliveIds.filter((id) => roles[id] === "liar").length;
    const citizens = aliveIds.length - liars;
    if (liars === 0) return "citizen";
    if (liars >= citizens) return "liar";
    return null;
  }

  return { drawWords, assignRoles, tally, winner, shuffle, rand };
})();
