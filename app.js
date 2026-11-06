'use strict';

/* =========================================================
   Trip Drip — praćenje troškova na putovanju
   Podaci se čuvaju samo na uređaju (localStorage).
   Iznosi se spremaju u centima (cijeli brojevi).
   ========================================================= */

const STORE_KEY = 'tripdrip-data';
const APP_VERSION = '1.1';

const PALETTE = [
  '#F07A6A', '#F29E5C', '#F5C84C', '#C5DD5E', '#7FCB76', '#5FCFC0',
  '#6FB1E8', '#8C9EF0', '#B48AE8', '#E58AC8', '#C4A484', '#9AA3B0',
];
const DEFAULT_CATEGORIES = [
  ['Put', '#F29E5C'],
  ['Smještaj', '#F07A6A'],
  ['Aktivnosti', '#C5DD5E'],
  ['Suveniri', '#E58AC8'],
  ['Lokalni transport', '#7FCB76'],
  ['Hrana', '#F5C84C'],
  ['Osiguranje', '#6FB1E8'],
];
const UNKNOWN_CAT = { id: '', name: 'Bez kategorije', color: '#9AA3B0' };
const BACKGROUNDS = [
  ['grey', 'Siva'], ['blue', 'Plava'], ['teal', 'Tirkizna'], ['green', 'Zelena'],
  ['yellow', 'Žuta'], ['orange', 'Narančasta'], ['pink', 'Roza'], ['purple', 'Ljubičasta'],
];
const DATA_VERSION = 2;

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');

/* ---------------- Ikone ---------------- */
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  left: svg('<path d="m15 5-7 7 7 7"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
};

/* ---------------- Pomoćne funkcije ---------------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const daysDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

function dmy(iso, withYear = true) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return withYear ? `${d}.${m}.${y}.` : `${d}.${m}.`;
}

function tripRange(t) {
  if (!t.end || t.end === t.start) return dmy(t.start);
  const sameYear = t.start.slice(0, 4) === t.end.slice(0, 4);
  return `${dmy(t.start, !sameYear)} – ${dmy(t.end)}`;
}
const tripDays = (t) => daysDiff(t.start, t.end || t.start) + 1;

const WEEKDAY = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

/** Iznos u centima → "€ 1.234,56" */
function money(cents) {
  const neg = cents < 0;
  const c = Math.abs(Math.round(cents || 0));
  const whole = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}€ ${whole},${pad(c % 100)}`;
}

/** Iznos u centima → "1234,56" za polje za unos */
const amountInput = (cents) => `${Math.floor(cents / 100)},${pad(cents % 100)}`;

/** "12,5" / "12.50" / "1.234,56" / "1 234" → centi (ili NaN) */
function parseAmount(str) {
  let s = String(str || '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    // zadnji znak je decimalni separator
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" = tisuću dvjesto…
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** Tamni ili bijeli tekst ovisno o svjetlini boje */
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.78 ? '#3a3a3c' : '#fff';
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------------- Podaci ---------------- */
function defaultCategories() {
  return DEFAULT_CATEGORIES.map(([name, color]) => ({ id: uid(), name, color }));
}

function normalize(d) {
  const s = {
    v: DATA_VERSION,
    trips: Array.isArray(d?.trips) ? d.trips : [],
    expenses: Array.isArray(d?.expenses) ? d.expenses : [],
    categories: Array.isArray(d?.categories) && d.categories.length ? d.categories : defaultCategories(),
    settings: { bg: 'blue', pattern: true, ...(d?.settings || {}) },
  };
  // v1 → v2: zadana kategorija "Izleti" postala je "Aktivnosti"
  if (d && (d.v || 1) < 2) {
    const c = s.categories.find((x) => x.name === 'Izleti');
    if (c && !s.categories.some((x) => x.name === 'Aktivnosti')) c.name = 'Aktivnosti';
  }
  if (!BACKGROUNDS.some(([id]) => id === s.settings.bg)) s.settings.bg = 'blue';
  for (const t of s.trips) {
    if (!Array.isArray(t.people)) t.people = [];
    if (!Array.isArray(t.settlements)) t.settlements = [];
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return null;
}

let state = load();
if (!state) state = normalize(null);
save(); // spremi i eventualnu migraciju

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('Spremanje nije uspjelo: ' + e.message);
  }
}

const tripById = (id) => state.trips.find((t) => t.id === id);
const catById = (id) => state.categories.find((c) => c.id === id) || UNKNOWN_CAT;
const activeCats = () => state.categories.filter((c) => !c.archived);
const tripExpenses = (id) => state.expenses.filter((e) => e.tripId === id);
const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

/* ---------------- Podjela troškova ---------------- */
const personName = (trip, id) => trip.people.find((p) => p.id === id)?.name || '?';
const personColor = (trip, id) => PALETTE[Math.max(0, trip.people.findIndex((p) => p.id === id)) % PALETTE.length];

/** Iznos podijeljen na jednake dijelove; preostali centi idu prvima redom */
function splitShares(amount, ids) {
  const base = Math.floor(amount / ids.length);
  let rest = amount - base * ids.length;
  return ids.map((id) => [id, base + (rest-- > 0 ? 1 : 0)]);
}

/** Troškovi koji ulaze u obračun i stanje svake osobe (centi) */
function balances(trip) {
  const b = new Map(trip.people.map((p) => [p.id, { paid: 0, share: 0 }]));
  const open = tripExpenses(trip.id).filter((e) =>
    !e.settledId && b.has(e.paidBy) && Array.isArray(e.split) && e.split.some((id) => b.has(id)));
  for (const e of open) {
    b.get(e.paidBy).paid += e.amount;
    const parts = e.shares
      ? Object.entries(e.shares).filter(([id]) => b.has(id))
      : splitShares(e.amount, e.split.filter((x) => b.has(x)));
    for (const [id, c] of parts) b.get(id).share += c;
  }
  return { open, b };
}

/** Najmanje uplata da svi budu kvit: [{ from, to, amount }] */
function transfers(trip) {
  const { b } = balances(trip);
  const cred = [], debt = [];
  for (const p of trip.people) {
    const net = b.get(p.id).paid - b.get(p.id).share;
    if (net > 0) cred.push({ id: p.id, v: net });
    else if (net < 0) debt.push({ id: p.id, v: -net });
  }
  cred.sort((a, b2) => b2.v - a.v);
  debt.sort((a, b2) => b2.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amount = Math.min(debt[i].v, cred[j].v);
    if (amount > 0) out.push({ from: debt[i].id, to: cred[j].id, amount });
    debt[i].v -= amount;
    cred[j].v -= amount;
    if (!debt[i].v) i++;
    if (!cred[j].v) j++;
  }
  return out;
}

/* ---------------- Router ---------------- */
let viewKey = '';
let homeScroll = 0;

function parseHash() {
  const [view, id, sub] = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  if (view === 't' && id) return { name: 'trip', id: decodeURIComponent(id), tab: ['stats', 'split'].includes(sub) ? sub : 'list' };
  if (view === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

function render() {
  const r = parseHash();
  const key = r.name + (r.id || '') + (r.tab || '');
  const same = key === viewKey;
  const y = window.scrollY;
  if (viewKey === 'home' && !same) homeScroll = y;

  if (r.name === 'trip') {
    const trip = tripById(r.id);
    if (!trip) return location.replace('#/');
    renderTrip(trip, r.tab);
  } else if (r.name === 'settings') {
    renderSettings();
  } else {
    renderHome();
  }

  window.scrollTo(0, same ? y : key === 'home' ? homeScroll : 0);
  viewKey = key;
}

window.addEventListener('hashchange', () => {
  closeSheet(true);
  closeDialog(false);
  render();
});

/* ---------------- Početni ekran ---------------- */
function tripStatus(t) {
  const today = todayISO();
  if (today >= t.start && today <= (t.end || t.start)) return '<span class="pill now">U tijeku</span>';
  if (today < t.start) {
    const n = daysDiff(today, t.start);
    return `<span class="pill soon">${n === 1 ? 'Sutra' : `Za ${n} ${plural(n, 'dan', 'dana', 'dana')}`}</span>`;
  }
  return '';
}

function renderHome() {
  const trips = [...state.trips].sort((a, b) =>
    (b.start || '').localeCompare(a.start || '') || (b.createdAt || 0) - (a.createdAt || 0));

  const body = trips.length
    ? `<div class="trips">${trips.map((t) => {
        const n = tripDays(t);
        return `<a class="trip" href="#/t/${encodeURIComponent(t.id)}">
          <div class="trip-main">
            <div class="trip-name">${esc(t.name)}</div>
            <div class="trip-dates">${tripRange(t)} · ${n} ${plural(n, 'dan', 'dana', 'dana')}</div>
            ${tripStatus(t)}
          </div>
          <div class="trip-total">${money(sum(tripExpenses(t.id)))}</div>
          ${ICON.right}
        </a>`;
      }).join('')}</div>`
    : `<div class="welcome">
        <div class="big">🧳</div>
        <h2>Još nema putovanja</h2>
        <p>Dodaj prvo putovanje i počni bilježiti troškove.</p>
        <button class="wide-btn primary" data-act="newTrip">${ICON.plus} Novo putovanje</button>
      </div>`;

  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="goSettings" aria-label="Postavke">${ICON.settings}</button>
      <div class="topbar-title"></div>
      <button class="icon-btn" data-act="newTrip" aria-label="Novo putovanje">${ICON.plus}</button>
    </header>
    <h1 class="large-title">Putovanja</h1>
    ${body}`;
}

