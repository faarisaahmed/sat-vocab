// My collection: each person's physical cards, split into an "in training"
// pile and a "def know" pile. You pick up cards (typed in, or dealt at
// random), train on one color at a time, and move cards to "def know" as
// you learn their words. Words nobody knows go on the shared don't-know list.

// collection = { people: [{ name, cards: [k], known: [n] }], active, focus }
// cards are physical card numbers (1–100); known holds word numbers (1–200).
const cardOf = (n) => (n > 100 ? n - 100 : n);
let collection = store.get("collection", null) || initialCollection();
const saveCollection = () => store.set("collection", collection);

// First run: carry over an old Train session if there is one.
function initialCollection() {
  const old = store.get("session", null);
  if (old && old.players) {
    return {
      people: old.players.map((p) => ({
        name: p.name,
        cards: [...p.cards],
        known: Object.keys(old.status).map(Number)
          .filter((n) => old.status[n] === "known" && p.cards.includes(cardOf(n))),
      })),
      active: 0,
      focus: old.filter || "red",
    };
  }
  const names = store.get("names", ["Me", "Friend"]);
  return { people: names.map((name) => ({ name, cards: [], known: [] })), active: 0, focus: "red" };
}

const person = () => collection.people[collection.active];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function save() {
  saveCollection();
  saveUnknown();
  renderCollection();
}

// ---------- which words / cards are where ----------

// The word numbers on card k that the current focus is working on.
function focusWords(k) {
  const out = [];
  if (collection.focus !== "grey") out.push(k);
  if (collection.focus !== "red") out.push(k + 100);
  return out.filter((n) => BY_N.has(n));
}

// A card is in the "def know" pile once every focused word on it is known.
const cardKnown = (p, k) => focusWords(k).every((n) => p.known.includes(n));

function trainingWords(p = person()) {
  return p ? p.cards.flatMap((k) => focusWords(k)).filter((n) => !p.known.includes(n)) : [];
}
window.trainingSet = () => new Set(trainingWords());

function ownerOf(k) {
  return collection.people.find((p) => p.cards.includes(k));
}

// ---------- adding cards ----------

function addCards(cards) {
  const p = person();
  p.cards = [...new Set([...p.cards, ...cards])].sort((a, b) => a - b);
}

function addTyped() {
  const p = person();
  const raw = $("c-nums").value.match(/\d+/g) || [];
  const added = [], bad = [], mine = [], taken = [];
  for (const s of raw) {
    const n = Number(s);
    if (n < 1 || n > 200) { bad.push(s); continue; }
    const k = cardOf(n);
    const owner = ownerOf(k);
    if (added.includes(k)) continue;
    if (owner === p) mine.push(k);
    else if (owner) taken.push(`#${k} (${owner.name})`);
    else added.push(k);
  }
  addCards(added);
  const msg = [];
  if (added.length) msg.push(`Added ${added.map((k) => "#" + k).join(", ")}.`);
  if (mine.length) msg.push(`Already yours: ${[...new Set(mine)].map((k) => "#" + k).join(", ")}.`);
  if (taken.length) msg.push(`Someone else has ${taken.join(", ")}.`);
  if (bad.length) msg.push(`Not a card number: ${bad.join(", ")}.`);
  if (!raw.length) msg.push("Type the numbers on your cards, like 67 41 12.");
  $("c-msg").textContent = msg.join(" ");
  if (added.length) $("c-nums").value = "";
  save();
}

function addRandom() {
  const want = Math.max(1, Math.floor(Number($("c-rand-n").value) || 0));
  const free = [];
  for (let k = 1; k <= 100; k++) if (!ownerOf(k)) free.push(k);
  for (let j = free.length - 1; j > 0; j--) {
    const r = Math.floor(Math.random() * (j + 1));
    [free[j], free[r]] = [free[r], free[j]];
  }
  const picked = free.slice(0, want).sort((a, b) => a - b);
  addCards(picked);
  $("c-msg").textContent = !picked.length
    ? "Every card is already in someone's collection."
    : `Go grab ${picked.map((k) => "#" + k).join(", ")}.` +
      (picked.length < want ? ` (Only ${picked.length} cards were left.)` : "");
  save();
}

function removeCard(k) {
  const p = person();
  if (!confirm(`Take card #${k} out of ${p.name}'s collection?`)) return;
  p.cards = p.cards.filter((c) => c !== k);
  p.known = p.known.filter((n) => cardOf(n) !== k);
  save();
}

// ---------- marking words ----------

function setKnown(p, n, yes) {
  p.known = p.known.filter((x) => x !== n);
  if (yes) {
    p.known.push(n);
    unknown.delete(n);
  }
  save();
}

function toggleUnknown(n) {
  if (unknown.has(n)) unknown.delete(n);
  else unknown.add(n);
  save();
}

// ---------- rows ----------

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

