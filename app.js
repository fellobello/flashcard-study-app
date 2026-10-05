// Study Desk · app logic. Styles live in styles.css; cards live in cards.csv.
"use strict";
// optional countdown on the start screen, e.g. { label: "Exam", date: "2025-12-15" }
const COUNTDOWN = null;
let BUILTIN = [];   // parsed from window.BUILTIN_CSV (cards-builtin.js), a copy of cards.csv
const BASE_MODS = {
  M1: "Architecture & design", M2: "Service-oriented architecture", M3: "Multithreading basics",
  M4: "Synchronization & coordination", M5: "Events, async & performance", M6: "WSDL & RESTful services",
  M7: "Brokers, state, remoting & AJAX"
};
const PALETTE = ["var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)", "var(--m5)", "var(--m6)", "var(--m7)"];
const ICON = {
  cards: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="14" height="12" rx="2.5"/><path d="M7 4.5h11.5A2.5 2.5 0 0 1 21 7v9"/></svg>',
  quiz: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6.5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="17.5" r="2"/><path d="M11 6.5h9M11 12h9M11 17.5h6"/></svg>',
  match: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="6" rx="1.8"/><rect x="14" y="14" width="7" height="6" rx="1.8"/><path d="M10 7c4.5 0 4 10 4 10"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M13.5 3 5 14h6.5l-1 7L19 10h-6.5z"/></svg>'
};
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/></svg>';
const MODES = {
  cards: { name: "Flashcards", desc: "Flip each card, then grade yourself.", badge: "Warm-up", c: "var(--m1)" },
  quiz: { name: "Multiple choice", desc: "Pick the right term or definition.", badge: "Classic quiz", c: "var(--m6)" },
  match: { name: "Match", desc: "Pair terms with their definitions.", badge: "Pair them up", c: "var(--m4)" },
  speed: { name: "Speed round", desc: "True or false, before the clock runs out.", badge: "Quick recall", c: "var(--m3)" }
};
const DIFF = {
  easy:   { label: "Easy",   c: "var(--matcha)", mult: 1,   opts: 3, qTime: 30, lives: Infinity, pairs: 4, penalty: 0, par: 9, speedTime: 90, speedPen: 0, think: 0 },
  normal: { label: "Normal", c: "var(--sky)",    mult: 1.5, opts: 4, qTime: 20, lives: 3,        pairs: 6, penalty: 2, par: 7, speedTime: 60, speedPen: 3, think: 0 },
  hard:   { label: "Hard",   c: "var(--tomato)", mult: 2,   opts: 5, qTime: 12, lives: 2,        pairs: 8, penalty: 4, par: 5, speedTime: 45, speedPen: 5, think: 12 }
};
const LENS = [10, 20, 40, "all"];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const plain = s => s.replace(/`/g, "");
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function clock(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

// short form of a definition: first sentence(s), at least ~30 characters, ignoring "e.g." style abbreviations
function lead(d) {
  const re = /[.!?](?=\s|$)/g; let m, out = "";
  while ((m = re.exec(d))) {
    const tail = d.slice(Math.max(0, m.index - 4), m.index + 1).toLowerCase();
    if (/(e\.g\.|i\.e\.|vs\.|etc\.)$/.test(tail)) continue;
    out = d.slice(0, m.index + 1);
    if (out.length >= 30) return out;
  }
  return d;
}
// hide the term's own name inside a definition so the prompt doesn't give it away
function mask(text, c) {
  const core = c.t.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (core.length < 4 || /[\/]/.test(core)) return text;
  return text.replace(new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "____");
}

/* ---------- cards: embedded copy, replaced by cards.csv when the folder server is running ---------- */
let CARDS = [], MODS = {}, MODC = {}, CARD_SRC = "built-in";
function setCards(list) {
  CARDS = list.map((c, i) => ({ m: c.m, t: c.t, d: c.d, x: c.x || "", g: c.g || [], id: i, s: lead(c.d) }));
  MODS = {}; MODC = {};
  const labels = {};
  list.forEach(c => { if (c.ml) labels[c.m] = c.ml; });
  CARDS.forEach(c => {
    if (c.m in MODS) return;
    MODS[c.m] = labels[c.m] || BASE_MODS[c.m] || c.m;
    MODC[c.m] = /^M[1-7]$/.test(c.m) ? `var(--m${c.m.slice(1)})` : PALETTE[(Object.keys(MODS).length - 1) % PALETTE.length];
  });
}
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function csvToCards(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = name => head.indexOf(name);
  const ci = { cat: col("section") >= 0 ? col("section") : col("category"), tags: col("tags"), t: col("title"), d: col("info"), x: col("example") };
  if (ci.t < 0 || ci.d < 0) return [];
  const seen = new Set(), out = [];
  rows.slice(1).forEach(r => {
    const t = (r[ci.t] || "").trim(), d = (r[ci.d] || "").trim();
    if (!t || !d || seen.has(t)) return;
    seen.add(t);
    const cat = ci.cat >= 0 ? (r[ci.cat] || "").trim() : "";
    const mm = cat.match(/^([A-Za-z]*\d+)\s*[-–·:]\s*(.+)$/);
    const m = mm ? mm[1].toUpperCase() : (cat || "Other");
    const tags = ci.tags >= 0 ? (r[ci.tags] || "").split(/[;,|]/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    const g = tags.map(s => /acronym|abbrev/.test(s) ? "acronym" : /code|syntax/.test(s) ? "code" : s);
    out.push({ m, ml: mm ? mm[2].trim() : cat, t, d, x: ci.x >= 0 ? (r[ci.x] || "").trim() : "", g });
  });
  return out;
}

/* ---------- save data: progress.json through the folder server, with this browser as backup ---------- */
const LS = "study-desk";
function load(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
const isObj = o => o && typeof o === "object" && !Array.isArray(o);
function defaults() { return { v: 3, marks: {}, stars: {}, best: {}, tags: {}, tagList: [], games: 0, settings: { mode: "quiz", diff: "normal", sel: [], inc: [], exc: [], len: 20, show: "all", tab: "all", open: {} } }; }
function sanitize(o) {
  const d = defaults();
  if (!isObj(o)) return d;
  ["marks", "stars", "best", "tags"].forEach(k => { if (isObj(o[k])) d[k] = o[k]; });
  if (Array.isArray(o.tagList)) d.tagList = o.tagList.filter(x => typeof x === "string");
  if (typeof o.games === "number") d.games = o.games;
  if (isObj(o.settings)) Object.assign(d.settings, o.settings);
  if (o.savedAt) d.savedAt = o.savedAt;
  return d;
}
let D = defaults(), SAVE_MODE = "browser", saveStatus = "", saveTimer = null, saving = false, again = false;
let S = D.settings;
function persist() {
  D.savedAt = new Date().toISOString();
  store(LS, D);
  if (SAVE_MODE !== "file") { renderSaveState(); return; }
  saveStatus = "saving"; renderSaveState();
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400);
}
async function flush() {
  saveTimer = null;
  if (saving) { again = true; return; }
  saving = true;
  try {
    const r = await fetch("api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(D, null, 1) });
    saveStatus = r.ok ? "saved" : "error";
  } catch (e) { saveStatus = "error"; }
  saving = false; renderSaveState();
  if (again) { again = false; flush(); }
}
addEventListener("pagehide", () => {
  if (SAVE_MODE === "file" && saveTimer) { clearTimeout(saveTimer); try { navigator.sendBeacon("api/progress", new Blob([JSON.stringify(D, null, 1)], { type: "application/json" })); } catch (e) {} }
});
function renderSaveState() {
  const el = $("saveState"); if (!el) return;
  el.classList.toggle("err", saveStatus === "error");
  if (SAVE_MODE === "file") {
    const at = D.savedAt ? new Date(D.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    el.innerHTML = saveStatus === "error" ? "Couldn't write <b>progress.json</b>. Is the Terminal window from “Open Flashcards” still open? Your progress is still kept in this browser."
      : saveStatus === "saving" ? "Saving to <b>progress.json</b>…"
      : `Saved to <b>progress.json</b> in your flashcards folder${at ? " · " + at : ""}.`;
  } else {
    el.innerHTML = location.protocol === "file:"
      ? "Saved in this browser only. To save into the folder, open the app with <b>Open Flashcards.command</b>."
      : "Saved in this browser.";
  }
}

const mk = id => D.marks[CARDS[id].t];
function setMark(id, v) { D.marks[CARDS[id].t] = v; persist(); }
const starred = id => !!D.stars[CARDS[id].t];
function toggleStar(id) {
  const t = CARDS[id].t;
  if (D.stars[t]) delete D.stars[t]; else D.stars[t] = true;
  persist();
  document.querySelectorAll(`.star[data-id="${id}"]`).forEach(paintStar);
  if (!$("menu").hidden) { renderDecks(); renderStats(); }
  toast(starred(id) ? "Starred as difficult." : "Star removed.");
}
function starBtn(id, labeled, cls) { return `<button class="star${cls ? " " + cls : ""}" data-id="${id}" data-label="${labeled ? 1 : ""}" aria-pressed="${starred(id)}" aria-label="Star as difficult" title="Star as difficult (S)">${STAR}${labeled ? `<span>${starred(id) ? "Starred as difficult" : "Star as difficult"}</span>` : ""}</button>`; }
function paintStar(b) { const on = starred(+b.dataset.id); b.setAttribute("aria-pressed", on); const s = b.querySelector("span"); if (s) s.textContent = on ? "Starred as difficult" : "Star as difficult"; }
document.addEventListener("click", e => { const b = e.target.closest(".star"); if (b) { e.stopPropagation(); toggleStar(+b.dataset.id); } });

// tags: plain strings on each card. cards.csv supplies a card's starting tags; edits made in the app live in D.tags
const BUILTIN_TAG = { acronym: ["Acronyms & abbreviations", "var(--lilac)"], code: ["Code & syntax", "var(--sky)"] };
const TAGPAL = ["var(--m1)", "var(--m4)", "var(--m3)", "var(--m6)", "var(--m2)", "var(--m5)", "var(--m7)"];
const normTag = s => String(s).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
const tagsOf = c => D.tags[c.t] || c.g;
function allTags() {
  const set = new Set(D.tagList.map(normTag).filter(Boolean));
  CARDS.forEach(c => tagsOf(c).forEach(x => set.add(x)));
  return [...set].sort((a, b) => (BUILTIN_TAG[b] ? 1 : 0) - (BUILTIN_TAG[a] ? 1 : 0) || a.localeCompare(b));
}
function tagColor(x) { if (BUILTIN_TAG[x]) return BUILTIN_TAG[x][1]; let h = 0; for (const ch of x) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TAGPAL[h % TAGPAL.length]; }
const tagLabel = x => BUILTIN_TAG[x] ? BUILTIN_TAG[x][0] : "#" + x;
function setTags(c, arr, quiet) {
  const uniq = [...new Set(arr.map(normTag).filter(Boolean))];
  const same = uniq.length === c.g.length && uniq.every(x => c.g.includes(x));
  if (same) delete D.tags[c.t]; else D.tags[c.t] = uniq;
  if (!quiet) persist();
}
function deckIds(deck) {
  if (deck === "missed") return CARDS.filter(c => D.marks[c.t] === "m").map(c => c.id);
  if (deck === "got") return CARDS.filter(c => D.marks[c.t] === "k").map(c => c.id);
  if (deck === "unseen") return CARDS.filter(c => !D.marks[c.t]).map(c => c.id);
  if (deck === "starred") return CARDS.filter(c => D.stars[c.t]).map(c => c.id);
  if (deck.startsWith("tag:")) { const x = deck.slice(4); return CARDS.filter(c => tagsOf(c).includes(x)).map(c => c.id); }
  if (deck.startsWith("sec:")) { const m = deck.slice(4); return CARDS.filter(c => c.m === m).map(c => c.id); }
  if (deck === "all") return CARDS.map(c => c.id);
  return CARDS.filter(c => c.m === deck).map(c => c.id);
}
// deck narrowed by the "which cards" filter: everything, everything except got-it, or never-marked only
const SHOWS = { all: "All cards", notgot: "Skip cards I've got", unseen: "Unseen only" };
const showFilter = ids => S.show === "notgot" ? ids.filter(id => mk(id) !== "k") : S.show === "unseen" ? ids.filter(id => !mk(id)) : ids;
// + items are combined (a card matching any of them is in); a card matching any − item is out
// (cards in EVERY selected item) + (cards in ANY added item) − (cards in ANY subtracted item)
// nothing selected → start from the added items; nothing selected or added → start from every card
function selectedIds() {
  let ids;
  if (S.sel.length) {
    ids = deckIds(S.sel[0]);
    S.sel.slice(1).forEach(k => { const keep = new Set(deckIds(k)); ids = ids.filter(id => keep.has(id)); });
    if (S.inc.length) ids = [...new Set(ids.concat(S.inc.flatMap(deckIds)))];
  } else ids = S.inc.length ? [...new Set(S.inc.flatMap(deckIds))] : CARDS.map(c => c.id);
  if (S.exc.length) { const out = new Set(S.exc.flatMap(deckIds)); ids = ids.filter(id => !out.has(id)); }
  return ids.sort((a, b) => a - b);
}
const poolIds = () => showFilter(selectedIds());
// study-again and starred cards first, then unseen, then known, with some shuffle
function pickCards(n) {
  const pri = id => (mk(id) === "m" ? 1 : mk(id) === "k" ? 0 : .55) + (starred(id) ? .4 : 0);
  const ids = poolIds().map(id => ({ id, r: Math.random() * .9 + pri(id) })).sort((a, b) => b.r - a.r).map(o => o.id);
  return shuffle(n === "all" ? ids : ids.slice(0, n));
}
const STOP = new Set("the and for are but not you all can its was one our out has his how man new now old see two way who did get may use that this with from have they will your what when them than then into only also each which their there these those other more such some most over just like where after while because between about through".split(" "));
function toks(c) {
  if (!c._tok) c._tok = new Set((c.t + " " + c.d).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
  return c._tok;
}
function sim(a, b) { const A = toks(a), B = toks(b); let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / ((A.size + B.size - n) || 1); }
function distractors(c, k, diff) {
  let pool = (diff === "easy" ? CARDS : CARDS.filter(x => x.m === c.m)).filter(x => x.id !== c.id);
  if (pool.length < k) pool = CARDS.filter(x => x.id !== c.id);
  if (diff === "hard") pool = pool.map(x => ({ x, s: sim(c, x) + Math.random() * .02 })).sort((a, b) => b.s - a.s).slice(0, k + 3).map(o => o.x);
  return shuffle(pool.slice()).slice(0, k);
}

/* ---------- menu ---------- */
function blurb(mode, d) {
  const X = DIFF[d];
  if (mode === "cards") return { easy: "Term on the front. No timer.", normal: "Term or definition on the front, mixed. No timer.", hard: `Definition on the front, and ${X.think} s to think before the card flips itself.` }[d];
  if (mode === "quiz") return `${X.opts} choices${d === "easy" ? " from any module" : d === "normal" ? " from the same module" : " picked to look alike"} · ${X.qTime} s per question · ${isFinite(X.lives) ? X.lives + " lives" : "unlimited lives"} · ×${X.mult} points`;
  if (mode === "match") return `${X.pairs} pairs per board · ${X.penalty ? "+" + X.penalty + " s per wrong pair" : "no time penalty"} · ×${X.mult} points`;
  return `${X.speedTime} s on the clock · ${X.speedPen ? "−" + X.speedPen + " s per mistake" : "no penalty for mistakes"}${d === "hard" ? " · look-alike definitions" : ""} · ×${X.mult} points`;
}
function renderMenu() {
  $("modes").innerHTML = Object.entries(MODES).map(([k, M]) =>
    `<button class="mode" data-m="${k}" aria-pressed="${S.mode === k}" style="--c:${M.c}"><span class="tape tape--corner" style="--c:${M.c}"></span><span class="name">${M.name}</span><span class="ico">${ICON[k]}</span><span class="desc">${M.desc}</span><span class="badge">${M.badge}</span></button>`).join("");
  $("diffs").innerHTML = Object.entries(DIFF).map(([k, X]) => `<button data-d="${k}" aria-pressed="${S.diff === k}" style="--c:${X.c}">${X.label}</button>`).join("");
  $("blurb").textContent = blurb(S.mode, S.diff);
  $("sumDiff").textContent = "· " + DIFF[S.diff].label;
  $("sumLen").textContent = "· " + (S.len === "all" ? "whole deck" : S.len);
  $("lenBlock").hidden = S.mode === "speed";
  $("lens").innerHTML = LENS.map(n => `<button data-l="${n}" aria-pressed="${S.len === n}" style="--c:var(--butter)">${n === "all" ? "Whole deck" : n}</button>`).join("");
  renderDecks(); renderStats(); renderSaveState();
}
function pickItems() {
  return [
    ["Sections", [["all", "All sections", "var(--butter)", false]].concat(Object.keys(MODS).map(m => ["sec:" + m, m + " " + MODS[m], MODC[m], true]))],
    ["Tags", allTags().map(x => ["tag:" + x, tagLabel(x), tagColor(x), false])],
    ["Your piles", [["missed", "Study-again pile", "var(--sakura)", false], ["starred", "★ Starred as difficult", "var(--star)", false]]]
  ];
}
function itemLabel(k) { for (const [, items] of pickItems()) for (const it of items) if (it[0] === k) return it[1]; return k; }
const OPS = { sel: "Select", inc: "Add", exc: "Subtract" };
const opOf = k => S.sel.includes(k) ? "sel" : S.inc.includes(k) ? "inc" : S.exc.includes(k) ? "exc" : "";
function pickFormula() {
  const nm = k => `<b>${esc(itemLabel(k))}</b>`;
  let f = S.sel.length ? (S.sel.length > 1 ? "(" + S.sel.map(nm).join(" ∩ ") + ")" : nm(S.sel[0])) : "";
  if (S.inc.length) f += (f ? " + " : "") + S.inc.map(nm).join(" + ");
  if (!f) f = "Every card";
  if (S.exc.length) f += " − " + S.exc.map(nm).join(" − ");
  return f;
}
function renderDecks() {
  const had = document.activeElement && document.activeElement.closest && document.activeElement.closest("#decks [data-a]");
  const focusKey = had ? had.dataset.k + "|" + had.dataset.a : null;
  $("decks").innerHTML = pickItems().map(([name, items]) => {
    let active = 0;
    const chips = items.map(([k, label, c, sw]) => {
      const total = deckIds(k).length;
      if (!total && name === "Tags") return "";
      const op = opOf(k), n = showFilter(deckIds(k)).length;
      if (op) active++;
      return `<span class="pchip${op ? " " + op : ""}${!total ? " empty" : ""}" style="--c:${c}">` +
        `<button class="pm" data-k="${esc(k)}" data-a="exc" aria-pressed="${op === "exc"}" aria-label="Subtract ${esc(label)}" title="Subtract: take these cards out">−</button>` +
        `<button class="pl" data-k="${esc(k)}" data-a="sel" aria-pressed="${op === "sel"}" title="Select: keep only cards that are also in this">${op === "sel" ? '<span class="check" aria-hidden="true">✓</span>' : sw ? '<span class="sw"></span>' : ""}${esc(label)} <span class="n">${n}</span></button>` +
        `<button class="pm" data-k="${esc(k)}" data-a="inc" aria-pressed="${op === "inc"}" aria-label="Add ${esc(label)}" title="Add: put these cards in">+</button></span>`;
    }).join("");
    const key = "pg-" + name.toLowerCase().replace(/\W+/g, "-");
    return chips ? `<details class="fold pgroup" data-key="${key}"${S.open[key] === false ? "" : " open"}><summary><h4>${name}</h4><span class="n">${active ? active + " in use" : ""}</span></summary><div class="cluster" style="--gap:7px">${chips}</div></details>` : "";
  }).join("");
  if (focusKey) { const [k, a] = focusKey.split("|"); const el = [...$("decks").querySelectorAll(`[data-a="${a}"]`)].find(b => b.dataset.k === k); if (el) el.focus({ preventScroll: true }); }
  $("shows").innerHTML = Object.entries(SHOWS).map(([k, v]) => `<button data-s="${k}" aria-pressed="${S.show === k}" style="--c:var(--m5)">${v}</button>`).join("");
  const pool = poolIds().length, sel = selectedIds().length, any = S.sel.length || S.inc.length || S.exc.length;
  $("pickSummary").innerHTML = `${pickFormula()} → <b>${pool}</b> card${pool === 1 ? "" : "s"}${S.show !== "all" ? ` of ${sel}` : ""} to study.${any ? ' <button class="linkish" id="pickClear">Clear</button>' : ""}`;
  $("poolNote").textContent = S.show === "notgot" ? "Leaves out cards you've marked “Got it”." : S.show === "unseen" ? "Only cards you haven't marked yet." : "";
  $("sumPick").textContent = `· ${pool} card${pool === 1 ? "" : "s"}`;
  $("sumShow").textContent = "· " + SHOWS[S.show];
  renderPreview();
}
function renderStats() {
  const nAll = CARDS.length;
  const k = CARDS.filter(c => D.marks[c.t] === "k").length, m = CARDS.filter(c => D.marks[c.t] === "m").length, st = deckIds("starred").length;
  $("nums").innerHTML = `<div><b style="color:var(--matcha-ink)">${k}</b><span>got it</span></div><div><b style="color:var(--bad-ink)">${m}</b><span>study again</span></div><div><b style="color:var(--star-deep)">${st}</b><span>starred</span></div><div><b>${nAll - k - m}</b><span>not seen</span></div>`;
  $("meter").children[0].style.width = (k / nAll * 100) + "%";
  $("meter").children[1].style.width = (m / nAll * 100) + "%";
  $("modbars").innerHTML = Object.keys(MODS).map(mo => {
    const ids = deckIds(mo), got = ids.filter(id => mk(id) === "k").length;
    return `<div class="mb" style="--c:${MODC[mo]}" title="${esc(MODS[mo])}"><span>${esc(mo)}</span><span class="meter"><i style="width:${got / ids.length * 100}%"></i></span><span class="v">${got}/${ids.length}</span></div>`;
  }).join("");
  const cell = v => v ? v.toLocaleString() : "–";
  $("best").innerHTML = `<tr><th>Best scores</th><th>Easy</th><th>Normal</th><th>Hard</th></tr>` +
    Object.entries(MODES).map(([mk2, M]) => `<tr><td>${M.name}</td>${Object.keys(DIFF).map(d => `<td>${cell(D.best[mk2 + "-" + d])}</td>`).join("")}</tr>`).join("");
}
$("modes").addEventListener("click", e => { const b = e.target.closest(".mode"); if (!b) return; S.mode = b.dataset.m; persist(); renderMenu(); });
$("diffs").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; S.diff = b.dataset.d; persist(); renderMenu(); });
$("decks").addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const k = b.dataset.k, a = b.dataset.a, was = opOf(k);
  ["sel", "inc", "exc"].forEach(o => { S[o] = S[o].filter(x => x !== k); });
  if (was !== a) S[a].push(k);
  persist(); renderDecks();
});
$("pickSummary").addEventListener("click", e => { if (e.target.id === "pickClear") { S.sel = []; S.inc = []; S.exc = []; persist(); renderDecks(); } });
$("shows").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; S.show = b.dataset.s; persist(); renderDecks(); });
$("lens").addEventListener("click", e => { const b = e.target.closest("[data-l]"); if (!b) return; S.len = b.dataset.l === "all" ? "all" : +b.dataset.l; persist(); renderMenu(); });
$("start").addEventListener("click", () => startGame({}));
let askFn = null, askFrom = null;
function ask(title, body, yes, fn) {
  askFrom = document.activeElement; askFn = fn;
  $("askTitle").textContent = title; $("askBody").textContent = body; $("askYes").textContent = yes;
  $("ask").hidden = false; $("askNo").focus({ preventScroll: true });
}
function closeAsk() { $("ask").hidden = true; askFn = null; if (askFrom && askFrom.focus) askFrom.focus({ preventScroll: true }); }
$("askNo").addEventListener("click", closeAsk);
$("askYes").addEventListener("click", () => { const f = askFn; closeAsk(); if (f) f(); });
$("ask").addEventListener("click", e => { if (e.target === $("ask")) closeAsk(); });
$("resetBest").addEventListener("click", () => ask("Reset best scores?",
  "This clears your best score for every mode and difficulty. Your got-it marks, study-again pile and stars stay.",
  "Reset best scores", () => { D.best = {}; persist(); renderStats(); toast("Best scores reset."); }));
$("resetBtn").addEventListener("click", () => ask("Clear all progress?",
  "This clears every got-it and study-again mark, all stars, and your best scores. It can't be undone.",
  "Clear everything", () => {
    const keep = D.settings; D = defaults(); D.settings = keep; S = D.settings;
    persist(); renderMenu(); renderList(); toast("Progress cleared.");
  }));
$("copySave").addEventListener("click", () => {
  const txt = JSON.stringify(D);
  const fallback = () => { $("loadBox").hidden = false; $("loadText").value = txt; $("loadText").select(); toast("Press Cmd+C to copy the selected save data."); };
  try { navigator.clipboard.writeText(txt).then(() => toast("Save data copied. Paste it into “Load save data” on the other copy."), fallback); } catch (e) { fallback(); }
});
$("loadSaveBtn").addEventListener("click", () => { $("loadBox").hidden = false; $("loadText").value = ""; $("loadText").focus(); });
$("loadCancel").addEventListener("click", () => { $("loadBox").hidden = true; });
$("loadGo").addEventListener("click", () => {
  let o; try { o = JSON.parse($("loadText").value); } catch (e) { toast("That isn't valid save data. Copy it again and paste the whole thing."); return; }
  if (!isObj(o) || !isObj(o.marks)) { toast("That doesn't look like save data from this app."); return; }
  D = sanitize(o); S = D.settings; normalizeSettings();
  persist(); $("loadBox").hidden = true; renderMenu(); renderList(); toast("Save data loaded.");
});

function tabList() {
  return [["all", "All", "var(--matcha)"]]
    .concat(Object.keys(MODS).map(m => ["sec:" + m, m, MODC[m]]))
    .concat(allTags().map(x => ["tag:" + x, "#" + x, tagColor(x)]))
    .concat([["starred", "★ Starred", "var(--star)"], ["missed", "Study again", "var(--sakura)"], ["unseen", "Unseen", "var(--line)"], ["got", "Got it", "var(--matcha)"]]);
}
// one card as a list row; readOnly drops the tag editing controls (used by the preview)
function rowHTML(c, readOnly) {
  const tags = tagsOf(c), options = allTags().filter(x => !tags.includes(x));
  const status = mk(c.id) === "k" ? "got it" : mk(c.id) === "m" ? "study again" : "unseen";
  const tagHTML = tags.map(x => `<span class="badge" style="--c:${tagColor(x)}">${esc(x)}${readOnly ? "" : `<button class="tagx" data-tag="${esc(x)}" aria-label="Remove tag ${esc(x)}">×</button>`}</span>`).join("");
  const picker = readOnly ? "" : `<select class="tagsel" aria-label="Add a tag to ${esc(plain(c.t))}"><option value="">+ tag</option>${options.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}<option value="__new">New tag…</option></select>`;
  return `<div class="row" data-id="${c.id}"><div class="rt">${fmt(c.t)}<div class="cluster rtags">${tagHTML}${picker}</div></div><span class="rd">${fmt(c.d)}${c.x ? `<br><i>e.g. ${fmt(c.x)}</i>` : ""}<br><span class="small">${esc(c.m)} · ${status}</span></span>${starBtn(c.id)}</div>`;
}
function renderTabs() {
  if (!tabList().some(([k]) => k === S.tab)) S.tab = "all";
  $("tabs").innerHTML = tabList().map(([k, label, c]) => `<button class="tab" role="tab" data-t="${esc(k)}" aria-selected="${S.tab === k}" style="--c:${c}">${esc(label)} <span class="n">${deckIds(k).length}</span></button>`).join("");
  $("allTags").innerHTML = allTags().map(x => `<span class="badge" style="--c:${tagColor(x)}">${esc(x)} · ${deckIds("tag:" + x).length}<button class="tagx" data-del="${esc(x)}" aria-label="Delete tag ${esc(x)}">×</button></span>`).join("") || '<span class="small">No tags yet.</span>';
  $("writeCsv").hidden = SAVE_MODE !== "file";
  $("tagCount").textContent = allTags().length + " tags";
}
function renderList() {
  renderTabs();
  const q = $("search").value.trim().toLowerCase();
  const inTab = new Set(deckIds(S.tab));
  const ids = CARDS.filter(c => inTab.has(c.id) && (!q || (c.t + " " + c.d + " " + c.x + " " + tagsOf(c).join(" ")).toLowerCase().includes(q))).map(c => c.id);
  $("list").innerHTML = listHTML(ids) || `<p class="small">${q ? `No cards in this tab match “${esc(q)}”.` : "No cards in this tab yet."}</p>`;
}
// cards grouped under their section headings
function listHTML(ids, readOnly) {
  const set = new Set(ids);
  return Object.keys(MODS).map(m => {
    const rows = CARDS.filter(c => c.m === m && set.has(c.id));
    return rows.length ? `<div class="mod" style="--c:${MODC[m]}"><h3><span class="sw"></span>${esc(m)} · ${esc(MODS[m])} <span class="n">${rows.length}</span></h3>` + rows.map(c => rowHTML(c, readOnly)).join("") + `</div>` : "";
  }).join("");
}
// live preview under the Start button (only built while it's open)
function renderPreview() {
  const ids = poolIds(), n = ids.length;
  $("sumPreview").textContent = `· ${n} card${n === 1 ? "" : "s"}`;
  if (!$("previewBox").open) return;
  const drawn = S.mode === "speed" ? "Speed round draws from all of them at random." : `Each game draws ${S.len === "all" || S.len >= n ? "all of them" : S.len + " of them"}, study-again and starred cards first.`;
  $("previewNote").textContent = n ? drawn : "No cards match right now.";
  $("preview").innerHTML = listHTML(ids, true);
}
function refreshRow(id) { const row = $("list").querySelector(`.row[data-id="${id}"]`); if (row) row.outerHTML = rowHTML(CARDS[id]); renderTabs(); }
function addTag(id, x) {
  x = normTag(x); if (!x) return;
  const c = CARDS[id], isNew = !allTags().includes(x);
  if (!tagsOf(c).includes(x)) setTags(c, tagsOf(c).concat(x));
  if (isNew) renderList(); else if (S.tab.startsWith("tag:") && S.tab !== "tag:" + x) refreshRow(id); else renderList();
  renderDecks();
}
$("search").addEventListener("input", renderList);
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.matches || !d.matches("details.fold[data-key]")) return;
  if (d.id === "previewBox" && d.open) renderPreview();
  if (S.open[d.dataset.key] !== d.open) { S.open[d.dataset.key] = d.open; persist(); }
}, true);
$("tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (!b) return; S.tab = b.dataset.t; persist(); renderList(); });
$("list").addEventListener("change", e => {
  const sel = e.target.closest(".tagsel"); if (!sel) return;
  const id = +sel.closest(".row").dataset.id;
  if (sel.value === "__new") {
    const span = document.createElement("span");
    span.innerHTML = `<input class="tagnew" type="text" placeholder="tag name" aria-label="New tag name"> <button class="minibtn" data-act="addnew">Add</button>`;
    sel.replaceWith(span); span.querySelector("input").focus();
  } else if (sel.value) addTag(id, sel.value);
});
$("list").addEventListener("click", e => {
  const x = e.target.closest(".tagx");
  if (x) { const id = +x.closest(".row").dataset.id, c = CARDS[id]; setTags(c, tagsOf(c).filter(t => t !== x.dataset.tag)); if (S.tab === "tag:" + x.dataset.tag) renderList(); else refreshRow(id); renderDecks(); return; }
  const add = e.target.closest('[data-act="addnew"]');
  if (add) { const row = add.closest(".row"); addTag(+row.dataset.id, row.querySelector(".tagnew").value); renderDecks(); }
});
$("list").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.classList.contains("tagnew")) { e.preventDefault(); const row = e.target.closest(".row"); addTag(+row.dataset.id, e.target.value); renderDecks(); }
  if (e.key === "Escape" && e.target.classList.contains("tagnew")) { e.preventDefault(); refreshRow(+e.target.closest(".row").dataset.id); }
});
$("addTags").addEventListener("click", () => {
  const list = $("newTags").value.split(",").map(normTag).filter(Boolean);
  if (!list.length) { toast("Type one or more tag names first, separated by commas."); return; }
  const before = new Set(allTags());
  list.forEach(x => { if (!D.tagList.includes(x)) D.tagList.push(x); });
  persist(); $("newTags").value = ""; renderList(); renderDecks();
  const added = list.filter(x => !before.has(x));
  toast(added.length ? `Added ${added.map(x => "#" + x).join(", ")}. Use a card's “+ tag” menu to attach it.` : "Those tags already exist.");
});
$("newTags").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("addTags").click(); } });
$("allTags").addEventListener("click", e => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  const x = b.dataset.del, n = deckIds("tag:" + x).length;
  ask(`Delete #${x}?`, n ? `This removes the tag from ${n} card${n === 1 ? "" : "s"}. The cards themselves stay.` : "This tag isn't on any cards yet.", "Delete tag", () => {
    D.tagList = D.tagList.filter(t => normTag(t) !== x);
    CARDS.forEach(c => { if (tagsOf(c).includes(x)) setTags(c, tagsOf(c).filter(t => t !== x), true); });
    ["sel", "inc", "exc"].forEach(o => { S[o] = S[o].filter(k => k !== "tag:" + x); });
    if (S.tab === "tag:" + x) S.tab = "all";
    persist(); renderList(); renderDecks(); toast(`Deleted #${x}.`);
  });
});
function toCSV() {
  const q = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const lines = ["section,tags,title,info,example"];
  CARDS.forEach(c => lines.push([`${c.m} - ${MODS[c.m]}`, tagsOf(c).join("; "), c.t, c.d, c.x || ""].map(q).join(",")));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
$("writeCsv").addEventListener("click", () => ask("Write tags into cards.csv?",
  "Your current tags become the tags column of cards.csv. The old file is kept as cards.backup.csv.",
  "Write cards.csv", async () => {
    try {
      const r = await fetch("api/cards", { method: "PUT", headers: { "Content-Type": "text/csv" }, body: toCSV() });
      if (!r.ok) throw new Error();
      CARDS.forEach(c => { c.g = tagsOf(c).slice(); }); D.tags = {}; persist();
      toast("Tags written into cards.csv.");
    } catch (e) { toast("Couldn't write cards.csv. Is the Terminal window from “Open Flashcards” still open?"); }
  }));
$("copy").addEventListener("click", () => {
  const clean = s => plain(s).replace(/[\t\n]+/g, " ");
  const tsv = CARDS.map(c => clean(c.t) + "\t" + clean(c.d + (c.x ? " e.g. " + c.x : ""))).join("\n");
  const fallback = () => { const box = $("copybox"); box.value = tsv; box.hidden = false; box.focus(); box.select(); toast("Press Cmd+C to copy the selected text."); };
  try { navigator.clipboard.writeText(tsv).then(() => toast(`Copied ${CARDS.length} cards. Paste into Quizlet or Anki import.`), fallback); } catch (e) { fallback(); }
});

let toastTimer;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3000); }