/* ---------------- Putovanje ---------------- */
function renderTrip(trip, tab) {
  const exps = tripExpenses(trip.id);
  const total = sum(exps);
  const n = tripDays(trip);

  $app.innerHTML = `
    <header class="topbar">
      <a class="text-btn" href="#/">${ICON.left}Putovanja</a>
      <div class="topbar-title"></div>
      <button class="icon-btn" data-act="editTrip" aria-label="Uredi putovanje">${ICON.pencil}</button>
    </header>
    <h1 class="large-title">${esc(trip.name)}</h1>
    <div class="subtitle">${tripRange(trip)} · ${n} ${plural(n, 'dan', 'dana', 'dana')}</div>
    <nav class="seg" role="tablist">
      <button role="tab" class="${tab === 'list' ? 'on' : ''}" data-act="tab" data-tab="list">Troškovi</button>
      <button role="tab" class="${tab === 'stats' ? 'on' : ''}" data-act="tab" data-tab="stats">Statistika</button>
      <button role="tab" class="${tab === 'split' ? 'on' : ''}" data-act="tab" data-tab="split">Podjela</button>
    </nav>
    ${tab === 'stats' ? statsView(trip, exps, total) : tab === 'split' ? splitView(trip) : expensesView(trip, exps, total)}
    <button class="fab" data-act="newExpense" aria-label="Novi trošak">${ICON.plus}</button>`;
}

function expensesView(trip, exps, total) {
  if (!exps.length) {
    return `<div class="welcome small">
      <div class="big">💸</div>
      <h2>Još nema troškova</h2>
      <p>Dodirni <b>+</b> dolje desno za prvi trošak.</p>
    </div>`;
  }

  // Prosjek po danu: tijekom putovanja dijeli s danima do danas
  const today = todayISO();
  const end = trip.end || trip.start;
  const days = today >= trip.start && today < end ? daysDiff(trip.start, today) + 1 : tripDays(trip);

  const byDate = new Map();
  for (const e of exps) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return `
    <div class="summary">
      <div class="sum-label">Ukupno</div>
      <div class="sum-total">${money(total)}</div>
      <div class="sum-sub">${exps.length} ${plural(exps.length, 'trošak', 'troška', 'troškova')} · ${money(Math.round(total / days))} / dan</div>
    </div>
    ${dates.map((date) => {
      const list = byDate.get(date).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const inTrip = date >= trip.start && date <= end;
      const dayNo = inTrip ? daysDiff(trip.start, date) + 1 : 0;
      return `<section class="day">
        <div class="day-head">
          <span>${WEEKDAY[toDate(date).getDay()]}, ${dmy(date)}${dayNo ? ` <em>· ${dayNo}. dan</em>` : ''}</span>
          <span>${money(sum(list))}</span>
        </div>
        <div class="group">${list.map((e) => {
          const c = catById(e.categoryId);
          return `<button class="exp" data-act="editExpense" data-id="${e.id}">
            <span class="cat-dot" style="background:${c.color}"></span>
            <span class="exp-text">
              <span class="exp-cat">${esc(c.name)}</span>
              ${e.note ? `<span class="exp-note">${esc(e.note)}</span>` : ''}
            </span>
            <span class="exp-amt">${money(e.amount)}</span>
          </button>`;
        }).join('')}</div>
      </section>`;
    }).join('')}`;
}