// buttons: [[label, className, onClick], ...]
function wordRow(n, buttons) {
  const row = el("div", "t-row");
  const btn = wordButton(n);
  const def = defBlock(n);
  btn.title = "Show definition";
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

function cardChips(p, cards, cls) {
  const box = el("div", `cchips ${cls}`);
  if (!cards.length) box.appendChild(el("span", "muted small", "No cards"));
  cards.forEach((k) => {
    const chip = el("button", "cchip", `#${k}`);
    const red = BY_N.get(k), grey = BY_N.get(k + 100);
    chip.title = [red && `red: ${red.word}`, grey && `grey: ${grey.word}`]
      .filter(Boolean).join(" · ") + " (tap to remove from collection)";
    chip.addEventListener("click", () => removeCard(k));
    box.appendChild(chip);
  });
  return box;
}

// ---------- render ----------

function renderPeople() {
  const box = $("c-people");
  box.innerHTML = "";
  collection.people.forEach((p, idx) => {
    const b = el("button", idx === collection.active ? "active" : "", p.name);
    b.addEventListener("click", () => {
      collection.active = idx;
      $("c-msg").textContent = "";
      save();
    });
    box.appendChild(b);
  });
  const add = el("button", "", "+ Person");
  add.addEventListener("click", () => {
    const name = (prompt("Name?") || "").trim();
    if (!name) return;
    collection.people.push({ name, cards: [], known: [] });
    collection.active = collection.people.length - 1;
    save();
  });
  box.appendChild(add);
  $("c-focus").querySelectorAll("button").forEach((b) =>
    b.classList.toggle("active", b.dataset.f === collection.focus)
  );
}

function renderPiles() {
  const p = person();
  $("c-name").textContent = p.name;
  $("c-remove-person").disabled = collection.people.length < 2;

  const known = p.cards.filter((k) => cardKnown(p, k));
  const training = p.cards.filter((k) => !cardKnown(p, k));
  const color = { red: "red", grey: "grey", both: "red + grey" }[collection.focus];

  // In training
  $("tr-count").textContent = training.length;
  const tr = $("tr-body");
  tr.innerHTML = "";
  tr.appendChild(cardChips(p, training, "training"));
  const words = trainingWords(p);
  $("tr-study").disabled = !words.length;
  if (!p.cards.length) {
    tr.appendChild(el("p", "muted small", "No cards yet. Add some above."));
  } else if (!words.length) {
    tr.appendChild(el("p", "done", `You know every ${color} word in your collection! Add more cards or switch color.`));
  }
  words.forEach((n) => {
    const on = unknown.has(n);
    tr.appendChild(wordRow(n, [
      ["Def know", "good", () => setKnown(p, n, true)],
      [on ? "On don't-know list ✓" : "Don't know", on ? "bad on" : "bad", () => toggleUnknown(n)],
    ]));
  });

  // Def know
  $("dk-count").textContent = known.length;
  const dk = $("dk-body");
  dk.innerHTML = "";
  dk.appendChild(cardChips(p, known, "known"));
  const knownWords = p.cards.flatMap((k) => focusWords(k)).filter((n) => p.known.includes(n));
  if (!knownWords.length) dk.appendChild(el("p", "muted small", `${color[0].toUpperCase() + color.slice(1)} words you def know show up here.`));
  knownWords.forEach((n) =>
    dk.appendChild(wordRow(n, [["Back to training", "", () => setKnown(p, n, false)]]))
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
    // "Got it now" takes it off the list, and moves it to "def know" for
    // whoever has that card.
    const owner = ownerOf(cardOf(n));
    const tag = owner ? ` · ${owner.name}'s card` : "";
    const row = wordRow(n, [["Got it now", "good", () => {
      if (owner) setKnown(owner, n, true);
      else { unknown.delete(n); save(); }
    }]]);
    row.querySelector(".t-num").textContent += tag;
    list.appendChild(row);
  });
}

function renderCollection() {
  if (collection.active >= collection.people.length) collection.active = 0;
  renderPeople();
  renderPiles();
  renderUnknown();
}
window.renderCollection = renderCollection;

// ---------- events ----------

$("c-add-btn").addEventListener("click", addTyped);
$("c-nums").addEventListener("keydown", (e) => { if (e.key === "Enter") addTyped(); });
$("c-rand").addEventListener("click", addRandom);
$("c-focus").querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    collection.focus = b.dataset.f;
    save();
  })
);
$("c-rename").addEventListener("click", () => {
  const name = (prompt("New name?", person().name) || "").trim();
  if (!name) return;
  person().name = name;
  save();
});
$("c-remove-person").addEventListener("click", () => {
  const p = person();
  if (!confirm(`Remove ${p.name} and their whole collection? The don't-know list is kept.`)) return;
  collection.people.splice(collection.active, 1);
  collection.active = 0;
  save();
});
$("tr-study").addEventListener("click", () => studySource("training"));
$("unk-study").addEventListener("click", () => studySource("unknown"));
$("unk-clear").addEventListener("click", () => {
  if (!confirm("Clear the whole don't-know list?")) return;
  unknown.clear();
  save();
});

saveCollection();
setMode(store.get("mode", "cards"));