/* ---------- pomodoro ---------- */
const POMO = { focus: [25, "Focus 25"], short: [5, "Break 5"], long: [15, "Long 15"] };
const PC = 2 * Math.PI * 62;
const P = { kind: "focus", left: 25 * 60e3, running: false, endAt: 0 };
let actx = null;
function audio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} }
function chime() {
  try {
    audio(); if (!actx) return;
    const now = actx.currentTime;
    [[659.25, 0], [880, .2], [1046.5, .4]].forEach(([f, t]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, now + t); g.gain.exponentialRampToValueAtTime(.16, now + t + .02); g.gain.exponentialRampToValueAtTime(.0001, now + t + 1.1);
      o.connect(g).connect(actx.destination); o.start(now + t); o.stop(now + t + 1.2);
    });
  } catch (e) {}
}
function setKind(k) { P.kind = k; P.left = POMO[k][0] * 60e3; P.running = false; drawPomo(); }
function drawPomo() {
  const total = POMO[P.kind][0] * 60e3;
  $("pomo").dataset.kind = P.kind;
  $("pomoKinds").innerHTML = Object.entries(POMO).map(([k, v]) => `<button data-p="${k}" aria-pressed="${P.kind === k}" style="--c:${k === "focus" ? "var(--sakura)" : "var(--m4)"}">${v[1]}</button>`).join("");
  $("pomoProg").style.strokeDasharray = PC;
  $("pomoProg").style.strokeDashoffset = PC * (1 - P.left / total);
  $("pomoTime").textContent = clock(P.left);
  $("pomoKindLabel").textContent = P.kind === "focus" ? "focus" : "break";
  $("pomoGo").textContent = P.running ? "Pause" : P.left < total ? "Resume" : "Start";
  $("pomoPill").hidden = !(P.running || P.left < total);
  $("pomoPill").classList.toggle("paused", !P.running);
  $("pomoPillTime").textContent = clock(P.left) + (P.running ? "" : " · paused");
}
function pomoToggle() {
  audio();
  if (P.running) { P.left = Math.max(0, P.endAt - Date.now()); P.running = false; }
  else { P.endAt = Date.now() + P.left; P.running = true; }
  drawPomo();
}
$("pomoGo").addEventListener("click", pomoToggle);
$("pomoPill").addEventListener("click", pomoToggle);
$("pomoReset").addEventListener("click", () => setKind(P.kind));
$("pomoKinds").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) setKind(b.dataset.p); });
setInterval(() => {
  if (!P.running) return;
  P.left = Math.max(0, P.endAt - Date.now());
  if (P.left === 0) {
    chime();
    const wasFocus = P.kind === "focus";
    setKind(wasFocus ? "short" : "focus");
    toast(wasFocus ? "Focus block done. Time for a 5-minute break." : "Break's over. Back to it!");
  } else drawPomo();
}, 250);