/* ---------------- Podjela (tko kome duguje) ---------------- */
function splitView(trip) {
  const people = trip.people;
  if (!people.length) {
    return `<div class="welcome small">
      <div class="big">👥</div>
      <h2>Podijeli troškove</h2>
      <p>Dodaj ljude s kojima putuješ (i sebe). Kod svakog troška zatim biraš tko je platio i za koga, a aplikacija izračuna tko kome koliko vraća.</p>
      <p>Trošak koji netko plati dijeli se na jednake dijelove (defoltno) ili odaberi opciju <b>Točni iznosi</b> pa svakoj osobi upiši točan iznos koji ona duguje u tom trošku.</p>
      <button class="wide-btn primary" data-act="newPerson">${ICON.plus} Dodaj osobu</button>
    </div>`;
  }

  const { open, b } = balances(trip);
  const missing = people.length >= 2 ? tripExpenses(trip.id).filter((e) => !e.settledId && !b.has(e.paidBy)).length : 0;

  const rows = people.map((p) => {
    const x = b.get(p.id);
    const net = x.paid - x.share;
    const col = personColor(trip, p.id);
    return `<button class="person-row" data-act="editPerson" data-id="${p.id}">
      <span class="avatar" style="background:${col};color:${textOn(col)}">${esc(p.name.trim().charAt(0).toUpperCase())}</span>
      <span class="exp-text">
        <span class="exp-cat">${esc(p.name)}</span>
        <span class="exp-note wrap">plaćeno ${money(x.paid)}<br>potrošeno ${money(x.share)}</span>
      </span>
      <span class="net ${net > 0 ? 'plus' : net < 0 ? 'minus' : ''}">
        <b>${net > 0 ? '+' : ''}${money(net)}</b>
        <small>${net > 0 ? 'dobiva natrag' : net < 0 ? 'duguje' : 'kvit'}</small>
      </span>
    </button>`;
  }).join('');

  const row = (t, done) => `
    <div class="transfer${done ? ' done' : ''}">
      <span>${esc(personName(trip, t.from))}</span>
      <span class="tr-arrow">→</span>
      <span>${esc(personName(trip, t.to))}</span>
      <span class="tr-amt">${money(t.amount)}</span>
      ${done ? '<span class="ok">✓</span>' : ''}
    </div>`;

  // Tko kome duguje: računa se odmah iz nepodmirenih troškova
  let debts = '';
  if (people.length >= 2) {
    const list = transfers(trip);
    const last = trip.settlements[trip.settlements.length - 1];
    if (open.length) {
      debts = `
        <div class="group-title row"><span>Tko kome duguje</span>${list.length ? '<button class="text-btn" data-act="shareSettle">Podijeli</button>' : ''}</div>
        <div class="group">${list.length ? list.map((t) => row(t)).join('') : '<div class="transfer muted">Svi su kvit, nitko nikome ne duguje.</div>'}</div>
        <div class="split-actions"><button class="wide-btn primary" data-act="settleAll">${ICON.check} Podmiri</button></div>
        <p class="hint">Kad dugove riješite uživo, stisni Podmiri. Ti troškovi tada više ne ulaze u račun.</p>`;
    } else if (last) {
      debts = `
        <div class="group-title">Tko kome duguje</div>
        <div class="group">${last.transfers.length ? last.transfers.map((t) => row(t, true)).join('') : '<div class="transfer muted">Svi su bili kvit.</div>'}</div>
        <div class="split-actions"><button class="wide-btn done" disabled>${ICON.check} Sve je podmireno</button></div>
        <p class="hint">Podmireno ${dmy(last.date)} · <button class="text-btn small" data-act="undoSettle">Poništi</button></p>`;
    } else {
      debts = `
        <div class="group-title">Tko kome duguje</div>
        <p class="empty">Još nema troškova za podjelu.</p>`;
    }
  }

  return `
    ${debts}
    <div class="group-title">Ljudi</div>
    <div class="group">
      ${rows}
      <button class="btn-row" data-act="newPerson">${ICON.plus} Dodaj osobu</button>
    </div>
    <p class="hint">${people.length < 2
      ? 'Dodaj barem dvije osobe. Zatim kod svakog troška biraš tko je platio i za koga.'
      : 'Iznosi se odnose na troškove koji još nisu podmireni. Dodirni osobu da joj promijeniš ime.'}</p>
    ${missing ? `<p class="hint warn">${missing} ${plural(missing, 'trošak nema', 'troška nemaju', 'troškova nema')} upisano tko je platio pa ne ulazi u obračun. Dodirni trošak i odaberi.</p>` : ''}
`;
}

/* ---------------- Statistika ---------------- */
function statsView(trip, exps, total) {
  const sums = new Map();
  for (const e of exps) {
    const id = state.categories.some((c) => c.id === e.categoryId) ? e.categoryId : '';
    sums.set(id, (sums.get(id) || 0) + e.amount);
  }
  const cats = state.categories.filter((c) => !c.archived || sums.get(c.id));
  if (sums.get('')) cats.push(UNKNOWN_CAT);
  const rows = cats
    .map((c, i) => ({ c, i, amount: sums.get(c.id) || 0 }))
    .sort((a, b) => b.amount - a.amount || a.i - b.i);

  const pct = (a) => (total ? Math.round((a / total) * 100) : 0);

  return `
    ${total > 0 ? `<div class="pie-wrap">${pieChart(rows, total)}</div>` : `<p class="empty">Još nema troškova za statistiku.</p>`}
    <div class="stat-table">
      <div class="stat-head"><span>${esc(trip.name)}</span><span>${money(total)}</span></div>
      ${rows.map((r) => `
        <div class="stat-row">
          <span class="badge" style="background:${r.c.color};color:${textOn(r.c.color)}">${pct(r.amount)}%</span>
          <span class="stat-name">${esc(r.c.name)}</span>
          <span class="stat-amt">${money(r.amount)}</span>
        </div>`).join('')}
    </div>
    ${personStats(trip, exps, total)}`;
}

let statsPerson = ''; // odabrana osoba u statistici

