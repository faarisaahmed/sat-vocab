const ALL = [...window.VOCAB].sort((a, b) => a.word.localeCompare(b.word));
let order = [...ALL];
let deck = order;
let i = 0;

const $ = (id) => document.getElementById(id);
const card = $("card");

function chips(el, words) {
  el.innerHTML = "";
  (words.length ? words : ["—"]).forEach((w) => {
    const s = document.createElement("span");
    s.textContent = w;
    el.appendChild(s);
  });
}

function render() {
  const has = deck.length > 0;
  card.hidden = !has;
  $("empty").hidden = has;
  if (!has) {
    $("counter").textContent = "0 / 0";
    $("bar").style.width = "0";
    return;
  }
  const c = deck[i];
  card.classList.remove("flipped");
  $("f-word").textContent = c.word;
  $("f-pos").textContent = c.pos;
  $("f-pron").textContent = c.pron;
  $("b-word").textContent = c.word;
  $("b-pos").textContent = c.pos;
  $("b-def").textContent = c.def;
  $("b-ex").textContent = `“${c.ex}”`;
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

function filter() {
  const q = $("search").value.trim().toLowerCase();
  deck = q ? order.filter((c) => c.word.toLowerCase().includes(q)) : order;
  i = 0;
  render();
}

card.addEventListener("click", () => card.classList.toggle("flipped"));
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
$("search").addEventListener("input", filter);
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
  if (e.target.tagName === "INPUT" || $("cards-view").hidden) return;
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
  ALL.filter((c) => !q || c.word.toLowerCase().includes(q) || c.def.toLowerCase().includes(q))
    .forEach((c) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-head"><strong></strong><span class="pos"></span><span class="pron"></span></div>
        <p class="def-line"></p><p class="ex"></p>`;
      row.querySelector("strong").textContent = c.word;
      row.querySelector(".pos").textContent = c.pos;
      row.querySelector(".pron").textContent = c.pron;
      row.querySelector(".def-line").textContent = c.def;
      row.querySelector(".ex").textContent = `“${c.ex}”`;
      list.appendChild(row);
    });
}
$("list-search").addEventListener("input", renderList);

function setMode(mode) {
  const cards = mode === "cards";
  $("cards-view").hidden = !cards;
  $("list-view").hidden = cards;
  $("mode-cards").classList.toggle("active", cards);
  $("mode-list").classList.toggle("active", !cards);
  if (!cards) renderList();
}
$("mode-cards").addEventListener("click", () => setMode("cards"));
$("mode-list").addEventListener("click", () => setMode("list"));

render();