/* ---------- game engine ---------- */
let G = null;
const stage = $("stage");
const TC = 2 * Math.PI * 19;
const T = { mode: "none", total: 0, left: 0, elapsed: 0, running: false, onEnd: null, last: performance.now() };
function startTimer(sec, onEnd) { Object.assign(T, { mode: "down", total: sec * 1000, left: sec * 1000, running: true, onEnd }); drawTimer(); }
function startClock() { Object.assign(T, { mode: "up", elapsed: 0, running: true, onEnd: null }); drawTimer(); }
function stopTimer() { T.running = false; drawTimer(); }
function hideTimer() { T.mode = "none"; T.running = false; drawTimer(); }
function addTime(ms) { if (T.mode === "up") T.elapsed += ms; else T.left = Math.max(0, T.left + ms); drawTimer(); }
function drawTimer() {
  const box = $("tBox");
  if (!G || T.mode === "none") { box.hidden = true; return; }
  box.hidden = false;
  let frac, txt;
  if (T.mode === "up") { frac = G.ids.length ? (G.matched || 0) / G.ids.length : 0; txt = clock(T.elapsed); }
  else { frac = T.total ? T.left / T.total : 0; txt = String(Math.ceil(T.left / 1000)); }
  $("tRing").style.strokeDasharray = TC;
  $("tRing").style.strokeDashoffset = TC * (1 - frac);
  box.classList.toggle("low", T.mode === "down" && frac < .3);
  box.classList.toggle("up", T.mode === "up");
  if ($("tText").textContent !== txt) $("tText").textContent = txt;
}
function penalty(txt) {
  const s = document.createElement("span"); s.className = "pen"; s.textContent = txt;
  $("tBox").appendChild(s); setTimeout(() => s.remove(), 950);
}
function frame(now) {
  const dt = Math.min(now - T.last, 250); T.last = now;
  if (G && !G.over && !G.paused) {
    G.activeMs += dt;
    if (T.running) {
      if (T.mode === "up") T.elapsed += dt;
      else if (T.mode === "down") {
        T.left -= dt;
        if (T.left <= 0) { T.left = 0; T.running = false; const f = T.onEnd; T.onEnd = null; drawTimer(); if (f) f(); }
      }
      drawTimer();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function showScreen(name) {
  ["menu", "game", "results"].forEach(s => { $(s).hidden = s !== name; });
  window.scrollTo(0, 0);
  if (name === "menu") { renderMenu(); renderList(); }
}
function startGame(o) {
  const mode = o.mode || S.mode, diff = o.diff || S.diff;
  const ids = o.ids ? shuffle(o.ids.slice()) : pickCards(mode === "speed" ? "all" : S.len);
  if (!ids.length) { toast(S.show === "all" ? "No cards match those sections and tags. Try removing a − or adding a +." : "No cards left with this filter. Nice work!"); return; }
  if (G) clearTimeout(G.auto);
  G = { mode, diff, D: DIFF[diff], ids, i: 0, score: 0, streak: 0, bestStreak: 0, lives: DIFF[diff].lives, right: 0, wrong: 0, missed: new Set(), paused: false, over: false, activeMs: 0, matched: 0, answered: 0, mistakes: 0, reviewIds: o.ids };
  hideTimer();
  $("pause").hidden = true;
  showScreen("game");
  IMPL[mode].start();
}
function renderBar() {
  const M = MODES[G.mode];
  $("gMode").textContent = M.name; $("gMode").style.setProperty("--c", M.c);
  const n = G.ids.length, i = Math.min(G.i + 1, n);
  $("gProg").textContent = G.mode === "cards" ? `Card ${i} of ${n}` : G.mode === "quiz" ? `Question ${i} of ${n}` : G.mode === "match" ? `${G.matched} of ${n} pairs` : `${G.answered} answered`;
  const heart = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="${on ? "on" : "off"}" d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>`;
  const showHearts = G.mode === "quiz" && isFinite(G.D.lives);
  $("gHearts").innerHTML = showHearts ? Array.from({ length: G.D.lives }, (_, k) => heart(k < G.lives)).join("") : "";
  $("gHearts").setAttribute("aria-label", showHearts ? `${G.lives} lives left` : "");
  $("gStreak").hidden = G.streak < 2 || G.mode === "cards";
  $("gStreak").textContent = `streak ${G.streak}`;
  $("gScore").textContent = G.mode === "match" ? G.mistakes : G.score.toLocaleString();
  $("gScoreLabel").textContent = G.mode === "match" ? "misses" : "score";
  drawTimer();
}
function topLine(c) { return `<span class="tape tape--top"></span><div class="face-top">${esc(c.m)} · ${esc(MODS[c.m])}</div>`; }
function markMiss(id) { G.missed.add(id); setMark(id, "m"); }
function later(fn, ms) { clearTimeout(G.auto); const g = G; G.auto = setTimeout(() => { if (G !== g || g.over) return; if (g.paused) { g.resume = fn; return; } fn(); }, ms); }
function currentId() {
  if (!G || G.over) return -1;
  if (G.mode === "cards") return G.ids[G.i];
  if ((G.mode === "quiz" || G.mode === "speed") && G.q) return G.q.c.id;
  return -1;
}

const IMPL = {
  cards: {
    start() { this.show(); },
    show() {
      const c = CARDS[G.ids[G.i]];
      G.flipped = false;
      const defFirst = G.diff === "hard" || (G.diff === "normal" && Math.random() < .5);
      const termFace = back => `<div class="sheet face ${back ? "back" : "front"}">${topLine(c)}<div class="face-term"><span><span class="hl">${fmt(c.t)}</span></span></div>${back && c.x ? `<p class="ex"><b>e.g.</b>${fmt(c.x)}</p>` : ""}</div>`;
      const defFace = back => `<div class="sheet face ${back ? "back" : "front"}">${topLine(c)}<div class="face-def">${back ? `<p class="def-term"><span class="hl">${fmt(c.t)}</span></p>` : ""}<p>${fmt(back ? c.d : mask(c.d, c))}</p>${back && c.x ? `<p class="ex"><b>e.g.</b>${fmt(c.x)}</p>` : ""}</div></div>`;
      stage.innerHTML = `<div class="scene"><button class="flip" id="flip" style="--c:${MODC[c.m]}" aria-label="Flip card">${defFirst ? defFace(false) + termFace(true) : termFace(false) + defFace(true)}</button></div>
        <div class="cluster cardtools">${starBtn(c.id, true)}<p class="hint">${defFirst ? "Name the term" : "Recall the definition"} · click the card or Space to flip · 1 study again · 2 got it · S star</p></div>
        <div class="grade" id="grade"><button class="btn btn--tint" style="--c:var(--sakura)" data-g="m">Study again<kbd>1</kbd></button><button class="btn btn--tint" style="--c:var(--matcha)" data-g="k">Got it<kbd>2</kbd></button></div>`;
      $("flip").onclick = () => this.flip();
      $("grade").onclick = e => { const b = e.target.closest("[data-g]"); if (b) this.grade(b.dataset.g); };
      if (G.D.think) startTimer(G.D.think, () => { if (!G.flipped) this.flip(); }); else hideTimer();
      renderBar();
    },
    flip() {
      G.flipped = !G.flipped;
      $("flip").classList.toggle("flipped", G.flipped);
      if (G.flipped) stopTimer();
    },
    grade(g) {
      const id = G.ids[G.i];
      setMark(id, g);
      if (g === "k") { G.right++; G.streak++; G.score += Math.round(100 * G.D.mult); }
      else { G.wrong++; G.streak = 0; G.missed.add(id); }
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      G.i++;
      if (G.i >= G.ids.length) finish(); else this.show();
    },
    key(e) {
      if (e.key === " " || e.key === "Enter") { if (e.target.closest && e.target.closest("button")) return; e.preventDefault(); this.flip(); }
      else if (e.key === "1") this.grade("m");
      else if (e.key === "2") this.grade("k");
    }
  },

  quiz: {
    start() { this.ask(); },
    ask() {
      const c = CARDS[G.ids[G.i]];
      const dir = G.diff === "easy" ? "d2t" : Math.random() < (G.diff === "normal" ? .7 : .5) ? "d2t" : "t2d";
      const opts = shuffle([c].concat(distractors(c, G.D.opts - 1, G.diff)));
      G.q = { c, dir, opts, done: false };
      const prompt = dir === "d2t"
        ? `<div class="q-ask">Which term matches this definition?</div><p class="q-def">${fmt(mask(c.d, c))}</p>`
        : `<div class="q-ask">Which definition matches this term?</div><p class="q-term"><span class="hl">${fmt(c.t)}</span></p>`;
      stage.innerHTML = `<div class="sheet" style="--c:${MODC[c.m]}">${topLine(c)}${starBtn(c.id, false, "star--corner")}${prompt}</div>
        <div class="stack opts" id="opts" style="--gap:10px">${opts.map((o, k) => `<button class="choice opt" data-k="${k}"><span class="k">${k + 1}</span><span>${dir === "d2t" ? fmt(o.t) : fmt(mask(o.s, o))}</span></button>`).join("")}</div>
        <div id="fb"></div>`;
      $("opts").onclick = e => { const b = e.target.closest(".opt"); if (b) this.answer(+b.dataset.k); };
      startTimer(G.D.qTime, () => this.answer(-1));
      renderBar();
    },
    answer(k) {
      const q = G.q; if (!q || q.done || G.paused) return;
      q.done = true;
      const frac = T.total ? T.left / T.total : 0;
      stopTimer();
      const right = q.opts.findIndex(o => o.id === q.c.id), ok = k === right;
      document.querySelectorAll(".opt").forEach((b, i) => { b.disabled = true; b.classList.add(i === right ? "right" : i === k ? "wrong" : "dim"); });
      let gain = 0;
      if (ok) { gain = Math.round((100 + 50 * frac + 10 * Math.min(G.streak, 10)) * G.D.mult); G.score += gain; G.streak++; G.right++; }
      else { G.streak = 0; G.wrong++; markMiss(q.c.id); if (isFinite(G.lives)) G.lives--; }
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      const last = G.i + 1 >= G.ids.length || G.lives <= 0;
      $("fb").innerHTML = `<div class="fb stack ${ok ? "ok" : "bad"}" style="--c:${MODC[q.c.m]}">
        <div class="fb-head">${ok ? `Correct!<span class="badge" style="--c:var(--butter)">+${gain}</span>` : k < 0 ? "Time's up" : "Not quite"}</div>
        ${ok ? "" : `<p><b>${fmt(q.c.t)}</b>: ${fmt(q.c.d)}</p>${q.c.x ? `<p class="ex"><b>e.g.</b>${fmt(q.c.x)}</p>` : ""}`}
        <button class="btn btn--primary" id="nextBtn">${last ? (G.lives <= 0 ? "Out of lives · see results" : "See results") : "Next question"}</button></div>`;
      $("nextBtn").onclick = () => this.next();
      $("nextBtn").focus({ preventScroll: true });
      renderBar();
      if (ok && !last) later(() => this.next(), 1100);
    },
    next() {
      clearTimeout(G.auto);
      if (G.over) return;
      G.i++;
      if (G.i >= G.ids.length || G.lives <= 0) finish(); else this.ask();
    },
    key(e) { const n = parseInt(e.key, 10); if (G.q && !G.q.done && n >= 1 && n <= G.q.opts.length) this.answer(n - 1); }
  },

  match: {
    start() {
      let ids = G.ids.slice();
      if (ids.length < 3) { ids = ids.concat(shuffle(CARDS.map(c => c.id).filter(id => !ids.includes(id))).slice(0, 3 - ids.length)); G.ids = ids; }
      const P = G.D.pairs, boards = [];
      for (let i = 0; i < ids.length; i += P) boards.push(ids.slice(i, i + P));
      if (boards.length > 1 && boards[boards.length - 1].length < 3) { const tail = boards.pop(); boards[boards.length - 1] = boards[boards.length - 1].concat(tail); }
      Object.assign(G, { boards, b: 0, matched: 0, mistakes: 0, lock: false });
      startClock(); this.deal();
    },
    deal() {
      const ids = G.boards[G.b];
      G.sel = { t: null, d: null }; G.done = new Set();
      const tile = (id, side) => `<button class="choice tile ${side === "t" ? "term" : "def"}" data-side="${side}" data-id="${id}" style="--c:${MODC[CARDS[id].m]}">${side === "t" ? fmt(CARDS[id].t) : fmt(mask(CARDS[id].s, CARDS[id]))}</button>`;
      stage.innerHTML = `<p class="hint center">Board ${G.b + 1} of ${G.boards.length} · tap a term, then its definition</p>
        <div class="mgrid" id="mgrid"><div class="stack mcol">${shuffle(ids.slice()).map(id => tile(id, "t")).join("")}</div><div class="stack mcol">${shuffle(ids.slice()).map(id => tile(id, "d")).join("")}</div></div>`;
      $("mgrid").onclick = e => { const b = e.target.closest(".tile"); if (b) this.pick(b); };
      renderBar();
    },
    pick(b) {
      if (G.paused || G.lock || G.over) return;
      const side = b.dataset.side, id = +b.dataset.id;
      if (G.done.has(id)) return;
      const prev = G.sel[side];
      if (prev) prev.classList.remove("sel");
      if (prev === b) { G.sel[side] = null; return; }
      G.sel[side] = b; b.classList.add("sel");
      const t = G.sel.t, d = G.sel.d;
      if (!t || !d) return;
      if (t.dataset.id === d.dataset.id) {
        [t, d].forEach(x => { x.classList.remove("sel"); x.classList.add("done"); x.disabled = true; });
        G.done.add(id); G.matched++; G.right++; G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak);
        G.sel = { t: null, d: null };
        renderBar();
        if (G.done.size === G.boards[G.b].length) {
          G.b++; G.lock = true;
          if (G.b >= G.boards.length) { stopTimer(); later(() => finish(), 500); }
          else later(() => { G.lock = false; this.deal(); }, 500);
        }
      } else {
        G.mistakes++; G.wrong++; G.streak = 0; markMiss(+t.dataset.id);
        if (G.D.penalty) { addTime(G.D.penalty * 1000); penalty("+" + G.D.penalty + " s"); }
        [t, d].forEach(x => x.classList.add("nope"));
        G.lock = true;
        setTimeout(() => { [t, d].forEach(x => x.classList.remove("nope", "sel")); G.sel = { t: null, d: null }; G.lock = false; }, 420);
        renderBar();
      }
    }
  },

  speed: {
    start() { G.lastId = -1; startTimer(G.D.speedTime, () => finish()); this.next(); },
    next() {
      if (G.over) return;
      let id;
      do { id = G.ids[Math.floor(Math.random() * G.ids.length)]; } while (G.ids.length > 1 && id === G.lastId);
      G.lastId = id;
      const c = CARDS[id], truth = Math.random() < .5;
      const shown = truth ? c : distractors(c, 1, G.diff)[0];
      G.q = { c, shown, truth, done: false };
      stage.innerHTML = `<div class="sheet speed" id="sp" style="--c:${MODC[c.m]}">${topLine(c)}${starBtn(c.id, false, "star--corner")}
        <p class="sp-term"><span class="hl">${fmt(c.t)}</span></p><p class="sp-means">means</p><p class="sp-def">${fmt(mask(shown.s, shown))}</p><div class="sp-fb" id="spfb"></div></div>
        <div class="tf" id="tf"><button class="btn btn--tint" style="--c:var(--sakura)" data-a="0">False<kbd>F</kbd></button><button class="btn btn--tint" style="--c:var(--matcha)" data-a="1">True<kbd>J</kbd></button></div>
        <p class="hint center">Keys: F or ← for false · J or → for true · S to star</p>`;
      $("tf").onclick = e => { const b = e.target.closest("[data-a]"); if (b) this.answer(b.dataset.a === "1"); };
      renderBar();
    },
    answer(saysTrue) {
      const q = G.q; if (!q || q.done || G.over || G.paused) return;
      q.done = true; G.answered++;
      const ok = saysTrue === q.truth;
      if (ok) { G.score += Math.round((100 + 10 * Math.min(G.streak, 10)) * G.D.mult); G.streak++; G.right++; }
      else {
        G.streak = 0; G.wrong++; markMiss(q.c.id);
        if (G.D.speedPen) { addTime(-G.D.speedPen * 1000); penalty("−" + G.D.speedPen + " s"); }
        $("spfb").innerHTML = q.truth ? "That one was true." : `That's the definition of ${fmt(q.shown.t)}.`;
      }
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      $("sp").classList.add(ok ? "ok" : "bad");
      renderBar();
      later(() => this.next(), ok ? 300 : 1300);
    },
    key(e) {
      const k = e.key.toLowerCase();
      if (k === "f" || e.key === "ArrowLeft") { e.preventDefault(); this.answer(false); }
      else if (k === "j" || e.key === "ArrowRight") { e.preventDefault(); this.answer(true); }
    }
  }
};