/** Po osobi: koliko je tko potrošio po kategorijama (svi troškovi, i podmireni) */
function personStats(trip, exps, total) {
  if (trip.people.length < 2 || !total) return '';
  const ids = new Set(trip.people.map((p) => p.id));
  const byPerson = new Map(trip.people.map((p) => [p.id, new Map()]));
  const unassigned = new Map();
  const add = (m, catId, c) => m.set(catId, (m.get(catId) || 0) + c);
  for (const e of exps) {
    const catId = state.categories.some((c) => c.id === e.categoryId) ? e.categoryId : '';
    const parts = !ids.has(e.paidBy) ? []
      : e.shares ? Object.entries(e.shares).filter(([id]) => ids.has(id))
      : (e.split || []).some((id) => ids.has(id)) ? splitShares(e.amount, e.split.filter((id) => ids.has(id))) : [];
    if (!parts.length) { add(unassigned, catId, e.amount); continue; }
    for (const [id, c] of parts) add(byPerson.get(id), catId, c);
  }

  const table = (key, title, color, sums) => {
    const sub = [...sums.values()].reduce((x, y) => x + y, 0);
    const rows = [...state.categories, UNKNOWN_CAT]
      .map((c, i) => ({ c, i, amount: sums.get(c.id) || 0 }))
      .filter((r) => r.amount > 0)
      .sort((x, y) => y.amount - x.amount || x.i - y.i);
    return `
      <div class="stat-table person-table" data-key="${key}"${key === sel ? '' : ' hidden'}>
        <div class="stat-head"><span>${color ? `<i class="pdot" style="background:${color}"></i>` : ''}${esc(title)}</span><span>${money(sub)}</span></div>
        ${rows.length ? rows.map((r) => `
          <div class="stat-row">
            <span class="badge" style="background:${r.c.color};color:${textOn(r.c.color)}">${sub ? Math.round((r.amount / sub) * 100) : 0}%</span>
            <span class="stat-name">${esc(r.c.name)}</span>
            <span class="stat-amt">${money(r.amount)}</span>
          </div>`).join('') : '<div class="stat-row"><span class="stat-name muted">Nema troškova</span></div>'}
      </div>`;
  };

  const tabs = trip.people.map((p) => [p.id, p.name]);
  if (unassigned.size) tabs.push(['-', 'Nije podijeljeno']);
  const sel = tabs.some(([k]) => k === statsPerson) ? statsPerson : tabs[0][0];

  return `
    <div class="group-title">Po osobi</div>
    <div class="chips person-tabs" role="tablist">${tabs.map(([k, name]) => `
      <button type="button" role="tab" class="chip person${k === sel ? ' on' : ''}" data-act="personTab" data-key="${k}">${esc(name)}</button>`).join('')}
    </div>
    ${trip.people.map((p) => table(p.id, p.name, personColor(trip, p.id), byPerson.get(p.id))).join('')}
    ${unassigned.size ? table('-', 'Nije podijeljeno', '', unassigned) : ''}
    ${unassigned.size && sel === '-' ? '<p class="hint">Troškovi kojima nije upisano tko je platio i za koga.</p>' : ''}`;
}

/** Naziv kategorije u najviše 2 reda po ~11 znakova */
function wrapLabel(name, max = 11) {
  const words = name.split(/\s+/).filter(Boolean);
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= max) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  const out = lines.slice(0, 2).map((l) => (l.length > max + 1 ? l.slice(0, max) + '…' : l));
  if (lines.length > 2 && !out[1].endsWith('…')) out[1] += '…';
  return out;
}

function pieChart(rows, total) {
  const W = 400, H = 260, R = 88, CX = W / 2, CY = H / 2;
  const LINE = 16, GAP = 5;
  const f = (n) => n.toFixed(1);
  const parts = rows.filter((r) => r.amount > 0);

  let a = -Math.PI / 2;
  let slices = '', pcts = '';
  const items = [];
  for (const r of parts) {
    const frac = r.amount / total;
    const a2 = a + frac * Math.PI * 2;
    const mid = parts.length === 1 ? -Math.PI / 4 : (a + a2) / 2;
    if (parts.length === 1) {
      slices += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${r.c.color}"/>`;
    } else {
      const x1 = CX + R * Math.cos(a), y1 = CY + R * Math.sin(a);
      const x2 = CX + R * Math.cos(a2), y2 = CY + R * Math.sin(a2);
      slices += `<path d="M${CX} ${CY}L${f(x1)} ${f(y1)}A${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${f(x2)} ${f(y2)}Z" fill="${r.c.color}"/>`;
    }
    if (frac >= 0.06) {
      const pr = parts.length === 1 ? 0 : R * 0.62;
      pcts += `<text class="pct" x="${f(CX + pr * Math.cos(mid))}" y="${f(CY + pr * Math.sin(mid))}" fill="${textOn(r.c.color)}" text-anchor="middle" dominant-baseline="central">${Math.round(frac * 100)}%</text>`;
    }
    items.push({ mid, side: Math.cos(mid) >= 0 ? 1 : -1, lines: wrapLabel(r.c.name) });
    a = a2;
  }

  // Nazivi izvan torte, s linijama; razmakni ih da se ne preklapaju
  let labels = '';
  for (const side of [1, -1]) {
    const list = items
      .filter((it) => it.side === side)
      .map((it) => ({ ...it, h: it.lines.length * LINE, y: CY + (R + 18) * Math.sin(it.mid) }))
      .sort((p, q) => p.y - q.y);
    let prev = -Infinity;
    for (const it of list) { it.top = Math.max(it.y - it.h / 2, prev + GAP, 2); prev = it.top + it.h; }
    let limit = H - 2;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.top + it.h > limit) it.top = limit - it.h;
      limit = it.top - GAP;
    }
    for (const it of list) {
      const ly = it.top + it.h / 2;
      const c = Math.cos(it.mid), s = Math.sin(it.mid);
      const tx = CX + side * (R + 28);
      labels += `<polyline class="lead" points="${f(CX + R * c)},${f(CY + R * s)} ${f(CX + (R + 10) * c)},${f(CY + (R + 10) * s)} ${f(CX + side * (R + 22))},${f(ly)}"/>`;
      labels += `<text class="lbl" text-anchor="${side > 0 ? 'start' : 'end'}">${it.lines.map((l, k) =>
        `<tspan x="${f(tx)}" y="${f(it.top + LINE / 2 + k * LINE)}" dominant-baseline="central">${esc(l)}</tspan>`).join('')}</text>`;
    }
  }

  return `<svg class="pie" viewBox="0 0 ${W} ${H}" role="img" aria-label="Troškovi po kategorijama">
    <g class="slices">${slices}</g>${pcts}${labels}</svg>`;
}

