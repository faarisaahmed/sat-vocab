// Train mode: an assistant for studying the physical deck with friends.
// Each player is dealt N physical cards (= N red + N grey words). Players
// work through one color at a time; words they know go to the "know for
// sure" pile, words nobody knows go to the shared don't-know list.

// session = { players: [{ name, cards: [k, ...] }], filter, status: { n: "known" | "unknown" } }
// A word with no status is still in its player's stack.
let session = store.get("session", null);
const saveSession = () => store.set("session", session);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- setup ----------

function renderNameInputs() {
  const saved = store.get("names", []);
  const box = $("t-names");
  const current = [...box.querySelectorAll("input")].map((x) => x.value);
  box.innerHTML = "";
  for (let p = 0; p < Number($("t-count").value); p++) {
    const label = el("label", null, `Player ${p + 1}`);
    const input = el("input");
    input.type = "text";
    input.value = current[p] ?? saved[p] ?? `Player ${p + 1}`;
    input.addEventListener("input", updatePreview);
    label.appendChild(input);
    box.appendChild(label);
  }
  updatePreview();
}

function readSetup() {
  const count = Number($("t-count").value);
  const per = Math.max(1, Math.floor(Number($("t-per").value) || 0));
  const start = Math.max(1, Math.floor(Number($("t-start").value) || 1));
  const names = [...$("t-names").querySelectorAll("input")].map(
    (x, p) => x.value.trim() || `Player ${p + 1}`
  );
  return { count, per, start, names, random: $("t-random").checked };
}

function setupError({ count, per, start, random }) {
  const total = count * per;
  if (total > 100) return `That's ${total} cards, but the deck only has 100.`;
  if (!random && start + total - 1 > 100) {
    return `Starting at card #${start} only leaves ${101 - start} cards. Lower the start or cards each.`;
  }
  return "";
}

function updatePreview() {
  const s = readSetup();
  const err = setupError(s);
  $("t-go").disabled = !!err;
  const words = s.per * 2;
  if (err) {
    $("t-preview").textContent = err;
  } else if (s.random) {
    $("t-preview").textContent =
      `Each person gets ${s.per} random cards (${words} words: ${s.per} red + ${s.per} grey).`;
  } else {
    $("t-preview").textContent = s.names
      .map((name, p) => {
        const a = s.start + p * s.per;
        return `${name}: cards #${a}–${a + s.per - 1}`;
      })
      .join(" · ") + `. That's ${words} words each.`;
  }
}

function startSession() {
  const s = readSetup();
  if (setupError(s)) return;
  let pool;
  if (s.random) {
    pool = Array.from({ length: 100 }, (_, k) => k + 1);
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
  } else {
    pool = Array.from({ length: s.count * s.per }, (_, k) => s.start + k);
  }
  session = {
    players: s.names.map((name, p) => ({
      name,
      cards: pool.slice(p * s.per, (p + 1) * s.per).sort((a, b) => a - b),
    })),
    filter: "red",
    status: {},
  };
  store.set("names", s.names);
  if (!s.random) {
    const next = s.start + s.count * s.per;
    store.set("nextStart", next > 100 ? 1 : next);
  }
  saveSession();
  renderTrain();
}

// ---------- session ----------

// Words belonging to a player, in deck order, limited to the color filter.
function wordsFor(player) {
  const out = [];
  for (const k of player.cards) {
    if (session.filter !== "grey") out.push(k);
    if (session.filter !== "red") out.push(k + 100);
  }
  return out.filter((n) => BY_N.has(n));
}

function setStatus(n, status) {
  if (status) session.status[n] = status;
  else delete session.status[n];
  if (status === "unknown") unknown.add(n);
  else unknown.delete(n);
  saveSession();
  saveUnknown();
  renderTrain();
}

function wordButton(n) {
  const c = BY_N.get(n);
  const b = el("button", "t-word");
  b.dataset.color = colorOf(n);
  b.appendChild(el("span", "dot"));
  b.appendChild(el("strong", null, c.word));
  b.appendChild(el("span", "t-num", numLabel(c, false)));
  return b;
}

function defBlock(n) {
  const c = BY_N.get(n);
  const d = el("div", "t-def");
  d.hidden = true;
  d.appendChild(el("p", "pos-line", `${c.pos} · ${c.pron}`));
  d.appendChild(el("p", null, c.def));
  d.appendChild(el("p", "ex", `“${c.ex}”`));
  return d;
}

function stackRow(n) {
  const row = el("div", "t-row");
  const btn = wordButton(n);
  const def = defBlock(n);
  btn.title = "Show definition";
  btn.addEventListener("click", () => (def.hidden = !def.hidden));
  const actions = el("div", "t-actions");
  const know = el("button", "btn small good", "Know it");
  know.addEventListener("click", () => setStatus(n, "known"));
  const dont = el("button", "btn small bad", "Don't know");
  dont.addEventListener("click", () => setStatus(n, "unknown"));
  actions.append(know, dont);
  row.append(btn, actions, def);
  return row;
}

function pileRow(n, buttons) {
  const row = el("div", "t-row");
  const btn = wordButton(n);
  const def = defBlock(n);
  btn.addEventListener("click", () => (def.hidden = !def.hidden));
  const actions = el("div", "t-actions");
  buttons.forEach(([label, cls, fn]) => {
    const b = el("button", `btn small ${cls}`, label);
    b.addEventListener("click", fn);
    actions.appendChild(b);
  });
  row.append(btn, actions, def);
  return row;
}