function finish() {
  if (!G || G.over) return;
  G.over = true; clearTimeout(G.auto); T.running = false;
  $("pause").hidden = true;
  let time = G.activeMs;
  if (G.mode === "match") {
    time = T.elapsed;
    const pairs = G.matched, par = G.ids.length * G.D.par;
    G.score = Math.max(0, Math.round((pairs * 100 + Math.max(0, par - T.elapsed / 1000) * 10 - G.mistakes * 25) * G.D.mult));
    if (pairs < G.ids.length) G.score = Math.round(G.score * pairs / G.ids.length);
  }
  const key = G.mode + "-" + G.diff, prev = D.best[key] || 0, isBest = G.score > prev;
  if (isBest) D.best[key] = G.score;
  D.games = (D.games || 0) + 1; persist();
  const tot = G.right + G.wrong, acc = tot ? Math.round(G.right / tot * 100) : 0;
  const msg = !tot ? "Session ended" : acc >= 90 ? "Excellent work!" : acc >= 75 ? "Nice, solid round." : acc >= 50 ? "Getting there." : "Good practice. Review the misses below.";
  const missed = [...G.missed].map(id => CARDS[id]);
  const M = MODES[G.mode], g = G;
  $("results").innerHTML = `<div class="sheet stack results" style="--c:${M.c}"><span class="tape tape--top"></span>
      ${isBest && G.score > 0 ? `<div class="hanko"><span>NEW<br>BEST</span></div>` : ""}
      <div class="face-top" style="padding-right:0">${M.name} · ${DIFF[G.diff].label}</div>
      <h2>${msg}</h2>
      <div class="bigscore">${G.score.toLocaleString()}<small>points</small></div>
      <p class="small prevbest">${isBest && prev ? `Previous best: ${prev.toLocaleString()}` : !isBest && prev ? `Your best: ${prev.toLocaleString()}` : ""}</p>
      <div class="cluster rstats">
        <div><b>${acc}%</b><span>accuracy</span></div>
        <div><b>${G.right}</b><span>${G.mode === "cards" ? "got it" : G.mode === "match" ? "pairs" : "correct"}</span></div>
        <div><b>${G.wrong}</b><span>${G.mode === "match" ? "wrong pairs" : "missed"}</span></div>
        <div><b>${G.bestStreak}</b><span>best streak</span></div>
        <div><b>${clock(time)}</b><span>time</span></div>
      </div>
      <div class="cluster ractions">
        <button class="btn btn--primary" id="rAgain">Play again</button>
        ${missed.length ? `<button class="btn" id="rReview">Review ${missed.length} missed as flashcards</button>` : ""}
        <button class="btn" id="rMenu">Back to menu</button>
      </div></div>
    ${missed.length ? `<div class="panel missed"><h3>Cards to review</h3><p class="small">Star the ones that keep tripping you up.</p>${missed.map(c => `<div class="mrow" style="--c:${MODC[c.m]}"><span class="sw"></span><div><b>${fmt(c.t)}</b><p>${fmt(c.d)}</p></div>${starBtn(c.id)}</div>`).join("")}</div>` : ""}`;
  showScreen("results");
  $("rAgain").onclick = () => startGame({ mode: g.mode, diff: g.diff, ids: g.reviewIds });
  $("rMenu").onclick = () => showScreen("menu");
  if ($("rReview")) $("rReview").onclick = () => startGame({ mode: "cards", diff: "easy", ids: [...g.missed] });
}