/* ---------------- Postavke ---------------- */
function renderSettings() {
  const cats = activeCats();

  $app.innerHTML = `
    <header class="topbar">
      <a class="text-btn" href="#/">${ICON.left}Putovanja</a>
      <div class="topbar-title">Postavke</div>
      <button class="icon-btn filled" data-act="newCat" aria-label="Nova kategorija">${ICON.plus}</button>
    </header>

    <div class="group-title">Kategorije</div>
    <div class="group">
      ${cats.map((c, i) => {
        return `<div class="srow">
          <button class="srow-main" data-act="editCat" data-id="${c.id}">
            <span class="swatch" style="background:${c.color}"></span>
            <span class="sname">${esc(c.name)}</span>
          </button>
          <button class="icon-btn" data-act="moveCat" data-id="${c.id}" data-dir="-1" aria-label="Pomakni gore" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" data-act="moveCat" data-id="${c.id}" data-dir="1" aria-label="Pomakni dolje" ${i === cats.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon-btn danger" data-act="deleteCat" data-id="${c.id}" aria-label="Obriši">${ICON.trash}</button>
        </div>`;
      }).join('')}
    </div>
    <p class="hint">Novu kategoriju dodaješ s + gore desno. Dodirni kategoriju da joj promijeniš ime ili boju. Strelicama mijenjaš redoslijed u kojem se nude pri unosu troška.</p>

    <div class="group-title">Izgled</div>
    <div class="group">
      <div class="srow pad bg-row">
        <span class="sname">Pozadina</span>
        <div class="bg-pick">${BACKGROUNDS.map(([id, label]) => `
          <button class="bgopt${state.settings.bg === id ? ' on' : ''}" data-act="setBg" data-bg="${id}" aria-pressed="${state.settings.bg === id}">
            <i class="bg-${id}"></i>${label}
          </button>`).join('')}
        </div>
      </div>
      <label class="srow pad">
        <span class="sname">Uzorak s aviončićima</span>
        <input type="checkbox" class="switch" id="pattern-toggle" ${state.settings.pattern ? 'checked' : ''}>
      </label>
    </div>

    <div class="group-title">Podaci</div>
    <div class="group">
      <button class="btn-row" data-act="exportData">${ICON.download} Izvezi sigurnosnu kopiju</button>
      <button class="btn-row" data-act="importData">${ICON.upload} Uvezi iz kopije</button>
    </div>
    <p class="hint">Podaci se čuvaju samo na ovom uređaju. Povremeno izvezi kopiju (npr. u iCloud Drive) da ih ne izgubiš ako promijeniš mobitel.</p>
    <p class="foot">Trip Drip ${APP_VERSION}<br>Made by <a href="https://www.instagram.com/lora.outofoffice/" target="_blank" rel="noopener">Lora Pleško</a>, <a href="https://www.masinerija.com/" target="_blank" rel="noopener">Machinery Agency</a></p>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`;

  document.getElementById('import-file').addEventListener('change', importFile);
  document.getElementById('pattern-toggle').addEventListener('change', (e) => {
    state.settings.pattern = e.target.checked;
    save();
    applyLook();
  });
}

/* ---------------- Izgled (pozadina) ---------------- */
function applyLook() {
  const root = document.documentElement;
  root.dataset.bg = state.settings.bg;
  root.dataset.pattern = state.settings.pattern ? 'on' : 'off';
  const meta = document.querySelector('meta[name="theme-color"]:not([media*="dark"])');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f2f2f7';
}

/* ---------------- Sheet (ploča odozgo) ---------------- */
let sheetCtx = null;

function openSheet(html, ctx) {
  sheetCtx = ctx;
  $sheet.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $sheet.offsetHeight; // pokreni animaciju
  $sheet.classList.add('open');
  document.body.classList.add('locked');
  return $sheet.querySelector('.sheet');
}

function closeSheet(immediate = false) {
  if (!$sheet.innerHTML) return;
  sheetCtx = null;
  $sheet.classList.remove('open');
  document.body.classList.remove('locked');
  if (document.activeElement) document.activeElement.blur();
  if (immediate) { $sheet.innerHTML = ''; return; }
  setTimeout(() => { if (!$sheet.classList.contains('open')) $sheet.innerHTML = ''; }, 260);
}

const sheetHead = (title, saveAct) => `
  <div class="sheet-head">
    <button class="text-btn" data-act="closeSheet">Odustani</button>
    <div class="sheet-title">${title}</div>
    <button class="text-btn bold" data-act="${saveAct}">Spremi</button>
  </div>`;

/* ---------------- Dijalog potvrde ---------------- */
let dialogResolve = null;

function confirmDialog(title, msg, okText = 'Obriši', danger = true) {
  closeDialog(false);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    const el = document.createElement('div');
    el.className = 'dialog-root';
    el.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">
      <div class="dialog-body"><div class="dialog-title">${esc(title)}</div>${msg ? `<div class="dialog-msg">${esc(msg)}</div>` : ''}</div>
      <div class="dialog-btns"><button data-act="dialogNo">Odustani</button><button class="${danger ? 'danger' : 'strong'}" data-act="dialogYes">${esc(okText)}</button></div>
    </div>`;
    document.body.appendChild(el);
  });
}

function closeDialog(result) {
  document.querySelectorAll('.dialog-root').forEach((d) => d.remove());
  if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(result); }
}

/* ---------------- Putovanje: unos / uređivanje ---------------- */
function tripSheet(trip) {
  const t = trip || { name: '', start: todayISO(), end: '' };
  const el = openSheet(`
    ${sheetHead(trip ? 'Uredi putovanje' : 'Novo putovanje', 'saveTrip')}
    <form class="form" data-submit="saveTrip" autocomplete="off">
      <div class="form-group">
        <label class="field"><span>Naziv</span><input name="name" value="${esc(t.name)}" placeholder="npr. Italija" maxlength="60" enterkeyhint="done"></label>
        <label class="field"><span>Od</span><input type="date" name="start" value="${t.start}"></label>
        <label class="field"><span>Do</span><input type="date" name="end" value="${t.end || ''}"></label>
      </div>
      ${trip ? `<button type="button" class="wide-btn danger" data-act="deleteTrip">${ICON.trash} Obriši putovanje</button>` : ''}
    </form>`, { type: 'trip', id: trip?.id });
  if (!trip) el.querySelector('[name=name]').focus({ preventScroll: true });
}

function saveTrip() {
  const f = $sheet.querySelector('form');
  const name = f.name.value.trim();
  const start = f.start.value;
  let end = f.end.value || start;
  if (!name) { toast('Upiši naziv putovanja'); return f.name.focus(); }
  if (!start) { toast('Odaberi početni datum'); return; }
  if (end < start) { toast('Kraj ne može biti prije početka'); return; }

  const id = sheetCtx.id;
  if (id) {
    Object.assign(tripById(id), { name, start, end });
    save();
    closeSheet();
    render();
  } else {
    const t = { id: uid(), name, start, end, people: [], settlements: [], createdAt: Date.now() };
    state.trips.push(t);
    save();
    closeSheet(true);
    location.hash = `#/t/${encodeURIComponent(t.id)}`;
  }
}

