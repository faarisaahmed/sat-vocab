const ALL = [...window.VOCAB].sort((a, b) => a.n - b.n);
const BY_N = new Map(ALL.map((c) => [c.n, c]));
let order = [...ALL];
let deck = order;
let i = 0;

const $ = (id) => document.getElementById(id);
const card = $("card");

// On the physical cards, Vocab 1–100 has the red tab and 101–200 the grey
// tab. Physical card k holds red word k and grey word k + 100.
const colorOf = (n) => (n <= 100 ? "red" : "grey");

// localStorage can be missing or throw (private mode etc.), so every
// access is guarded and the app still works without it.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("satvocab." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("satvocab." + key, JSON.stringify(value));
    } catch {}
  },
};

// Shared "don't know" list, kept across sessions.
const unknown = new Set(store.get("unknown", []));
const saveUnknown = () => store.set("unknown", [...unknown].sort((a, b) => a - b));

function chips(el, words) {
  el.innerHTML = "";
  (words.length ? words : ["—"]).forEach((w) => {
    const s = document.createElement("span");
    s.textContent = w;
    el.appendChild(s);
  });
}

function extra(id, text) {
  const el = $(id);
  el.hidden = !text;
  el.lastElementChild.textContent = text || "";
}

function numLabel(c, long) {
  const base = long ? `Card #${c.n}` : `#${c.n}`;
  if (!c.guess) return base;
  return base + (long ? " (guessed word)" : " (guess)");
}

// "47" or "#47" matches card 47; anything else matches the word.
function matches(c, q) {
  const num = q.replace(/^#/, "");
  if (/^\d+$/.test(num)) return String(c.n) === num;
  return c.word.toLowerCase().includes(q);
}

function render() {
  const has = deck.length > 0;
  card.hidden = !has;
  $("empty").hidden = has;
  if (!has) {
    $("empty").textContent = {
      unknown: "Your don't-know list is empty.",
      training: "Your training pile is empty.",
    }[$("source").value] || "No words match that search.";
    $("counter").textContent = "0 / 0";
    $("bar").style.width = "0";
    return;
  }
  const c = deck[i];
  card.classList.remove("flipped");
  card.dataset.color = colorOf(c.n);
  $("f-word").textContent = c.word;
  $("f-pos").textContent = c.pos;
  $("f-pron").textContent = c.pron;
  $("b-word").textContent = c.word;
  $("b-pos").textContent = c.pos;
  $("b-def").textContent = c.def;
  $("b-ex").textContent = `“${c.ex}”`;
  $("f-num").textContent = numLabel(c, true);
  $("b-num").textContent = numLabel(c, false);
  extra("b-root", c.root);
  extra("b-note", c.note);
  chips($("b-syn"), c.syn);
  chips($("b-ant"), c.ant);
  $("counter").textContent = `${i + 1} / ${deck.length}`;
  $("bar").style.width = `${((i + 1) / deck.length) * 100}%`;
}

function go(step) {
  if (!deck.length) return;
  i = (i + step + deck.length) % deck.length;
  render();
}

function inSource(c) {
  const src = $("source").value;
  if (src === "red" || src === "grey") return colorOf(c.n) === src;
  if (src === "unknown") return unknown.has(c.n);
  if (src === "training") return window.trainingSet().has(c.n);
  return true;
}

function filter() {
  const q = $("search").value.trim().toLowerCase();
  deck = order.filter((c) => inSource(c) && (!q || matches(c, q)));
  i = 0;
  render();
}

card.addEventListener("click", () => card.classList.toggle("flipped"));
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
$("search").addEventListener("input", filter);
$("source").addEventListener("change", filter);
$("shuffle").addEventListener("click", () => {
  order = [...ALL];
  for (let j = order.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [order[j], order[k]] = [order[k], order[j]];
  }
  filter();
});
$("reset").addEventListener("click", () => {
  order = [...ALL];
  filter();
});

document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT"].includes(e.target.tagName) || $("cards-view").hidden) return;
  if (e.key === "ArrowRight") go(1);
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    card.classList.toggle("flipped");
  }
});

// All-words list view
function renderList() {
  const q = $("list-search").value.trim().toLowerCase();
  const list = $("list");
  list.innerHTML = "";
  ALL.filter((c) => !q || matches(c, q) || c.def.toLowerCase().includes(q))
    .forEach((c) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-head"><span class="num inline"></span><strong></strong><span class="pos"></span><span class="pron"></span></div>
        <p class="def-line"></p><p class="ex"></p>`;
      const num = row.querySelector(".num");
      num.textContent = numLabel(c, false);
      num.dataset.color = colorOf(c.n);
      row.querySelector("strong").textContent = c.word;
      row.querySelector(".pos").textContent = c.pos;
      row.querySelector(".pron").textContent = c.pron;
      row.querySelector(".def-line").textContent = c.def;
      row.querySelector(".ex").textContent = `“${c.ex}”`;
      list.appendChild(row);
    });
}
$("list-search").addEventListener("input", renderList);

const MODES = ["cards", "collection", "list"];
function setMode(mode) {
  if (!MODES.includes(mode)) mode = "cards";
  MODES.forEach((m) => {
    $(`${m}-view`).hidden = m !== mode;
    $(`mode-${m}`).classList.toggle("active", m === mode);
  });
  if (mode === "list") renderList();
  if (mode === "cards") filter();
  if (mode === "collection") window.renderCollection();
  store.set("mode", mode);
}
MODES.forEach((m) => $(`mode-${m}`).addEventListener("click", () => setMode(m)));

// Open the card viewer on the don't-know list or the current person's
// training pile (used by My collection).
function studySource(src) {
  $("source").value = src;
  $("search").value = "";
  setMode("cards");
}

render();
