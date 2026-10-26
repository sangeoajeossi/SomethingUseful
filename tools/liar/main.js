// 라이어 게임 화면 제어. 게임 규칙은 game.js, 단어는 words.js, 각자 폰 모드의 저장소는 net.js 에 있어요.
(() => {
  const $ = (id) => document.getElementById(id);
  const G = window.LiarGame;
  const CATS = window.LIAR_WORDS;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const params = new URLSearchParams(location.search);
  const MIN = 3, MAX = 12;
  const ROOM_TTL = 12 * 60 * 60 * 1000; // 이보다 오래된 방은 없는 셈 침
  // 라이어가 시민보다 적어야 게임이 시작부터 끝나 있지 않아요. (인원-2 보다 더 엄격한 상한)
  const maxLiars = (n) => Math.max(1, Math.floor((n - 1) / 2));

  // ---------- 공통 UI ----------
  const notice = $("notice");
  function say(text, sticky) {
    notice.textContent = text; notice.hidden = !text;
    clearTimeout(say.t);
    if (text && !sticky) say.t = setTimeout(() => { notice.hidden = true; }, 3000);
  }
  const screens = [...document.querySelectorAll("[data-screen]")];
  let current = "home";
  function show(name) {
    const changed = current !== name;
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
    current = name;
    $("back").textContent = name === "home" ? "← 홈" : "← 처음으로";
    if (changed) window.scrollTo(0, 0);
  }

  // 주제 칩. selected 는 Set, 바뀔 때마다 onChange 호출.
  function renderChips(el, hintEl, selected, onChange) {
    el.innerHTML = CATS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${selected.has(c.id)}">${c.icon} ${esc(c.name)}</button>`).join("")
      + `<button type="button" class="chip" data-cat="*" aria-pressed="${selected.size === CATS.length}">전체</button>`;
    const pairs = CATS.filter((c) => selected.has(c.id)).reduce((a, c) => a + c.pairs.length, 0);
    hintEl.textContent = selected.size ? `${selected.size}개 · ${pairs}쌍` : "하나 이상 골라 주세요";
    el.onclick = (ev) => {
      const b = ev.target.closest("[data-cat]"); if (!b) return;
      const id = b.dataset.cat;
      if (id === "*") { if (selected.size === CATS.length) selected.clear(); else CATS.forEach((c) => selected.add(c.id)); }
      else if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      renderChips(el, hintEl, selected, onChange);
      if (onChange) onChange();
    };
  }

  // 플레이어 카드 그리드. items: [{ id, name, sub, out, selected, disabled }]
  const gridHTML = (items) => items.map((p) =>
    `<button type="button" class="pcard${p.out ? " out" : ""}" data-id="${esc(p.id)}" aria-pressed="${!!p.selected}"${p.disabled ? " disabled" : ""}>` +
    `<span class="pname">${esc(p.name)}</span>${p.sub ? `<span class="psub">${esc(p.sub)}</span>` : ""}</button>`).join("");

  // 버튼 묶음. list: [[label, kind, fn, disabled]]
  function renderActions(el, list) {
    el.innerHTML = "";
    list.forEach(([label, kind, fn, disabled]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (kind === "primary" ? " btn-primary" : kind === "danger" ? " btn-danger" : "");
      b.textContent = label; b.disabled = !!disabled; b.onclick = fn;
      el.appendChild(b);
    });
  }

  const roleText = (r) => (r === "liar" ? "라이어" : "시민");
  const roleClass = (r) => (r === "liar" ? "role-liar" : "role-citizen");
  const winText = (w) => (w === "citizen" ? "시민 승리 🎉" : "라이어 승리 😈");

  // ---------- 토론 타이머 ----------
  const timer = { total: 180, left: 180, endAt: 0, iv: null };
  function timerRender() {
    const m = Math.floor(timer.left / 60), s = timer.left % 60;
    $("timerText").textContent = `${m}:${String(s).padStart(2, "0")}`;
    $("timerText").classList.toggle("done", timer.left === 0);
    $("timerToggle").textContent = timer.iv ? "멈춤" : timer.left === 0 ? "다시" : "시작";
  }
  function timerStop() { clearInterval(timer.iv); timer.iv = null; timerRender(); }
  function timerTick() {
    timer.left = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    if (timer.left === 0) { timerStop(); try { navigator.vibrate && navigator.vibrate(300); } catch {} }
    timerRender();
  }
  $("timerToggle").onclick = () => {
    if (timer.iv) return timerStop();
    if (timer.left === 0) timer.left = timer.total;
    timer.endAt = Date.now() + timer.left * 1000;
    timer.iv = setInterval(timerTick, 250);
    timerRender();
  };
  document.querySelectorAll("[data-timer]").forEach((b) => {
    b.onclick = () => {
      const d = Number(b.dataset.timer);
      timer.total = Math.min(600, Math.max(60, timer.total + d));
      if (timer.iv) { timer.endAt = Math.max(Date.now(), timer.endAt + d * 1000); timerTick(); }
      else { timer.left = timer.total; timerRender(); }
    };
  });

  // ==================================================
  //  한 폰으로 (패스 앤 플레이)
  // ==================================================
  const PP_KEY = "su:liar:pp";
  const pp = { players: 6, liars: 1, cats: new Set(CATS.map((c) => c.id)), names: [], revealLiar: false };
  try {
    const s = JSON.parse(localStorage.getItem(PP_KEY) || "{}");
    if (s.players) pp.players = s.players;
    if (s.liars) pp.liars = s.liars;
    if (Array.isArray(s.cats) && s.cats.length) pp.cats = new Set(s.cats.filter((id) => CATS.some((c) => c.id === id)));
    if (Array.isArray(s.names)) pp.names = s.names;
    pp.revealLiar = !!s.revealLiar;
  } catch {}
  function savePP() { localStorage.setItem(PP_KEY, JSON.stringify({ players: pp.players, liars: pp.liars, cats: [...pp.cats], names: pp.names, revealLiar: pp.revealLiar })); }
  const wordLabel = (reveal, role) => (reveal && role === "liar" ? "당신은 라이어예요 🤫" : "당신의 단어");
  function clampPP() {
    pp.players = Math.min(MAX, Math.max(MIN, pp.players));
    pp.liars = Math.min(maxLiars(pp.players), Math.max(1, pp.liars));
  }
  const ppName = (i) => (pp.names[i] || "").trim() || `${i + 1}번`;

  function renderSetup() {
    clampPP();
    $("ppPlayers").value = pp.players;
    $("ppLiars").value = pp.liars;
    renderChips($("ppCats"), $("ppCatHint"), pp.cats, () => { savePP(); $("ppStart").disabled = pp.cats.size === 0; });
    $("ppNames").innerHTML = Array.from({ length: pp.players }, (_, i) =>
      `<input class="input" data-name="${i}" maxlength="12" placeholder="${i + 1}번" value="${esc(pp.names[i] || "")}" aria-label="${i + 1}번 이름">`).join("");
    $("ppRevealLiar").checked = pp.revealLiar;
    $("ppStart").disabled = pp.cats.size === 0;
    savePP();
  }
  $("ppRevealLiar").addEventListener("change", () => { pp.revealLiar = $("ppRevealLiar").checked; savePP(); });
  $("ppNames").addEventListener("input", (ev) => {
    const i = Number(ev.target.dataset.name);
    if (Number.isInteger(i)) { pp.names[i] = ev.target.value; savePP(); }
  });

  let game = null; // { ids, roles, words, alive:Set, idx, shown, selected, first, win }
  const wordFor = (id) => (game.roles[id] === "liar" ? game.words.liar : game.words.citizen);

  function ppNewGame() {
    clampPP();
    const ids = Array.from({ length: pp.players }, (_, i) => i);
    game = { ids, roles: G.assignRoles(ids, pp.liars), words: G.drawWords([...pp.cats]), alive: new Set(ids), idx: 0, shown: false, selected: null, first: null, win: null, revealLiar: pp.revealLiar };
    timerStop(); timer.left = timer.total; timerRender();
    renderReveal(); show("pp-reveal");
  }
  function renderReveal() {
    const id = game.ids[game.idx];
    $("ppRevealStep").textContent = `${game.idx + 1} / ${game.ids.length}`;
    $("ppRevealName").textContent = ppName(id);
    $("ppRevealHidden").hidden = game.shown;
    $("ppRevealShown").hidden = !game.shown;
    if (game.shown) {
      const w = wordFor(id);
      $("ppWordLabel").textContent = wordLabel(game.revealLiar, game.roles[id]);
      $("ppWordKo").textContent = w.ko; $("ppWordEn").textContent = w.en; $("ppWordCat").textContent = "주제: " + game.words.catName;
    }
    $("ppNext").textContent = game.idx === game.ids.length - 1 ? "확인했어요 → 토론 시작" : "확인했어요 → 다음 사람";
  }
  $("ppShow").onclick = () => { game.shown = true; renderReveal(); };
  $("ppNext").onclick = () => {
    game.shown = false; game.idx++;
    if (game.idx < game.ids.length) return renderReveal();
    ppDiscuss(false);
  };
  // 토론 화면. again 이면 투표 한 번 하고 돌아온 것 (남은 인원 표시, 먼저 말할 사람은 남은 사람 중에서 다시 뽑음).
  function ppDiscuss(again) {
    const alive = [...game.alive];
    const liars = alive.filter((id) => game.roles[id] === "liar").length;
    game.first = alive[G.rand(alive.length)];
    $("ppFirst").textContent = ppName(game.first);
    $("ppDiscussInfo").textContent = again ? `다시 토론 · 남은 ${alive.length}명 · 라이어 ${liars}명` : "";
    $("ppDiscussInfo").hidden = !again;
    timerStop(); timer.left = timer.total; timerRender();
    show("pp-discuss");
  }
  $("ppToVote").onclick = () => { timerStop(); game.selected = null; renderVote(); show("pp-vote"); };

  function renderVote() {
    const alive = [...game.alive];
    const liars = alive.filter((id) => game.roles[id] === "liar").length;
    $("ppVoteHint").textContent = `남은 ${alive.length}명 · 라이어 ${liars}명`;
    $("ppVoteGrid").innerHTML = gridHTML(game.ids.map((id) => ({
      id, name: ppName(id), out: !game.alive.has(id), sub: game.alive.has(id) ? "" : "탈락",
      selected: game.selected === id, disabled: !game.alive.has(id),
    })));
    $("ppVoteSubmit").disabled = game.selected === null;
  }
  $("ppVoteGrid").onclick = (ev) => {
    const b = ev.target.closest("[data-id]"); if (!b || b.disabled) return;
    const id = Number(b.dataset.id);
    game.selected = game.selected === id ? null : id;
    renderVote();
  };
  $("ppVoteSubmit").onclick = () => {
    const out = game.selected; if (out === null) return;
    game.alive.delete(out);
    const role = game.roles[out];
    game.win = G.winner([...game.alive], game.roles);
    const liarsLeft = [...game.alive].filter((id) => game.roles[id] === "liar").length;
    $("ppResultName").textContent = ppName(out) + " 은(는)";
    $("ppResultRole").textContent = role === "liar" ? "라이어였어요!" : "시민이었어요";
    $("ppResultRole").className = "big " + (role === "liar" ? "role-liar" : "");
    $("ppResultSub").textContent = game.win ? "" : `라이어가 아직 ${liarsLeft}명 남아 있어요. 다시 토론하고 투표해요.`;
    $("ppResultNext").textContent = game.win ? "최종 결과 보기" : "다시 토론하기";
    show("pp-result");
  };
  $("ppResultNext").onclick = () => {
    if (game.win) { renderEnd(); show("pp-end"); }
    else { game.selected = null; ppDiscuss(true); }
  };
  function renderEnd() {
    $("ppWinnerText").textContent = winText(game.win);
    $("ppEndCitKo").textContent = game.words.citizen.ko; $("ppEndCitEn").textContent = game.words.citizen.en;
    $("ppEndLiarKo").textContent = game.words.liar.ko; $("ppEndLiarEn").textContent = game.words.liar.en;
    $("ppRoles").innerHTML = game.ids.map((id) =>
      `<li><span class="grow">${esc(ppName(id))}${game.alive.has(id) ? "" : ' <span class="psub">탈락</span>'}</span>` +
      `<span class="${roleClass(game.roles[id])}">${roleText(game.roles[id])}</span></li>`).join("");
  }
  $("ppAgain").onclick = ppNewGame;
  $("ppReset").onclick = () => { game = null; renderSetup(); show("pp-setup"); };
  $("ppStart").onclick = () => { if (!pp.cats.size) return say("주제를 하나 이상 골라 주세요"); ppNewGame(); };
  $("goLocal").onclick = () => { renderSetup(); show("pp-setup"); };

  // ==================================================
  //  각자 폰으로 (온라인)
  // ==================================================
  // 내가 누구인지(pid)와 어느 방에 있었는지는 보통 localStorage 에 두지만,
  // 개발용 로컬 모드(?dev)에서는 탭 하나가 사람 하나라서 탭별 저장소(sessionStorage)를 써요.
  const idStore = params.has("dev") ? sessionStorage : localStorage;
  const on = {
    store: null, code: null, room: null, unsub: null,
    pid: idStore.getItem("su:liar:pid") || "",
    name: localStorage.getItem("su:liar:name") || "",
    selected: null, hideWord: false, resolved: new Set(),
  };
  if (!on.pid) { on.pid = uid(); idStore.setItem("su:liar:pid", on.pid); }
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 I O 0 1 은 뺌
  const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[G.rand(CODE_CHARS.length)]).join("");
  const playersOf = (room) => Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const pname = (room, id) => (room.players && room.players[id] && room.players[id].name) || "(나간 사람)";
  const onlineReady = () => params.has("dev") || !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL);
  const roomUrl = (code) => {
    const u = new URL(location.href); u.search = "";
    u.searchParams.set("room", code);
    if (params.has("dev")) u.searchParams.set("dev", "1");
    return u.toString();
  };

  async function enterOnline(autoCode) {
    if (!on.store) {
      try { on.store = await window.LiarNet.connect(); }
      catch (e) { say("연결에 실패했어요: " + e.message, true); return; }
    }
    if (!on.store) { say("아직 Firebase 설정이 없어요. tools/liar/firebase-config.js 를 채우면 켜져요.", true); return; }
    $("devTag").hidden = on.store.kind !== "local";
    $("onName").value = on.name;
    show("on-entry");
    const saved = idStore.getItem("su:liar:room");
    if (autoCode) {
      $("onCode").value = autoCode;
      if (on.name) joinRoom(autoCode); else say("이름을 적고 참여를 눌러 주세요", true);
    } else if (saved) {
      joinRoom(saved, true);
    }
  }
  function readName() {
    const n = $("onName").value.trim();
    if (!n) { say("이름을 적어 주세요"); $("onName").focus(); return null; }
    on.name = n; localStorage.setItem("su:liar:name", n);
    return n;
  }
  async function createRoom() {
    const name = readName(); if (!name) return;
    let code = genCode();
    for (let i = 0; i < 5 && (await on.store.get(code)); i++) code = genCode();
    const room = {
      createdAt: on.store.now(), hostId: on.pid, phase: "lobby",
      settings: { liars: 1, cats: CATS.map((c) => c.id) },
      players: { [on.pid]: { name, order: Date.now() } },
    };
    try { await on.store.set(code, room); }
    catch (e) { return say("방을 못 만들었어요: " + e.message, true); }
    attach(code);
  }
  // quiet: 저장된 방에 조용히 다시 들어가 보는 경우 (실패해도 안내 없이 홈으로)
  async function joinRoom(code, quiet) {
    code = String(code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { if (quiet) { forget(); show("home"); } else say("방 코드는 4자리예요"); return; }
    let room;
    try { room = await on.store.get(code); }
    catch (e) { return say("방을 못 찾았어요: " + e.message, true); }
    if (!room || (typeof room.createdAt === "number" && Date.now() - room.createdAt > ROOM_TTL)) {
      if (room) on.store.remove(code).catch(() => {});
      forget();
      if (quiet) show("home"); else say("그 코드의 방이 없어요");
      return;
    }
    if (!(room.players && room.players[on.pid])) {
      if (quiet) { forget(); show("home"); return; }
      const name = readName(); if (!name) return;
      if (room.phase !== "lobby") return say("이미 진행 중인 방이에요. 끝나고 대기실이 열리면 들어와 주세요", true);
      if (Object.keys(room.players || {}).length >= MAX) return say("정원이 다 찼어요 (최대 12명)");
      try { await on.store.update(code, { ["players/" + on.pid]: { name, order: Date.now() } }); }
      catch (e) { return say("못 들어갔어요: " + e.message, true); }
    }
    attach(code);
  }
  function attach(code) {
    if (on.unsub) on.unsub();
    on.code = code; on.selected = null; on.resolved.clear();
    idStore.setItem("su:liar:room", code);
    on.unsub = on.store.subscribe(code, onRoom);
  }
  function forget() { idStore.removeItem("su:liar:room"); }
  function detach() { if (on.unsub) on.unsub(); on.unsub = null; on.code = null; on.room = null; forget(); }

  function onRoom(room) {
    if (!on.code) return;
    if (!room) { detach(); say("방이 닫혔어요"); show("on-entry"); return; }
    if (!(room.players && room.players[on.pid])) { detach(); say("방에서 나왔어요"); show("on-entry"); return; }
    on.room = room;
    if (room.phase !== "vote") on.selected = null;
    renderOnline(room);
    // 방장 일은 그리기 뒤에. 저장소가 쓰자마자 이 함수를 다시(중첩해서) 부르기 때문에,
    // 먼저 하면 안쪽에서 그린 새 화면을 바깥의 옛 화면이 덮어써요.
    if (room.hostId === on.pid) hostDuties(room);
  }

  // 방장 폰만 하는 일: 전원 투표하면 집계, 사람이 나가서 승부가 났으면 종료.
  function hostDuties(room) {
    const r = room.round; if (!r) return;
    const roles = r.roles || {};
    const alive = Object.keys(r.alive || {});
    if (room.phase === "play" || room.phase === "vote") {
      const win = G.winner(alive, roles);
      if (win) { on.store.update(on.code, { phase: "end", "round/winner": win }).catch(() => {}); return; }
    }
    if (room.phase === "vote") {
      const votes = r.votes || {};
      if (!alive.length || !alive.every((id) => votes[id])) return;
      const key = `${r.n}:${r.v || 0}`;
      if (on.resolved.has(key)) return;
      on.resolved.add(key);
      const t = G.tally(votes);
      const patch = { phase: "result", "round/last": { out: t.out, tie: t.tie, count: t.count, role: t.out ? roles[t.out] || null : null } };
      if (t.out) {
        patch["round/alive/" + t.out] = null;
        patch["round/winner"] = G.winner(alive.filter((id) => id !== t.out), roles);
      }
      on.store.update(on.code, patch).catch((e) => say("결과를 저장하지 못했어요: " + e.message, true));
    }
  }
  function newRound(room) {
    const ids = playersOf(room).map((p) => p.id);
    const liars = Math.min((room.settings && room.settings.liars) || 1, maxLiars(ids.length));
    const roles = G.assignRoles(ids, liars);
    const words = G.drawWords((room.settings && room.settings.cats) || []);
    const alive = {}; ids.forEach((id) => { alive[id] = true; });
    const n = ((room.round && room.round.n) || 0) + 1;
    return on.store.update(on.code, {
      phase: "play",
      round: { n, v: 0, catName: words.catName, words: { citizen: words.citizen, liar: words.liar }, roles, alive, first: ids[G.rand(ids.length)] },
    }).catch((e) => say("시작하지 못했어요: " + e.message, true));
  }
  const openVote = (r) => on.store.update(on.code, { phase: "vote", "round/votes": null, "round/last": null, "round/timerEnd": null, "round/v": (r.v || 0) + 1 }).catch(() => {});
  // 투표 결과를 보고 난 뒤 다시 토론으로. 먼저 말할 사람은 남은 사람 중에서 다시 뽑고, 지난 투표 결과(last)는 토론 화면에 보여 주려고 남겨 둬요.
  const reDiscuss = (r) => {
    const alive = Object.keys(r.alive || {});
    return on.store.update(on.code, { phase: "play", "round/votes": null, "round/timerEnd": null, "round/first": alive[G.rand(alive.length)] || null }).catch(() => {});
  };
  // 방장이 켜는 토론 타이머. 끝나는 시각(ms)만 방에 저장하고 각자 폰이 알아서 세요.
  const DISCUSS_MS = 3 * 60 * 1000;
  const setTimer = (on_) => on.store.update(on.code, { "round/timerEnd": on_ ? Date.now() + DISCUSS_MS : null }).catch(() => {});
  let onTimerIv = null;
  function renderOnTimer(end) {
    clearInterval(onTimerIv); onTimerIv = null;
    const box = $("onTimerBox");
    if (!end) { box.hidden = true; return; }
    box.hidden = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      $("onTimer").textContent = left === 0 ? "끝!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      $("onTimer").classList.toggle("done", left === 0);
      if (left === 0) { clearInterval(onTimerIv); onTimerIv = null; try { navigator.vibrate && navigator.vibrate(300); } catch {} }
    };
    tick();
    onTimerIv = setInterval(tick, 500);
  }

  function renderOnline(room) {
    const host = room.hostId === on.pid;
    const players = playersOf(room);
    if (room.phase !== "play") renderOnTimer(null);
    if (room.phase === "lobby") {
      $("onLobbyCode").textContent = on.code;
      $("onLobbyCount").textContent = `${players.length}명 · ${MIN}~${MAX}명`;
      $("onLobbyPlayers").innerHTML = players.map((p) =>
        `<li><span class="grow">${esc(p.name)}${p.id === on.pid ? ' <span class="psub">나</span>' : ""}</span>${p.id === room.hostId ? '<span class="psub">방장</span>' : ""}</li>`).join("");
      $("onHostSettings").hidden = !host; $("onStart").hidden = !host; $("onLobbyWait").hidden = host; $("onGuestSettings").hidden = host;
      const settings = room.settings || {};
      if (host) {
        $("onLiars").value = Math.min(settings.liars || 1, maxLiars(Math.max(MIN, players.length)));
        const cats = new Set(settings.cats || []);
        renderChips($("onCats"), $("onCatHint"), cats, () => on.store.update(on.code, { "settings/cats": [...cats] }).catch(() => {}));
        $("onRevealLiar").checked = !!settings.revealLiar;
        $("onStart").disabled = players.length < MIN || cats.size === 0;
        $("onStart").textContent = players.length < MIN ? `시작 (${MIN}명부터)` : "시작";
      } else {
        const catNames = CATS.filter((c) => (settings.cats || []).includes(c.id)).map((c) => c.name);
        $("onGuestSettings").textContent = `라이어 ${settings.liars || 1}명 · 주제 ${catNames.length === CATS.length ? "전체" : catNames.join(", ") || "없음"} · 라이어에게 알려주기 ${settings.revealLiar ? "켬" : "끔"}`;
      }
      show("on-lobby");
      return;
    }
    if (room.phase === "end") { renderOnlineEnd(room, players); show("on-end"); return; }
    renderPlay(room, players);
    show("on-play");
  }

  function renderPlay(room, players) {
    const me = on.pid, host = room.hostId === me, r = room.round || {};
    const roles = r.roles || {}, alive = r.alive || {}, votes = r.votes || {};
    const w = r.words ? (roles[me] === "liar" ? r.words.liar : r.words.citizen) : null;
    $("onWordLabel").textContent = wordLabel(room.settings && room.settings.revealLiar, roles[me]);
    $("onWordToggle").textContent = on.hideWord ? "보기" : "숨기기";
    $("onWordBox").hidden = on.hideWord; $("onWordHidden").hidden = !on.hideWord;
    $("onWordKo").textContent = w ? w.ko : "–"; $("onWordEn").textContent = w ? w.en : "";
    $("onWordCat").textContent = r.catName ? "주제: " + r.catName : "";

    const aliveIds = Object.keys(alive);
    const liarsLeft = aliveIds.filter((id) => roles[id] === "liar").length;
    const myAlive = !!alive[me];
    $("onPlayTitle").textContent = `남은 ${aliveIds.length}명 · 라이어 ${liarsLeft}명`;
    let note = "", items = [], actions = [];

    renderOnTimer(room.phase === "play" ? r.timerEnd : null);
    if (room.phase === "play") {
      const last = r.last;
      const lastText = !last ? "" : last.out ? ` · 지난 투표: ${pname(room, last.out)}은(는) ${last.role === "liar" ? "라이어" : "시민"}` : " · 지난 투표: 동점";
      note = `${r.n}번째 판${last ? " · 다시 토론" : ""} · 먼저 말할 사람: ${pname(room, r.first)}${lastText}` + (host ? "" : " · 방장이 투표를 열면 투표할 수 있어요");
      items = players.map((p) => ({ id: p.id, name: p.name, out: !alive[p.id], sub: alive[p.id] ? (p.id === r.first ? "먼저" : "") : "탈락", disabled: true }));
      if (host) {
        actions.push(["투표 열기", "primary", () => openVote(r)]);
        const running = r.timerEnd && r.timerEnd > Date.now();
        actions.push([running ? "타이머 끄기" : "3분 타이머", "", () => setTimer(!running)]);
      }
    } else if (room.phase === "vote") {
      const voted = aliveIds.filter((id) => votes[id]).length;
      const canPick = myAlive && !votes[me];
      if (!myAlive) note = `탈락해서 구경 중 · 투표 ${voted}/${aliveIds.length}`;
      else if (votes[me]) note = `투표 완료 · ${voted}/${aliveIds.length} · 다른 사람을 기다리는 중`;
      else note = `누가 라이어일까요? 한 명 고르고 투표하기 · ${voted}/${aliveIds.length}`;
      items = players.map((p) => ({
        id: p.id, name: p.name, out: !alive[p.id],
        sub: !alive[p.id] ? "탈락" : votes[p.id] ? "투표함" : "",
        selected: on.selected === p.id, disabled: !canPick || !alive[p.id] || p.id === me,
      }));
      if (canPick) actions.push(["투표하기", "primary", () => {
        const t = on.selected; if (!t) return say("한 명 골라 주세요");
        on.selected = null;
        on.store.update(on.code, { ["round/votes/" + me]: t }).catch((e) => say("투표가 안 됐어요: " + e.message, true));
      }, !on.selected]);
    } else { // result
      const last = r.last || {}, count = last.count || {};
      if (last.out) note = `${pname(room, last.out)} 은(는) ${last.role === "liar" ? "라이어였어요!" : "시민이었어요"}` + (r.winner ? "" : ` · 라이어 ${liarsLeft}명 남음`);
      else note = "동점이라 아무도 안 나갔어요. 다시 투표해요";
      if (!host) note += " · 방장을 기다리는 중";
      items = players.map((p) => ({ id: p.id, name: p.name, out: !alive[p.id], sub: count[p.id] ? `${count[p.id]}표` : !alive[p.id] ? "탈락" : "", disabled: true }));
      if (host) actions.push(r.winner ? ["최종 결과 보기", "primary", () => on.store.update(on.code, { phase: "end" }).catch(() => {})] : ["다시 토론", "primary", () => reDiscuss(r)]);
    }
    $("onPlayNote").textContent = note; $("onPlayNote").hidden = !note;
    $("onGrid").innerHTML = gridHTML(items);
    actions.push(["나가기", "", () => leaveRoom()]);
    renderActions($("onPlayActions"), actions);
  }
  $("onGrid").onclick = (ev) => {
    const b = ev.target.closest("[data-id]"); if (!b || b.disabled || !on.room || on.room.phase !== "vote") return;
    on.selected = on.selected === b.dataset.id ? null : b.dataset.id;
    renderPlay(on.room, playersOf(on.room));
  };
  $("onWordToggle").onclick = () => { on.hideWord = !on.hideWord; if (on.room) renderPlay(on.room, playersOf(on.room)); };

  function renderOnlineEnd(room, players) {
    const r = room.round || {}, roles = r.roles || {}, alive = r.alive || {}, words = r.words || {};
    $("onWinnerText").textContent = winText(r.winner);
    $("onEndCitKo").textContent = words.citizen ? words.citizen.ko : ""; $("onEndCitEn").textContent = words.citizen ? words.citizen.en : "";
    $("onEndLiarKo").textContent = words.liar ? words.liar.ko : ""; $("onEndLiarEn").textContent = words.liar ? words.liar.en : "";
    const ids = [...players.map((p) => p.id).filter((id) => roles[id]), ...Object.keys(roles).filter((id) => !room.players[id])];
    $("onRoles").innerHTML = ids.map((id) =>
      `<li><span class="grow">${esc(pname(room, id))}${alive[id] ? "" : ' <span class="psub">탈락</span>'}</span><span class="${roleClass(roles[id])}">${roleText(roles[id])}</span></li>`).join("");
    const host = room.hostId === on.pid;
    renderActions($("onEndActions"), host
      ? [["다시 하기", "primary", () => newRound(room)], ["대기실로", "", () => on.store.update(on.code, { phase: "lobby", round: null }).catch(() => {})], ["방 닫기", "danger", closeRoom]]
      : [["나가기", "", () => leaveRoom()]]);
  }

  async function leaveRoom(then) {
    const room = on.room, code = on.code;
    if (!room) { detach(); show(then || "on-entry"); return; }
    if (!confirm("방에서 나갈까요?")) return false;
    const others = playersOf(room).filter((p) => p.id !== on.pid);
    const patch = { ["players/" + on.pid]: null };
    if (room.round) { patch["round/alive/" + on.pid] = null; patch["round/votes/" + on.pid] = null; }
    if (room.hostId === on.pid && others.length) patch.hostId = others[0].id;
    detach(); show(then || "on-entry");
    try { if (others.length) await on.store.update(code, patch); else await on.store.remove(code); } catch {}
    return true;
  }
  async function closeRoom() {
    if (!confirm("방을 닫을까요? 모두 나가게 돼요.")) return;
    const code = on.code;
    detach(); show("on-entry");
    try { await on.store.remove(code); } catch {}
  }

  $("goOnline").onclick = () => enterOnline();
  $("onCreate").onclick = createRoom;
  $("onJoinForm").onsubmit = (ev) => { ev.preventDefault(); joinRoom($("onCode").value); };
  $("onLeave").onclick = () => leaveRoom();
  $("onStart").onclick = () => { if (on.room) newRound(on.room); };
  $("onRevealLiar").onchange = () => { if (on.code) on.store.update(on.code, { "settings/revealLiar": $("onRevealLiar").checked }).catch(() => {}); };
  $("onShare").onclick = async () => {
    const url = roomUrl(on.code);
    if (navigator.share) { try { await navigator.share({ title: "라이어 게임", text: `방 코드 ${on.code}`, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); say("링크를 복사했어요"); } catch { say(url, true); }
  };
  $("onCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(on.code); say("코드를 복사했어요"); } catch { say("코드: " + on.code, true); }
  };

  // ---------- 스테퍼 (한 폰 설정 + 방장 설정) ----------
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-step]"); if (!b) return;
    const d = Number(b.dataset.d);
    if (b.dataset.step === "players") { pp.players += d; renderSetup(); }
    else if (b.dataset.step === "liars") { pp.liars += d; renderSetup(); }
    else if (b.dataset.step === "onLiars" && on.room) {
      const n = Math.max(MIN, playersOf(on.room).length);
      const cur = (on.room.settings && on.room.settings.liars) || 1;
      const next = Math.min(maxLiars(n), Math.max(1, cur + d));
      if (next !== cur) on.store.update(on.code, { "settings/liars": next }).catch(() => {});
    }
  });

  // ---------- 뒤로가기 ----------
  $("back").addEventListener("click", async (ev) => {
    if (current === "home") return; // 허브로 그냥 이동
    ev.preventDefault();
    if (on.code) { if (await leaveRoom("home") === false) return; return; }
    const mid = game && !["pp-setup", "pp-end"].includes(current);
    if (mid && !confirm("게임을 그만둘까요?")) return;
    game = null; timerStop();
    show("home");
  });

  // ---------- 시작 ----------
  $("onlineBadge").hidden = onlineReady();
  const urlRoom = params.get("room");
  if (urlRoom) enterOnline(urlRoom.toUpperCase());
  else if (onlineReady() && idStore.getItem("su:liar:room")) enterOnline();
  else show("home");
})();