async function deleteTrip() {
  const trip = tripById(sheetCtx.id);
  const n = tripExpenses(trip.id).length;
  const ok = await confirmDialog(`Obrisati „${trip.name}”?`,
    n ? `Obrisat će se i ${n} ${plural(n, 'trošak', 'troška', 'troškova')}. Ovo se ne može poništiti.` : 'Ovo se ne može poništiti.');
  if (!ok) return;
  state.trips = state.trips.filter((t) => t.id !== trip.id);
  state.expenses = state.expenses.filter((e) => e.tripId !== trip.id);
  save();
  closeSheet(true);
  location.replace('#/');
}

/* ---------------- Trošak: unos / uređivanje ---------------- */
function expenseSheet(tripId, exp) {
  const e = exp || { date: todayISO(), amount: null, categoryId: '', note: '' };
  const cats = state.categories.filter((c) => !c.archived || c.id === e.categoryId);
  const trip = tripById(tripId);
  const people = trip.people;
  const splitOn = people.length >= 2;
  const allIds = people.map((p) => p.id);
  let payer = people.some((p) => p.id === e.paidBy) ? e.paidBy : '';
  let split = (e.split || []).filter((id) => allIds.includes(id));
  if (splitOn && !exp) {
    // zadano: zadnji platitelj na ovom putovanju, dijeli se na sve
    const last = tripExpenses(tripId).filter((x) => allIds.includes(x.paidBy))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    payer = last ? last.paidBy : allIds[0];
  }
  if (splitOn && !split.length) split = allIds;
  const exact = splitOn && !!e.shares;
  const personChips = (act, isOn) => people.map((p) => `
    <button type="button" class="chip person${isOn(p.id) ? ' on' : ''}" data-act="${act}" data-id="${p.id}">${esc(p.name)}</button>`).join('');
  const splitHtml = splitOn ? `
      <div class="group-title">Tko je platio</div>
      <div class="chips">${personChips('pickPayer', (id) => id === payer)}</div>
      <div class="group-title row"><span>Za koga</span><button type="button" class="text-btn" data-act="splitAll"${exact ? ' hidden' : ''}>Svi</button></div>
      <nav class="seg two">
        <button type="button" class="${exact ? '' : 'on'}" data-act="splitMode" data-mode="equal">Jednako</button>
        <button type="button" class="${exact ? 'on' : ''}" data-act="splitMode" data-mode="exact">Točni iznosi</button>
      </nav>
      <div class="split-equal"${exact ? ' hidden' : ''}>
        <div class="chips">${personChips('toggleSplit', (id) => split.includes(id))}</div>
      </div>
      <div class="split-exact"${exact ? '' : ' hidden'}>
        <div class="form-group">${people.map((p) => `
          <label class="field share"><span>${esc(p.name)}</span><b>€</b><input data-pid="${p.id}" inputmode="decimal" placeholder="0,00" value="${exact && e.shares[p.id] ? amountInput(e.shares[p.id]) : ''}" enterkeyhint="done"></label>`).join('')}
        </div>
        <p class="hint share-left"></p>
      </div>
      <input type="hidden" name="splitMode" value="${exact ? 'exact' : 'equal'}">
      <input type="hidden" name="paidBy" value="${payer}">
      <input type="hidden" name="splitIds" value="${split.join(',')}">
      ${e.settledId ? '<p class="hint ok">✓ Ovaj trošak je već podmiren u obračunu.</p>' : ''}` : '';
  const el = openSheet(`
    ${sheetHead(exp ? 'Uredi trošak' : 'Novi trošak', 'saveExpense')}
    <form class="form" data-submit="saveExpense" autocomplete="off">
      <div class="form-group">
        <label class="field"><span>Datum</span><input type="date" name="date" value="${e.date}"></label>
        <label class="field amount"><span>Iznos</span><b>€</b><input name="amount" inputmode="decimal" placeholder="0,00" value="${e.amount != null ? amountInput(e.amount) : ''}" enterkeyhint="done"></label>
      </div>
      <div class="group-title">Kategorija</div>
      <div class="chips">${cats.map((c) => `
        <button type="button" class="chip${c.id === e.categoryId ? ' on' : ''}" data-act="pickCat" data-id="${c.id}" style="--c:${c.color}">
          <i></i>${esc(c.name)}
        </button>`).join('')}
      </div>
      <input type="hidden" name="categoryId" value="${e.categoryId || ''}">
      ${splitHtml}
      <div class="form-group">
        <label class="field"><textarea name="note" rows="2" placeholder="Bilješka (nije obavezno)" maxlength="300">${esc(e.note)}</textarea></label>
      </div>
      ${exp ? `<button type="button" class="wide-btn danger" data-act="deleteExpense">${ICON.trash} Obriši trošak</button>` : ''}
    </form>`, { type: 'expense', tripId, id: exp?.id });
  if (exact) updateShareLeft();
  if (!exp) el.querySelector('[name=amount]').focus({ preventScroll: true });
}

/** Točni iznosi po osobama iz obrasca: { shares, total, bad } */
function readShares() {
  const shares = {};
  let total = 0, bad = false;
  for (const inp of $sheet.querySelectorAll('[data-pid]')) {
    if (!inp.value.trim()) continue;
    const c = parseAmount(inp.value);
    if (Number.isNaN(c)) { bad = true; continue; }
    if (c > 0) { shares[inp.dataset.pid] = c; total += c; }
  }
  return { shares, total, bad };
}

/** "Preostalo za raspodjelu" ispod točnih iznosa */
function updateShareLeft() {
  const out = $sheet.querySelector('.share-left');
  if (!out) return;
  const amount = parseAmount($sheet.querySelector('[name=amount]').value) || 0;
  const { total } = readShares();
  const left = amount - total;
  out.classList.toggle('warn', left !== 0);
  out.classList.toggle('ok', left === 0 && amount > 0);
  out.textContent = left > 0 ? `Preostalo za raspodjelu: ${money(left)} od ${money(amount)}`
    : left < 0 ? `Upisano je ${money(-left)} previše (ukupno ${money(amount)})`
    : amount > 0 ? `✓ Raspodijeljeno svih ${money(amount)}` : 'Upiši iznos troška i koliko otpada na koga.';
}