function togglePause(force) {
  if (!G || G.over || $("game").hidden) return;
  G.paused = force === undefined ? !G.paused : force;
  $("pause").hidden = !G.paused;
  if (G.paused) $("resume").focus({ preventScroll: true });
  else { T.last = performance.now(); const r = G.resume; G.resume = null; if (r) r(); }
}
$("pauseBtn").addEventListener("click", () => togglePause(true));
$("resume").addEventListener("click", () => togglePause(false));
$("endNow").addEventListener("click", () => { G.paused = false; G.resume = null; finish(); });
$("quit").addEventListener("click", () => { if (G) { G.over = true; clearTimeout(G.auto); } T.running = false; $("pause").hidden = true; showScreen("menu"); });
document.addEventListener("visibilitychange", () => { if (document.hidden && G && !G.over && !$("game").hidden) togglePause(true); });
document.addEventListener("keydown", e => {
  if (!$("ask").hidden) { if (e.key === "Escape") { e.preventDefault(); closeAsk(); } return; }
  if (e.target.closest && e.target.closest("input, textarea")) return;
  if (!G || G.over || $("game").hidden) return;
  if (e.key === "Escape") { e.preventDefault(); togglePause(); return; }
  if (G.paused) return;
  if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) { const id = currentId(); if (id >= 0) { e.preventDefault(); toggleStar(id); } return; }
  const impl = IMPL[G.mode];
  if (impl.key) impl.key(e);
});