// Where physical card k should be right now, judged by the word(s) the
// current color filter is working on. With "both", a card stays in the
// stack until both of its words are marked.
function cardPlace(k) {
  const red = BY_N.has(k) ? session.status[k] : "known";
  const grey = BY_N.has(k + 100) ? session.status[k + 100] : "known";
  const halves = session.filter === "red" ? [red]
    : session.filter === "grey" ? [grey] : [red, grey];
  if (halves.some((s) => !s)) return "stack";
  return halves.includes("unknown") ? "unknown" : "known";
}

function cardPiles(player) {
  const piles = { stack: [], known: [], unknown: [] };
  player.cards.forEach((k) => piles[cardPlace(k)].push(k));
  const box = el("div", "cardpiles");
  [
    ["stack", "In stack"],
    ["known", "Discarded"],
    ["unknown", "Don't-know pile"],
  ].forEach(([key, label]) => {
    const line = el("div", `cardpile ${key}`);
    line.appendChild(el("span", "label", `${label} (${piles[key].length})`));
    const chips = el("div", "cchips");
    if (!piles[key].length) chips.appendChild(el("span", "muted small", "none"));
    piles[key].forEach((k) => {
      const chip = el("span", "cchip", `#${k}`);
      const red = BY_N.get(k), grey = BY_N.get(k + 100);
      chip.title = [red && `red: ${red.word}`, grey && `grey: ${grey.word}`].filter(Boolean).join(" · ");
      chips.appendChild(chip);
    });
    line.appendChild(chips);
    box.appendChild(line);
  });
  return box;
}

function renderPlayers() {
  const box = $("players");
  box.innerHTML = "";
  for (const player of session.players) {
    const words = wordsFor(player);
    const stack = words.filter((n) => !session.status[n]);
    const known = words.filter((n) => session.status[n] === "known").length;
    const dont = words.filter((n) => session.status[n] === "unknown").length;

    const col = el("div", "player");
    const head = el("div", "player-head");
    head.appendChild(el("h3", null, player.name));
    head.appendChild(el("span", "muted", `${stack.length} left · ${known} known · ${dont} don't know`));
    col.appendChild(head);

    const bar = el("div", "progress");
    const fill = el("div");
    fill.style.width = words.length ? `${((words.length - stack.length) / words.length) * 100}%` : "0";
    bar.appendChild(fill);
    col.appendChild(bar);

    col.appendChild(cardPiles(player));

    if (!stack.length) {
      const done = el("p", "done");
      done.textContent = session.filter === "red"
        ? "Red words done! Switch to Grey when you're ready."
        : session.filter === "grey" ? "Grey words done!" : "Stack cleared!";
      col.appendChild(done);
    }
    stack.forEach((n) => col.appendChild(stackRow(n)));
    box.appendChild(col);
  }
}

function renderKnown() {
  const list = $("known-list");
  list.innerHTML = "";
  const known = Object.keys(session.status)
    .map(Number)
    .filter((n) => session.status[n] === "known")
    .sort((a, b) => a - b);
  $("known-count").textContent = known.length;
  if (!known.length) list.appendChild(el("p", "muted small", "Words you know for sure will show up here."));
  known.forEach((n) =>
    list.appendChild(pileRow(n, [["Undo", "", () => setStatus(n, null)]]))
  );
}

function renderUnknown() {
  const list = $("unk-list");
  list.innerHTML = "";
  const words = [...unknown].sort((a, b) => a - b);
  $("unk-count").textContent = words.length;
  $("unk-study").disabled = !words.length;
  $("unk-clear").disabled = !words.length;
  if (!words.length) list.appendChild(el("p", "muted small", "Words nobody knows will show up here."));
  words.forEach((n) => {
    // "Got it" means you've learned it since: it leaves the list, and if the
    // word is in the current session it counts as known.
    const inSession = session && session.players.some((p) => p.cards.includes(n > 100 ? n - 100 : n));
    list.appendChild(pileRow(n, [
      ["Got it now", "good", () => {
        if (inSession) setStatus(n, "known");
        else { unknown.delete(n); saveUnknown(); renderTrain(); }
      }],
    ]));
  });
}

function renderTrain() {
  const active = !!session;
  $("setup").hidden = active;
  $("session").hidden = !active;
  if (!active) {
    $("t-start").value = store.get("nextStart", 1);
    renderNameInputs();
  } else {
    $("t-filter").querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.f === session.filter)
    );
    renderPlayers();
    renderKnown();
  }
  renderUnknown();
}
window.renderTrain = renderTrain;

$("t-count").addEventListener("change", renderNameInputs);
["t-per", "t-start"].forEach((id) => $(id).addEventListener("input", updatePreview));
$("t-random").addEventListener("change", () => {
  $("t-start").disabled = $("t-random").checked;
  updatePreview();
});
$("t-go").addEventListener("click", startSession);
$("t-filter").querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    session.filter = b.dataset.f;
    saveSession();
    renderTrain();
  })
);
$("t-end").addEventListener("click", () => {
  if (!confirm("End this session and set up a new one? Your don't-know list is kept.")) return;
  session = null;
  saveSession();
  renderTrain();
});
$("unk-study").addEventListener("click", studyUnknown);
$("unk-clear").addEventListener("click", () => {
  if (!confirm("Clear the whole don't-know list?")) return;
  unknown.clear();
  if (session) {
    for (const n of Object.keys(session.status)) {
      if (session.status[n] === "unknown") delete session.status[n];
    }
    saveSession();
  }
  saveUnknown();
  renderTrain();
});

setMode(store.get("mode", "cards"));