function saveExpense() {
  const f = $sheet.querySelector('form');
  const cents = parseAmount(f.amount.value);
  const date = f.date.value;
  const categoryId = f.categoryId.value;
  if (!(cents > 0)) { toast('Upiši iznos'); return f.amount.focus(); }
  if (!categoryId) { toast('Odaberi kategoriju'); return; }
  if (!date) { toast('Odaberi datum'); return; }
  const note = f.note.value.trim();
  const data = { date, amount: cents, categoryId, note };
  const payerEl = f.querySelector('[name=paidBy]');
  if (payerEl) {
    if (!payerEl.value) { toast('Odaberi tko je platio'); return; }
    if (f.querySelector('[name=splitMode]').value === 'exact') {
      const { shares, total, bad } = readShares();
      if (bad) { toast('Neki iznos po osobi nije ispravan'); return; }
      if (total !== cents) { toast(`Iznosi po osobama moraju zbrojeno dati ${money(cents)}`); return; }
      Object.assign(data, { paidBy: payerEl.value, split: Object.keys(shares), shares });
    } else {
      const split = f.querySelector('[name=splitIds]').value.split(',').filter(Boolean);
      if (!split.length) { toast('Odaberi za koga je trošak'); return; }
      Object.assign(data, { paidBy: payerEl.value, split, shares: null });
    }
  }

  if (sheetCtx.id) {
    Object.assign(state.expenses.find((x) => x.id === sheetCtx.id), data);
  } else {
    state.expenses.push({ id: uid(), tripId: sheetCtx.tripId, ...data, createdAt: Date.now() });
  }
  save();
  closeSheet();
  render();
  toast('Spremljeno');
}

async function deleteExpense() {
  const id = sheetCtx.id;
  if (!(await confirmDialog('Obrisati trošak?', 'Ovo se ne može poništiti.'))) return;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  closeSheet();
  render();
}

/* ---------------- Ljudi ---------------- */
function personSheet(trip, p) {
  const el = openSheet(`
    ${sheetHead(p ? 'Uredi osobu' : 'Nova osoba', 'savePerson')}
    <form class="form" data-submit="savePerson" autocomplete="off">
      <div class="form-group">
        <label class="field"><span>Ime</span><input name="name" value="${esc(p?.name || '')}" placeholder="npr. Ana" maxlength="30" enterkeyhint="done"></label>
      </div>
      ${p ? `<button type="button" class="wide-btn danger" data-act="deletePerson">${ICON.trash} Ukloni osobu</button>` : ''}
    </form>`, { type: 'person', tripId: trip.id, id: p?.id });
  if (!p) el.querySelector('[name=name]').focus({ preventScroll: true });
}

function savePerson() {
  const f = $sheet.querySelector('form');
  const name = f.querySelector('[name=name]').value.trim();
  const trip = tripById(sheetCtx.tripId);
  if (!name) { toast('Upiši ime'); return; }
  const clash = trip.people.find((p) => p.id !== sheetCtx.id && p.name.toLocaleLowerCase('hr') === name.toLocaleLowerCase('hr'));
  if (clash) { toast('Ta osoba već postoji'); return; }
  if (sheetCtx.id) trip.people.find((p) => p.id === sheetCtx.id).name = name;
  else trip.people.push({ id: uid(), name });
  save();
  closeSheet();
  render();
}

async function deletePerson() {
  const trip = tripById(sheetCtx.tripId);
  const p = trip.people.find((x) => x.id === sheetCtx.id);
  const used = tripExpenses(trip.id).some((e) => e.paidBy === p.id || (e.split || []).includes(p.id))
    || trip.settlements.some((s) => s.transfers.some((t) => t.from === p.id || t.to === p.id));
  if (used) {
    await confirmDialog(`${p.name} se ne može ukloniti`, 'Osoba je upisana u nekom trošku ili obračunu. Prvo je makni iz tih troškova.', 'U redu', false);
    return;
  }
  if (!(await confirmDialog(`Ukloniti osobu „${p.name}”?`, ''))) return;
  trip.people = trip.people.filter((x) => x.id !== p.id);
  save();
  closeSheet();
  render();
}

/* ---------------- Obračun ---------------- */
function settleText(trip, list) {
  return [`${trip.name} – tko kome duguje`, ...list.map((t) => `${personName(trip, t.from)} → ${personName(trip, t.to)}: ${money(t.amount)}`)].join('\n');
}

async function shareSettle() {
  const trip = tripById(parseHash().id);
  const text = settleText(trip, transfers(trip));
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Kopirano'); } catch { toast('Dijeljenje nije uspjelo'); }
}

async function settleAll() {
  const trip = tripById(parseHash().id);
  const { open } = balances(trip);
  const ok = await confirmDialog('Podmiriti sve?',
    `Potvrdi kad ste dugove riješili uživo. ${open.length} ${plural(open.length, 'trošak', 'troška', 'troškova')} više neće ulaziti u račun. Ovo možeš poništiti.`, 'Podmiri', false);
  if (!ok) return;
  const s = { id: uid(), date: todayISO(), at: Date.now(), transfers: transfers(trip), expenseIds: open.map((e) => e.id) };
  for (const e of open) e.settledId = s.id;
  trip.settlements.push(s);
  save();
  render();
  toast('Podmireno');
}

async function undoSettle() {
  const trip = tripById(parseHash().id);
  const s = trip.settlements[trip.settlements.length - 1];
  if (!s) return;
  const ok = await confirmDialog('Poništiti zadnji obračun?', 'Troškovi iz njega ponovno ulaze u obračun.', 'Poništi', false);
  if (!ok) return;
  for (const e of state.expenses) if (e.settledId === s.id) delete e.settledId;
  trip.settlements.pop();
  save();
  render();
}

/* ---------------- Kategorije ---------------- */
function categorySheet(cat) {
  const used = new Set(activeCats().map((c) => c.color));
  const color = cat?.color || PALETTE.find((p) => !used.has(p)) || PALETTE[0];
  const el = openSheet(`
    ${sheetHead(cat ? 'Uredi kategoriju' : 'Nova kategorija', 'saveCat')}
    <form class="form" data-submit="saveCat" autocomplete="off">
      <div class="form-group">
        <label class="field"><span>Naziv</span><input name="name" value="${esc(cat?.name || '')}" placeholder="npr. Ulaznice" maxlength="40" enterkeyhint="done"></label>
      </div>
      <div class="group-title">Boja</div>
      <div class="palette">${PALETTE.map((p) => `
        <button type="button" class="color${p === color ? ' on' : ''}" data-act="pickColor" data-color="${p}" style="background:${p}" aria-label="Boja ${p}">${ICON.check}</button>`).join('')}
      </div>
      <input type="hidden" name="color" value="${color}">
    </form>`, { type: 'cat', id: cat?.id });
  if (!cat) el.querySelector('[name=name]').focus({ preventScroll: true });
}