/* ---------- boot ---------- */
function normalizeSettings() {
  if (!MODES[S.mode]) S.mode = "quiz";
  if (!DIFF[S.diff]) S.diff = "normal";
  if (!LENS.includes(S.len)) S.len = 20;
  if (!Array.isArray(S.inc)) S.inc = [];
  if (typeof S.deck === "string" && S.deck !== "all" && !S.inc.length) {
    const d = S.deck === "acr" ? "tag:acronym" : S.deck === "code" ? "tag:code" : S.deck;
    S.inc = [MODS[d] ? "sec:" + d : d];
  }
  if (!Array.isArray(S.exc)) S.exc = [];
  if (!Array.isArray(S.sel)) S.sel = [];
  const valid = k => typeof k === "string" && (k === "all" || k === "missed" || k === "starred" || (k.startsWith("sec:") && !!MODS[k.slice(4)]) || (k.startsWith("tag:") && allTags().includes(k.slice(4))));
  S.sel = [...new Set(S.sel.filter(valid))]; S.inc = [...new Set(S.inc.filter(valid))]; S.exc = [...new Set(S.exc.filter(valid))];
  delete S.deck;
  if (MODS[S.tab]) S.tab = "sec:" + S.tab;
  if (!isObj(S.open)) S.open = {};
  if (S.tagsOpen === false && S.open.tags === undefined) S.open.tags = false;
  delete S.tagsOpen;
  document.querySelectorAll("details.fold[data-key]").forEach(d => { if (S.open[d.dataset.key] !== undefined) d.open = S.open[d.dataset.key]; });
  if (!SHOWS[S.show]) S.show = "all";
  if (typeof S.tab !== "string") S.tab = "all";
}
(async function boot() {
  BUILTIN = csvToCards(window.BUILTIN_CSV || "");
  setCards(BUILTIN);
  const local = load(LS, null);
  D = sanitize(local);
  let fresh = false;
  if (location.protocol === "http:" || location.protocol === "https:") {
    // newest card text: cards.csv next to the page (works with server.py and static hosts like GitHub Pages)
    try {
      const c = await fetch("cards.csv", { cache: "no-store" });
      if (c.ok) { const list = csvToCards(await c.text()); if (list.length) { setCards(list); CARD_SRC = "cards.csv"; } }
    } catch (e) {}
    // save file: only when server.py is running
    try {
      const r = await fetch("api/progress", { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        SAVE_MODE = "file";
        const j = await r.json();
        if (isObj(j)) D = sanitize(j); else fresh = true;
        saveStatus = "saved";
      }
    } catch (e) {}
  }
  if (!CARDS.length) { $("heroSub").textContent = "No cards found. Check that cards.csv has section, tags, title, info and example columns."; return; }
  S = D.settings; normalizeSettings();
  const sections = Object.keys(MODS).length;
  let when = `${sections} section${sections === 1 ? "" : "s"}`;
  if (COUNTDOWN) {
    const [y, mo, d] = COUNTDOWN.date.split("-").map(Number), day = new Date(y, mo - 1, d), today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((day - today) / 864e5), what = COUNTDOWN.label;
    when = days > 1 ? `${what} in ${days} days` : days === 1 ? `${what} is tomorrow` : days === 0 ? `${what} is today. You've got this.` : `${what} has passed`;
  }
  $("heroSub").textContent = `${CARDS.length} cards${CARD_SRC === "cards.csv" ? " from cards.csv" : ""} · ${when}`;
  $("browseSum").textContent = `Browse all ${CARDS.length} cards`;
  drawPomo();
  showScreen("menu");
  if (fresh) persist();
})();