function saveCat() {
  const f = $sheet.querySelector('form');
  const name = f.name.value.trim();
  const color = f.color.value;
  if (!name) { toast('Upiši naziv kategorije'); return f.name.focus(); }
  const clash = activeCats().find((c) => c.id !== sheetCtx.id && c.name.toLocaleLowerCase('hr') === name.toLocaleLowerCase('hr'));
  if (clash) { toast('Ta kategorija već postoji'); return; }
  if (sheetCtx.id) Object.assign(catById(sheetCtx.id), { name, color });
  else state.categories.push({ id: uid(), name, color });
  save();
  closeSheet();
  render();
}

async function deleteCat(id) {
  const c = catById(id);
  const n = state.expenses.filter((e) => e.categoryId === id).length;
  const ok = await confirmDialog(`Obrisati kategoriju „${c.name}”?`,
    n ? `Koristi se u ${n} ${plural(n, 'trošku', 'troška', 'troškova')}. Ti troškovi ostaju i dalje se vide u statistici, ali kategorija se više neće nuditi za nove unose.` : '');
  if (!ok) return;
  if (n) c.archived = true;
  else state.categories = state.categories.filter((x) => x.id !== id);
  save();
  render();
}

function moveCat(id, dir) {
  const active = activeCats();
  const i = active.findIndex((c) => c.id === id);
  const other = active[i + dir];
  if (!other) return;
  const a = state.categories.indexOf(active[i]);
  const b = state.categories.indexOf(other);
  [state.categories[a], state.categories[b]] = [state.categories[b], state.categories[a]];
  save();
  render();
}

/* ---------------- Sigurnosna kopija ---------------- */
async function exportData() {
  const data = JSON.stringify({ app: 'trip-drip', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const name = `trip-drip-${todayISO()}.json`;
  const file = new File([data], name, { type: 'application/json' });
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Trip Drip kopija' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!Array.isArray(data.trips) || !Array.isArray(data.expenses) || !Array.isArray(data.categories)) throw new Error('format');
  } catch {
    toast('To nije ispravna Trip Drip kopija');
    return;
  }
  const n = data.trips.length;
  const ok = await confirmDialog('Zamijeniti sve podatke?',
    `Kopija sadrži ${n} ${plural(n, 'putovanje', 'putovanja', 'putovanja')} i ${data.expenses.length} ${plural(data.expenses.length, 'trošak', 'troška', 'troškova')}. Sadašnji podaci na uređaju bit će zamijenjeni.`,
    'Zamijeni');
  if (!ok) return;
  state = normalize(data);
  save();
  applyLook();
  toast('Podaci su uvezeni');
  render();
}

/* ---------------- Akcije ---------------- */
const ACTIONS = {
  goSettings: () => { location.hash = '#/settings'; },
  newTrip: () => tripSheet(null),
  editTrip: () => tripSheet(tripById(parseHash().id)),
  saveTrip,
  deleteTrip,
  tab: (el) => {
    const r = parseHash();
    location.replace(`#/t/${encodeURIComponent(r.id)}${el.dataset.tab === 'list' ? '' : '/' + el.dataset.tab}`);
  },
  newPerson: () => personSheet(tripById(parseHash().id), null),
  editPerson: (el) => {
    const trip = tripById(parseHash().id);
    personSheet(trip, trip.people.find((p) => p.id === el.dataset.id));
  },
  savePerson,
  deletePerson,
  pickPayer: (el) => {
    el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el));
    $sheet.querySelector('[name=paidBy]').value = el.dataset.id;
  },
  toggleSplit: (el) => {
    el.classList.toggle('on');
    $sheet.querySelector('[name=splitIds]').value =
      [...el.parentElement.querySelectorAll('.chip.on')].map((c) => c.dataset.id).join(',');
  },
  personTab: (el) => {
    statsPerson = el.dataset.key;
    render();
  },
  splitMode: (el) => {
    const exact = el.dataset.mode === 'exact';
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    $sheet.querySelector('[name=splitMode]').value = el.dataset.mode;
    $sheet.querySelector('.split-equal').hidden = exact;
    $sheet.querySelector('.split-exact').hidden = !exact;
    $sheet.querySelector('[data-act=splitAll]').hidden = exact;
    if (exact) {
      // prvi put: popuni jednakim dijelovima za odabrane osobe
      const inputs = [...$sheet.querySelectorAll('[data-pid]')];
      const amount = parseAmount($sheet.querySelector('[name=amount]').value);
      const ids = $sheet.querySelector('[name=splitIds]').value.split(',').filter(Boolean);
      if (amount > 0 && ids.length && inputs.every((i) => !i.value.trim())) {
        const parts = new Map(splitShares(amount, ids));
        for (const i of inputs) i.value = parts.has(i.dataset.pid) ? amountInput(parts.get(i.dataset.pid)) : '';
      }
      updateShareLeft();
    }
  },
  splitAll: () => {
    const chips = [...$sheet.querySelectorAll('.split-equal .chip')];
    chips.forEach((c) => c.classList.add('on'));
    $sheet.querySelector('[name=splitIds]').value = chips.map((c) => c.dataset.id).join(',');
  },
  shareSettle,
  settleAll,
  undoSettle,
  newExpense: () => expenseSheet(parseHash().id, null),
  editExpense: (el) => expenseSheet(parseHash().id, state.expenses.find((e) => e.id === el.dataset.id)),
  saveExpense,
  deleteExpense,
  pickCat: (el) => {
    el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el));
    $sheet.querySelector('[name=categoryId]').value = el.dataset.id;
  },
  newCat: () => categorySheet(null),
  editCat: (el) => categorySheet(catById(el.dataset.id)),
  saveCat,
  deleteCat: (el) => deleteCat(el.dataset.id),
  moveCat: (el) => moveCat(el.dataset.id, Number(el.dataset.dir)),
  pickColor: (el) => {
    el.parentElement.querySelectorAll('.color').forEach((c) => c.classList.toggle('on', c === el));
    $sheet.querySelector('[name=color]').value = el.dataset.color;
  },
  setBg: (el) => {
    state.settings.bg = el.dataset.bg;
    save();
    applyLook();
    render();
  },
  exportData,
  importData: () => document.getElementById('import-file').click(),
  closeSheet: () => closeSheet(),
  dialogYes: () => closeDialog(true),
  dialogNo: () => closeDialog(false),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  ACTIONS[e.target.dataset.submit]?.();
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[data-pid], #sheet-root [name=amount]')) updateShareLeft();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.dialog-root')) closeDialog(false);
  else closeSheet();
});

/* ---------------- Start ---------------- */
applyLook();
render();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
