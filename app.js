'use strict';
/* 旅費記帳 —— 純前端、離線可用。資料存在瀏覽器 localStorage。 */

/* ========== 常數 ========== */
const STORE_KEY = 'travelLedger.v1';
const RATE_TTL = 6 * 3600 * 1000;           // 超過 6 小時自動重抓匯率
const DEFAULT_FEE = 1.5;                    // 預設海外刷卡手續費 %

const CATS = [
  { id: 'food',      name: '餐飲',     icon: '🍜', color: '#e8743b' },
  { id: 'transport', name: '交通',     icon: '🚆', color: '#3b82c4' },
  { id: 'lodging',   name: '住宿',     icon: '🏨', color: '#7c5cbf' },
  { id: 'shopping',  name: '購物',     icon: '🛍️', color: '#d9468f' },
  { id: 'fun',       name: '娛樂門票', icon: '🎟️', color: '#2fa87a' },
  { id: 'telecom',   name: '通訊網路', icon: '📶', color: '#1fa2b8' },
  { id: 'souvenir',  name: '伴手禮',   icon: '🎁', color: '#c99a1a' },
  { id: 'medical',   name: '醫療保險', icon: '💊', color: '#d64545' },
  { id: 'other',     name: '其他',     icon: '📝', color: '#8a94a3' },
];
const PAYS = [
  { id: 'cash',   name: '現金',     icon: '💴', color: '#2fa87a' },
  { id: 'card',   name: '信用卡',   icon: '💳', color: '#3b82c4' },
  { id: 'mobile', name: '行動支付', icon: '📱', color: '#d9468f' },
];
const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
const payOf = id => PAYS.find(p => p.id === id) || PAYS[0];

const CURRENCIES = ['TWD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP', 'CNY', 'HKD', 'MOP', 'THB', 'VND', 'SGD', 'MYR', 'IDR',
  'PHP', 'AUD', 'NZD', 'CAD', 'CHF', 'TRY', 'AED', 'INR', 'CZK', 'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'MXN', 'BRL',
  'ZAR', 'EGP', 'ISK', 'ILS'];
const SYM = { TWD: 'NT$', JPY: 'JP¥', CNY: 'CN¥', USD: 'US$', EUR: '€', GBP: '£', KRW: '₩', HKD: 'HK$', THB: '฿',
  SGD: 'S$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$', VND: '₫', MYR: 'RM ', PHP: '₱', IDR: 'Rp ', MOP: 'MOP$' };
const ZERO_DEC = new Set(['TWD', 'JPY', 'KRW', 'VND', 'IDR', 'HUF', 'ISK']);

/* ========== 小工具 ========== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const decOf = c => (ZERO_DEC.has(c) ? 0 : 2);
const fmtNum = (n, d) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n, cur, d = decOf(cur)) => {
  const s = (SYM[cur] ?? cur + ' ') + fmtNum(Math.abs(n), d);
  return n < 0 ? '-' + s : s;
};
// 小額（如匯率換算結果）需要更多小數位
const moneySmart = (n, cur) => money(n, cur, Math.abs(n) < 1 ? 4 : Math.abs(n) < 100 ? 2 : decOf(cur));
const rateStr = r => String(+r.toPrecision(5));
const compact = v => (v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const dn = (() => { try { return new Intl.DisplayNames(['zh-TW'], { type: 'currency' }); } catch { return null; } })();
const curName = c => { try { return dn ? dn.of(c) : c; } catch { return c; } };

const pad = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateStr(new Date());
const toDate = s => new Date(s + 'T00:00:00');
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
const dayLabel = s => toDate(s).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
const shortDay = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(toDate(s).getTime());
const ago = ts => {
  if (!ts) return '尚未取得';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return m + ' 分鐘前';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' 小時前' : Math.round(h / 24) + ' 天前';
};

/* ========== 資料 ========== */
let S = loadState();
const ui = { tab: 'ledger', filter: 'all', conv: { amount: '1000', from: null, to: null }, fxBusy: false };
let sheetHook = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.trips)) return { v: 1, current: null, fx: { rates: {}, updatedAt: 0, source: '' }, ...d };
    }
  } catch { /* 忽略，使用空資料 */ }
  return { v: 1, trips: [], current: null, fx: { rates: {}, updatedAt: 0, source: '' } };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch { toast('儲存失敗：瀏覽器儲存空間不足或被停用，請先匯出備份'); }
}
const curTrip = () => S.trips.find(t => t.id === S.current) || S.trips[0] || null;

function newTrip(p) {
  return {
    id: uid(), name: p.name, home: p.home, currencies: p.currencies || [], start: p.start || '', end: p.end || '',
    budget: p.budget || 0, dailyBudget: p.dailyBudget || 0, feePct: p.feePct ?? DEFAULT_FEE, manualRates: {},
    people: [{ id: 'me', name: '我' }],   // 預留：之後做分帳用
    expenses: [], createdAt: Date.now(),
  };
}

/* ========== 匯率 ========== */
function liveRate(a, b) {
  if (a === b) return 1;
  const r = S.fx.rates;
  return r[a] && r[b] ? r[b] / r[a] : null;
}
// a → b 的匯率；涉及結帳幣別時優先採用本旅程的自訂匯率
function pairRate(t, a, b) {
  if (a === b) return 1;
  if (b === t.home && t.manualRates?.[a] > 0) return t.manualRates[a];
  if (a === t.home && t.manualRates?.[b] > 0) return 1 / t.manualRates[b];
  return liveRate(a, b);
}
function rateInfo(t, cur) {
  if (cur === t.home) return { rate: 1, src: 'same' };
  if (t.manualRates?.[cur] > 0) return { rate: t.manualRates[cur], src: 'manual' };
  const l = liveRate(cur, t.home);
  return l ? { rate: l, src: 'auto' } : { rate: null, src: 'none' };
}

const getJson = async url => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
};
async function fetchRates() {
  const sources = [
    async () => {
      const j = await getJson('https://open.er-api.com/v6/latest/USD');
      if (j.result !== 'success' || !j.rates?.TWD) throw new Error('bad data');
      return { rates: j.rates, source: 'ExchangeRate-API' };
    },
    async () => {
      const j = await getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
      const rates = {};
      for (const [k, v] of Object.entries(j.usd || {})) rates[k.toUpperCase()] = v;
      if (!rates.TWD) throw new Error('bad data');
      return { rates, source: 'fawazahmed0/currency-api' };
    },
  ];
  for (const s of sources) { try { return await s(); } catch { /* 換下一個來源 */ } }
  throw new Error('all sources failed');
}
async function refreshRates(manual = false) {
  if (ui.fxBusy) return;
  ui.fxBusy = true; renderTop();
  try {
    const { rates, source } = await fetchRates();
    S.fx = { rates, source, updatedAt: Date.now() };
    save();
    if (manual) toast('匯率已更新');
    if (sheetHook?.onRates) sheetHook.onRates();
  } catch {
    if (manual) toast(navigator.onLine ? '匯率更新失敗，先沿用上次的匯率' : '目前離線，使用上次儲存的匯率');
  } finally {
    ui.fxBusy = false; render();
  }
}

/* ========== 計算 ========== */
function calc(e) {
  const base = e.amount * e.rate;
  const fee = base * (e.feePct || 0) / 100;
  return { base, fee, total: base + fee };
}
function stats(t) {
  const byCat = {}, byDay = {}, byPay = {}, byCur = {};
  let total = 0, fees = 0;
  for (const e of t.expenses) {
    const c = calc(e);
    total += c.total; fees += c.fee;
    byCat[e.cat] = (byCat[e.cat] || 0) + c.total;
    byDay[e.date] = (byDay[e.date] || 0) + c.total;
    byPay[e.pay] = (byPay[e.pay] || 0) + c.total;
    const x = byCur[e.cur] || (byCur[e.cur] = { native: 0, home: 0, n: 0 });
    x.native += e.amount; x.home += c.total; x.n++;
  }
  return { total, fees, byCat, byDay, byPay, byCur, count: t.expenses.length };
}
const tripDays = t => (t.start && t.end && t.end >= t.start ? dayDiff(t.start, t.end) + 1 : 0);
const dailyBudget = t => (t.dailyBudget > 0 ? t.dailyBudget : (t.budget > 0 && tripDays(t) ? t.budget / tripDays(t) : 0));
function budgetState(t, total) {
  if (!(t.budget > 0)) return null;
  const p = total / t.budget;
  return { p, left: t.budget - total, level: p >= 1 ? 'over' : p >= 0.8 ? 'warn' : 'ok' };
}

/* ========== 畫面：共用 ========== */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function render() {
  renderTop();
  const t = curTrip();
  $('#fab').classList.toggle('hidden', !t || ui.tab === 'settings');
  document.querySelectorAll('#nav button').forEach(b => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const main = $('#main');
  if (!t) { main.innerHTML = viewEmpty(); return; }
  const views = { ledger: viewLedger, stats: viewStats, rates: viewRates, settings: viewSettings };
  main.innerHTML = views[ui.tab](t);
  if (ui.tab === 'rates') bindConverter(t);
}

function renderTop() {
  const t = curTrip();
  const stale = !S.fx.updatedAt || Date.now() - S.fx.updatedAt > 24 * 3600 * 1000;
  const fx = ui.fxBusy ? '匯率更新中…' : S.fx.updatedAt ? `匯率 ${ago(S.fx.updatedAt)} ⟳` : '尚無匯率 ⟳';
  $('#top').innerHTML = `
    <button class="tripbtn" data-act="trips" aria-label="切換旅程"><span aria-hidden="true">✈️</span><span class="name">${esc(t ? t.name : '旅費記帳')}</span><span aria-hidden="true">▾</span></button>
    <button class="fxpill${stale && !ui.fxBusy ? ' stale' : ''}" data-act="refresh" aria-label="更新匯率">${fx}</button>`;
}

function viewEmpty() {
  return `<section class="card empty">
    <div class="em" aria-hidden="true">🧳</div>
    <h2>開始你的第一趟旅程</h2>
    <p>建立旅程、設定幣別與預算，就能開始記帳。</p>
    <div class="btn-row stretch"><button class="btn primary" data-act="newTrip">建立旅程</button><button class="btn" data-act="sample">載入範例</button></div>
  </section>`;
}

/* ========== 畫面：明細 ========== */
function viewLedger(t) {
  const st = stats(t), b = budgetState(t, st.total), today = todayStr();
  const db = dailyBudget(t), todayTotal = st.byDay[today] || 0;
  const alerts = [];
  if (b?.level === 'over') alerts.push(`<div class="alert over" role="alert">⚠️ 已超出總預算 ${money(-b.left, t.home)}</div>`);
  else if (b?.level === 'warn') alerts.push(`<div class="alert warn" role="alert">已使用 ${pct(st.total, t.budget)}% 預算，剩餘 ${money(b.left, t.home)}</div>`);
  if (db > 0 && todayTotal > db) alerts.push(`<div class="alert over" role="alert">⚠️ 今日已超出每日預算 ${money(todayTotal - db, t.home)}</div>`);

  const summary = `<section class="card sum" aria-label="花費摘要">
    <div class="lbl">總花費（${esc(t.home)}，含手續費）</div>
    <div class="big">${money(st.total, t.home)}</div>
    ${b ? `<div class="bar ${b.level}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, pct(st.total, t.budget))}" aria-label="預算使用比例"><i style="width:${Math.min(100, b.p * 100)}%"></i></div>
    <div class="row"><span>預算 ${money(t.budget, t.home)}</span><span>${b.left >= 0 ? '剩餘 ' + money(b.left, t.home) : '超支 ' + money(-b.left, t.home)}</span></div>` : ''}
    <div class="row"><span>今日 ${money(todayTotal, t.home)}</span>${db > 0 ? `<span class="muted">每日預算 ${money(db, t.home)}</span>` : ''}</div>
  </section>${alerts.join('')}`;

  const used = CATS.filter(c => t.expenses.some(e => e.cat === c.id));
  const filters = used.length ? `<div class="filters" role="group" aria-label="依分類篩選">
    <button class="fchip" data-act="filter" data-v="all" aria-pressed="${ui.filter === 'all'}">全部</button>
    ${used.map(c => `<button class="fchip" data-act="filter" data-v="${c.id}" aria-pressed="${ui.filter === c.id}">${c.icon} ${c.name}</button>`).join('')}
  </div>` : '';

  const rows = t.expenses.filter(e => ui.filter === 'all' || e.cat === ui.filter);
  let list;
  if (!t.expenses.length) {
    list = `<section class="card empty"><div class="em" aria-hidden="true">📒</div><p>還沒有任何花費。<br>點右下角的 ＋ 記下第一筆！</p></section>`;
  } else if (!rows.length) {
    list = `<section class="card empty"><p>這個分類沒有花費。</p></section>`;
  } else {
    const days = [...new Set(rows.map(e => e.date))].sort().reverse();
    list = days.map(d => {
      const items = rows.filter(e => e.date === d).sort((a, b) => b.createdAt - a.createdAt);
      const sum = items.reduce((s, e) => s + calc(e).total, 0);
      return `<section class="day"><div class="day-h"><span>${dayLabel(d)}</span><b>${money(sum, t.home)}</b></div><div class="list">${items.map(e => itemRow(t, e)).join('')}</div></section>`;
    }).join('');
  }
  return summary + filters + list;
}

function itemRow(t, e) {
  const c = catOf(e.cat), p = payOf(e.pay), k = calc(e);
  const sub = [c.name, p.name, k.fee > 0 ? `含手續費 ${e.feePct}%` : ''].filter(Boolean).join(' · ');
  return `<button class="item" data-act="edit" data-id="${esc(e.id)}" aria-label="編輯：${esc(e.note || c.name)}，${money(k.total, t.home)}">
    <span class="ico" style="background:color-mix(in srgb, ${c.color} 18%, transparent)" aria-hidden="true">${c.icon}</span>
    <span class="mid"><b>${esc(e.note || c.name)}</b><small>${esc(sub)}</small></span>
    <span class="amt"><b>${money(k.total, t.home)}</b>${e.cur !== t.home ? `<small>${money(e.amount, e.cur)}</small>` : ''}</span>
  </button>`;
}

/* ========== 畫面：統計 ========== */
function viewStats(t) {
  const st = stats(t);
  if (!st.count) return `<section class="card empty"><div class="em" aria-hidden="true">📊</div><p>記幾筆花費後，這裡會出現圖表。</p></section>`;
  const today = todayStr(), nDays = tripDays(t);
  const dayVals = Object.entries(st.byDay);
  const peak = dayVals.reduce((a, b) => (b[1] > a[1] ? b : a));
  let elapsed = dayVals.length;
  if (t.start && today >= t.start) elapsed = Math.max(1, Math.min(nDays || Infinity, dayDiff(t.start, today) + 1));
  const avg = st.total / elapsed;
  const active = nDays && t.start && today >= t.start && today <= t.end;
  const forecast = active ? avg * nDays : 0;
  const b = budgetState(t, st.total);

  const kpis = `<section class="card"><h2>總覽</h2><div class="kpis">
    <div class="kpi"><small>總花費</small><b>${money(st.total, t.home)}</b></div>
    <div class="kpi"><small>平均每日</small><b>${money(avg, t.home)}</b></div>
    <div class="kpi"><small>最高單日（${shortDay(peak[0])}）</small><b>${money(peak[1], t.home)}</b></div>
    <div class="kpi"><small>刷卡手續費合計</small><b>${money(st.fees, t.home)}</b></div>
    ${forecast ? `<div class="kpi"><small>依目前速度預估總花費</small><b>${money(forecast, t.home)}</b></div>` : ''}
    ${b ? `<div class="kpi"><small>預算${b.left >= 0 ? '剩餘' : '超支'}</small><b style="color:var(--${b.level === 'ok' ? 'ok' : b.level === 'warn' ? 'warn' : 'danger'})">${money(Math.abs(b.left), t.home)}</b></div>` : `<div class="kpi"><small>筆數</small><b>${st.count} 筆</b></div>`}
  </div></section>`;

  const items = CATS.map(c => ({ ...c, v: st.byCat[c.id] || 0 })).filter(c => c.v > 0).sort((a, b) => b.v - a.v);
  const cat = `<section class="card"><h2>分類花費</h2><div class="donut-wrap">${donut(items, st.total, t.home)}
    <ul class="legend">${items.map(i => `<li><span class="dot" style="background:${i.color}"></span><span class="nm">${i.icon} ${i.name}</span><span class="pc">${pct(i.v, st.total)}%</span><span class="vl">${money(i.v, t.home)}</span></li>`).join('')}</ul></div></section>`;

  const daily = `<section class="card"><h2>每日花費</h2>${dailyChart(t, st)}</section>`;

  const payItems = PAYS.map(p => ({ ...p, v: st.byPay[p.id] || 0 })).filter(p => p.v > 0);
  const pay = `<section class="card"><h2>付款方式</h2>
    <div class="stack" role="img" aria-label="${payItems.map(p => `${p.name} ${pct(p.v, st.total)}%`).join('，')}">${payItems.map(p => `<i style="width:${p.v / st.total * 100}%;background:${p.color}" title="${p.name}"></i>`).join('')}</div>
    <div class="stack-legend">${payItems.map(p => `<span><span class="dot" style="background:${p.color}"></span>${p.name} ${money(p.v, t.home)}（${pct(p.v, st.total)}%）</span>`).join('')}</div></section>`;

  const curs = Object.entries(st.byCur).sort((a, b) => b[1].home - a[1].home);
  const byCur = curs.length > 1 || (curs[0] && curs[0][0] !== t.home) ? `<section class="card"><h2>各幣別花費</h2><table class="tbl">
    <thead><tr><th>幣別</th><th class="r">原幣合計</th><th class="r">折合 ${esc(t.home)}</th></tr></thead>
    <tbody>${curs.map(([c, x]) => `<tr><td>${c} <small>${x.n} 筆</small></td><td class="r">${money(x.native, c)}</td><td class="r">${money(x.home, t.home)}</td></tr>`).join('')}</tbody></table></section>` : '';
  return kpis + cat + daily + pay + byCur;
}

function donut(items, total, home) {
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const gap = items.length > 1 ? 1.5 : 0;
  const segs = items.map(i => {
    const len = i.v / total * C;
    const s = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${i.color}" stroke-width="28" stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"><title>${esc(i.name)} ${money(i.v, home)}</title></circle>`;
    off += len; return s;
  }).join('');
  return `<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="分類花費圓環圖">${segs}<text class="dl" x="100" y="96">總計</text><text class="dv" x="100" y="117">${money(total, home)}</text></svg>`;
}

function dailyChart(t, st) {
  const dates = Object.keys(st.byDay).sort();
  let from = dates[0], to = dates[dates.length - 1];
  if (t.start) from = t.start < from ? t.start : from;
  if (t.end && t.end >= t.start) to = t.end > to ? t.end : to;
  const days = [];
  for (let d = from; d <= to && days.length < 120; d = addDays(d, 1)) days.push(d);
  const db = dailyBudget(t);
  const max = Math.max(...days.map(d => st.byDay[d] || 0), db * 1.1, 1);
  const H = 170, top = 22, bot = 24, plotH = H - top - bot;
  const fit = days.length <= 10;
  const step = fit ? Math.floor(320 / days.length) : 34, bw = Math.min(26, step - 8);
  const W = days.length * step + 12;
  const y = v => top + plotH - (v / max) * plotH;
  const bars = days.map((d, i) => {
    const v = st.byDay[d] || 0, x = 6 + i * step + (step - bw) / 2;
    const cls = db > 0 && v > db ? 'bar-over' : 'bar-ok';
    return `<g><rect class="${cls}" x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(v ? plotH * v / max : 0, v ? 2 : 0)}" rx="4"><title>${dayLabel(d)}：${money(v, t.home)}</title></rect>
      ${v && fit ? `<text class="val" x="${x + bw / 2}" y="${y(v) - 4}">${compact(v)}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 8}">${shortDay(d)}</text></g>`;
  }).join('');
  const line = db > 0 ? `<line class="bline" x1="0" x2="${W}" y1="${y(db)}" y2="${y(db)}"/><text class="bl" x="${W - 4}" y="${y(db) - 4}">每日預算 ${compact(db)}</text>` : '';
  const note = db > 0 ? '<small class="muted">紅色長條代表當日超過每日預算。</small>' : '';
  return `<div class="scroll-x"><svg class="bars${fit ? ' fit' : ''}" viewBox="0 0 ${W} ${H}" ${fit ? '' : `width="${W}"`} role="img" aria-label="每日花費長條圖">
    <line class="grid" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>${bars}${line}</svg></div>${note}`;
}

/* ========== 畫面：匯率 ========== */
function currencyOptions(t, sel) {
  const pinned = [...new Set([...t.currencies, t.home, sel].filter(Boolean))];
  const rest = CURRENCIES.filter(c => !pinned.includes(c));
  const opt = c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c} ${esc(curName(c))}</option>`;
  return `<optgroup label="本次旅程">${pinned.map(opt).join('')}</optgroup><optgroup label="其他幣別">${rest.map(opt).join('')}</optgroup>`;
}

function viewRates(t) {
  const c = ui.conv;
  if (!c.from) c.from = t.currencies[0] || 'USD';
  if (!c.to) c.to = t.home;
  const foreign = [...new Set([...t.currencies, ...t.expenses.map(e => e.cur)])].filter(x => x !== t.home);
  const rows = foreign.map(cur => {
    const live = liveRate(cur, t.home), man = t.manualRates?.[cur];
    const eff = man > 0 ? man : live;
    return `<div class="rate-row">
      <div class="cur">${cur}<small>${esc(curName(cur))}</small>${man > 0 ? '<span class="badge manual">自訂</span>' : ''}</div>
      <label class="f" style="grid-row:span 2"><span class="sr" style="position:absolute;left:-9999px">${cur} 自訂匯率</span>
        <input inputmode="decimal" data-rate-cur="${cur}" value="${man > 0 ? rateStr(man) : ''}" placeholder="${live ? rateStr(live) : '手動輸入'}" aria-label="${cur} 自訂匯率"></label>
      <div class="muted">${eff ? `1 ${cur} = ${rateStr(eff)} ${t.home}　·　100 ${cur} = ${moneySmart(eff * 100, t.home)}` : '尚無匯率資料'}</div>
    </div>`;
  }).join('');
  return `<section class="card"><h2>快速換算</h2>
    <div class="conv">
      <input id="cvAmt" inputmode="decimal" value="${esc(c.amount)}" aria-label="金額" autocomplete="off">
      <div class="sw">
        <select id="cvFrom" aria-label="從">${currencyOptions(t, c.from)}</select>
        <button class="btn sm" data-act="swap" aria-label="對調幣別" style="padding:0">⇄</button>
        <select id="cvTo" aria-label="到">${currencyOptions(t, c.to)}</select>
      </div>
    </div>
    <div class="conv-out" id="cvOut" aria-live="polite"></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th id="cvTh1"></th><th class="r" id="cvTh2"></th></tr></thead><tbody id="cvTbl"></tbody></table>
  </section>
  <section class="card"><h2>本旅程匯率</h2>
    <p class="hint" style="margin:-4px 0 8px">預設使用即時匯率。若你實際換匯或刷卡的匯率不同，可在右側填入自訂匯率（1 外幣 = ? ${esc(t.home)}），新增花費時會自動套用。</p>
    ${rows || '<p class="muted">尚未設定外幣。請到「設定」編輯旅程並加入旅遊幣別。</p>'}
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="refresh">立即更新匯率</button></div>
    <p class="hint">匯率來源：${esc(S.fx.source || '—')}，${ago(S.fx.updatedAt)}更新。此為參考中間價，實際刷卡與換匯匯率會略有差異。</p>
  </section>`;
}

function bindConverter(t) {
  const c = ui.conv, out = $('#cvOut'), tbl = $('#cvTbl');
  const update = () => {
    c.amount = $('#cvAmt').value; c.from = $('#cvFrom').value; c.to = $('#cvTo').value;
    const amt = parseNum(c.amount), r = pairRate(t, c.from, c.to);
    if (r == null) { out.innerHTML = '<span class="muted">尚無匯率資料，請先更新匯率。</span>'; tbl.innerHTML = ''; return; }
    out.innerHTML = Number.isFinite(amt)
      ? `<div class="big">${moneySmart(amt * r, c.to)}</div><small class="muted">${moneySmart(amt, c.from)} · 1 ${c.from} = ${rateStr(r)} ${c.to}</small>`
      : '<small class="muted">請輸入金額</small>';
    $('#cvTh1').textContent = c.from; $('#cvTh2').textContent = c.to;
    const steps = ZERO_DEC.has(c.from) ? [100, 500, 1000, 3000, 5000, 10000, 50000] : [1, 5, 10, 50, 100, 500, 1000];
    tbl.innerHTML = steps.map(n => `<tr><td>${money(n, c.from)}</td><td class="r">${moneySmart(n * r, c.to)}</td></tr>`).join('');
  };
  ['#cvAmt', '#cvFrom', '#cvTo'].forEach(s => $(s).addEventListener('input', update));
  update();
}

/* ========== 畫面：設定 ========== */
function viewSettings(t) {
  return `<section class="card"><h2>旅程</h2>
    ${S.trips.map(x => `<button class="list-btn" data-act="switchTrip" data-id="${esc(x.id)}" aria-label="切換到 ${esc(x.name)}"><span class="t"><b>${esc(x.name)}</b><small>${x.start ? esc(x.start) + ' ～ ' + esc(x.end || '') + ' · ' : ''}${x.expenses.length} 筆 · ${esc(x.home)}</small></span>${x.id === t.id ? '<span class="ck">使用中</span>' : ''}</button>`).join('')}
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="newTrip">＋ 新增旅程</button><button class="btn" data-act="editTrip">編輯目前旅程</button><button class="btn danger" data-act="delTrip">刪除目前旅程</button></div>
  </section>
  <section class="card"><h2>資料匯出與備份</h2>
    <div class="btn-row stretch"><button class="btn" data-act="exportCsv">匯出 CSV（Excel 可開）</button><button class="btn" data-act="exportJson">備份全部資料</button></div>
    <div class="btn-row stretch" style="margin-top:8px"><button class="btn" data-act="importJson">匯入備份檔</button><button class="btn" data-act="sample">載入範例旅程</button></div>
    <p class="hint">資料只存在這台裝置的瀏覽器中，清除瀏覽器資料會一併消失，建議旅程結束後備份。</p>
  </section>
  <section class="card"><h2>關於</h2>
    <p class="hint" style="margin:0">匯率來源：${esc(S.fx.source || '尚未取得')}。手續費預設 ${t.feePct}%，可在「編輯旅程」修改，也可每筆單獨調整。<br>把網頁「加入主畫面」即可像 App 一樣使用，沒網路時也能記帳。</p>
  </section>`;
}

/* ========== 彈出表單 ========== */
const sheet = $('#sheet');
function openSheet(html, hook) {
  sheet.innerHTML = html; sheetHook = hook || null;
  if (!sheet.open) sheet.showModal();
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('close', () => { sheetHook = null; });
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

function openExpenseSheet(id) {
  const t = curTrip(); if (!t) return;
  const ex = id ? t.expenses.find(e => e.id === id) : null;
  const last = [...t.expenses].sort((a, b) => b.createdAt - a.createdAt)[0];
  const m = {
    cur: ex?.cur ?? last?.cur ?? t.currencies[0] ?? t.home,
    cat: ex?.cat ?? 'food',
    pay: ex?.pay ?? last?.pay ?? 'card',
    rate: ex?.rate ?? null, rateEdited: !!ex, feeEdited: !!ex, src: 'auto',
  };
  const defFee = pay => (pay === 'cash' ? 0 : t.feePct);
  const feeInit = ex ? ex.feePct : defFee(m.pay);

  openSheet(`<form class="sheet" id="expForm" novalidate>
    <div class="sheet-h"><h2>${ex ? '編輯花費' : '新增花費'}</h2><button type="button" class="x" data-act="closeSheet" aria-label="關閉">✕</button></div>
    <div class="sheet-b">
      <div class="amtrow">
        <input id="fAmt" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="金額" value="${ex ? esc(ex.amount) : ''}">
        <select id="fCur" aria-label="幣別">${currencyOptions(t, m.cur)}</select>
      </div>
      <div class="prev" id="fPrev" aria-live="polite"></div>
      <fieldset><legend>分類</legend><div class="chips">
        ${CATS.map(c => `<label><input type="radio" name="cat" value="${c.id}"${c.id === m.cat ? ' checked' : ''}><span><i aria-hidden="true">${c.icon}</i>${c.name}</span></label>`).join('')}
      </div></fieldset>
      <fieldset><legend>付款方式</legend><div class="chips">
        ${PAYS.map(p => `<label><input type="radio" name="pay" value="${p.id}"${p.id === m.pay ? ' checked' : ''}><span><i aria-hidden="true">${p.icon}</i>${p.name}</span></label>`).join('')}
      </div></fieldset>
      <div class="row2">
        <label class="f" id="fRateWrap"><span id="fRateLbl"></span><input id="fRate" inputmode="decimal" autocomplete="off"></label>
        <label class="f" id="fFeeWrap">手續費 %<input id="fFee" inputmode="decimal" autocomplete="off" value="${feeInit}"></label>
      </div>
      <div class="hint" id="fHint"></div>
      <div class="row2">
        <label class="f">日期<input type="date" id="fDate" value="${ex ? esc(ex.date) : todayStr()}"></label>
        <label class="f">備註<input type="text" id="fNote" placeholder="例如：一蘭拉麵" autocomplete="off" value="${esc(ex?.note || '')}"></label>
      </div>
    </div>
    <div class="sheet-f">${ex ? '<button type="button" class="btn danger" data-act="delExp">刪除</button>' : ''}<button type="submit" class="btn primary">${ex ? '儲存變更' : '記下這筆'}</button></div>
  </form>`, { onRates: () => { if (!m.rateEdited) { applyLive(); paint(); } } });

  const q = s => sheet.querySelector(s);
  const form = q('#expForm');

  function applyLive() {
    const ri = rateInfo(t, m.cur);
    m.rate = ri.rate; m.src = ri.src;
    q('#fRate').value = ri.rate ? rateStr(ri.rate) : '';
  }
  function paint() {
    const isHome = m.cur === t.home, cash = m.pay === 'cash';
    q('#fRateWrap').classList.toggle('hidden', isHome);
    q('#fFeeWrap').classList.toggle('hidden', cash || isHome);
    q('#fRateLbl').textContent = `匯率（1 ${m.cur} = ? ${t.home}）`;
    let hint = '';
    if (!isHome) {
      if (m.rateEdited) hint = '此筆匯率已鎖定（記帳當時的匯率，或你手動輸入的信用卡帳單／換匯匯率）。 <button type="button" class="btn sm ghost" data-act="resetRate">重設為預設匯率</button>';
      else if (m.src === 'manual') hint = '套用本旅程的自訂匯率。';
      else if (m.src === 'auto') hint = `即時匯率（${ago(S.fx.updatedAt)}更新）。與信用卡帳單不同時，可直接修改。`;
      else hint = '尚無匯率資料：請連網更新，或直接輸入匯率。 <button type="button" class="btn sm ghost" data-act="refresh">更新匯率</button>';
    }
    q('#fHint').innerHTML = hint;
    const amt = parseNum(q('#fAmt').value);
    const rate = isHome ? 1 : parseNum(q('#fRate').value);
    const fee = cash || isHome ? 0 : (parseNum(q('#fFee').value) || 0);
    const prev = q('#fPrev');
    prev.classList.remove('err');
    if (!(amt > 0)) { prev.innerHTML = '<small>輸入金額後，這裡會顯示換算結果</small>'; return; }
    if (!(rate > 0)) { prev.classList.add('err'); prev.textContent = '缺少匯率，請輸入匯率才能換算'; return; }
    const k = calc({ amount: amt, rate, feePct: fee });
    prev.innerHTML = `<b>≈ ${money(k.total, t.home)}</b><small>${isHome ? '' : `匯率 ${rateStr(rate)}`}${k.fee > 0 ? `　手續費 ${money(k.fee, t.home)}` : ''}</small>`;
  }

  applyLive();
  if (ex) { m.rate = ex.rate; m.src = 'edited'; q('#fRate').value = rateStr(ex.rate); }
  paint();

  q('#fAmt').addEventListener('input', paint);
  q('#fFee').addEventListener('input', () => { m.feeEdited = true; paint(); });
  q('#fRate').addEventListener('input', () => { m.rateEdited = true; paint(); });
  q('#fCur').addEventListener('change', e => { m.cur = e.target.value; m.rateEdited = false; applyLive(); paint(); });
  form.addEventListener('change', e => {
    if (e.target.name === 'cat') m.cat = e.target.value;
    if (e.target.name === 'pay') {
      m.pay = e.target.value;
      if (!m.feeEdited) q('#fFee').value = defFee(m.pay);
      paint();
    }
  });
  form.addEventListener('click', e => {
    if (e.target.closest('[data-act="resetRate"]')) { m.rateEdited = false; applyLive(); paint(); e.stopPropagation(); }
    if (e.target.closest('[data-act="delExp"]')) {
      if (!confirm('確定刪除這筆花費？')) return;
      t.expenses = t.expenses.filter(x => x.id !== ex.id); save(); closeSheet(); render(); toast('已刪除');
    }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const amt = parseNum(q('#fAmt').value), isHome = m.cur === t.home;
    const rate = isHome ? 1 : parseNum(q('#fRate').value);
    const date = q('#fDate').value;
    const prev = q('#fPrev');
    const fail = msg => { prev.classList.add('err'); prev.textContent = msg; };
    if (!(amt > 0)) return fail('請輸入大於 0 的金額'), q('#fAmt').focus();
    if (!(rate > 0)) return fail('請輸入有效的匯率'), q('#fRate').focus();
    if (!validDate(date)) return fail('請選擇日期'), q('#fDate').focus();
    const before = budgetState(t, stats(t).total)?.level;
    const rec = {
      id: ex?.id || uid(), date, cat: m.cat, note: q('#fNote').value.trim(), amount: amt, cur: m.cur, rate,
      feePct: m.pay === 'cash' || isHome ? 0 : Math.max(0, parseNum(q('#fFee').value) || 0),
      pay: m.pay, payer: ex?.payer || 'me', createdAt: ex?.createdAt || Date.now(),
    };
    if (ex) t.expenses[t.expenses.indexOf(ex)] = rec; else t.expenses.push(rec);
    save(); closeSheet(); render();
    const after = budgetState(t, stats(t).total)?.level;
    const db = dailyBudget(t), dayTotal = stats(t).byDay[date] || 0;
    if (after === 'over' && before !== 'over') toast('⚠️ 已超出總預算！');
    else if (after === 'warn' && before === 'ok') toast('⚠️ 已使用超過 80% 的預算');
    else if (db > 0 && date === todayStr() && dayTotal > db) toast('⚠️ 今日已超出每日預算');
    else toast(ex ? '已儲存變更' : `已記下 ${money(calc(rec).total, t.home)}`);
  });
  setTimeout(() => q('#fAmt').focus(), 50);
}

function openTripSheet(id) {
  const ex = id ? S.trips.find(t => t.id === id) : null;
  const d = ex ? { ...ex, currencies: [...ex.currencies] } : { name: '', home: 'TWD', currencies: ['JPY'], start: '', end: '', budget: '', dailyBudget: '', feePct: DEFAULT_FEE };
  const lockHome = !!ex && ex.expenses.length > 0;
  const q = s => sheet.querySelector(s);
  const homeOpts = CURRENCIES.map(c => `<option value="${c}"${c === d.home ? ' selected' : ''}>${c} ${esc(curName(c))}</option>`).join('');

  function draw() {
    const avail = CURRENCIES.filter(c => c !== d.home && !d.currencies.includes(c));
    q('#tCurs').innerHTML = d.currencies.length
      ? d.currencies.map(c => `<span class="tag">${c} ${esc(curName(c))}<button type="button" data-rm="${c}" aria-label="移除 ${c}">✕</button></span>`).join('')
      : '<span class="hint">尚未加入外幣（只記帳結帳幣別也可以）</span>';
    q('#tAdd').innerHTML = '<option value="">＋ 加入旅遊幣別…</option>' + avail.map(c => `<option value="${c}">${c} ${esc(curName(c))}</option>`).join('');
    q('#tBudLbl').textContent = `總預算（${d.home}）`;
    q('#tDayLbl').textContent = `每日預算（${d.home}，可留空）`;
  }
  openSheet(`<form class="sheet" id="tripForm" novalidate>
    <div class="sheet-h"><h2>${ex ? '編輯旅程' : '新增旅程'}</h2><button type="button" class="x" data-act="closeSheet" aria-label="關閉">✕</button></div>
    <div class="sheet-b">
      <label class="f">旅程名稱<input type="text" id="tName" placeholder="例如：東京 5 日遊" autocomplete="off" value="${esc(d.name)}"></label>
      <label class="f">結帳幣別（你平常的幣別，所有花費會換算成它）<select id="tHome"${lockHome ? ' disabled' : ''}>${homeOpts}</select></label>
      ${lockHome ? '<div class="hint">已有花費，無法更改結帳幣別。</div>' : ''}
      <div><div class="hint" style="margin-bottom:6px">旅遊幣別</div><div class="tags" id="tCurs"></div>
        <select id="tAdd" aria-label="加入旅遊幣別" style="margin-top:8px"></select></div>
      <div class="row2"><label class="f">出發日期<input type="date" id="tStart" value="${esc(d.start)}"></label><label class="f">回程日期<input type="date" id="tEnd" value="${esc(d.end)}"></label></div>
      <div class="row2"><label class="f"><span id="tBudLbl"></span><input id="tBud" inputmode="decimal" placeholder="不設定則不提醒" value="${d.budget || ''}"></label>
        <label class="f"><span id="tDayLbl"></span><input id="tDay" inputmode="decimal" placeholder="預設＝總預算÷天數" value="${d.dailyBudget || ''}"></label></div>
      <label class="f">預設海外刷卡手續費 %<input id="tFee" inputmode="decimal" value="${d.feePct}"></label>
      <div class="prev err hidden" id="tErr" role="alert"></div>
    </div>
    <div class="sheet-f"><button type="submit" class="btn primary">${ex ? '儲存' : '建立旅程'}</button></div>
  </form>`);
  draw();

  const form = q('#tripForm');
  q('#tHome').addEventListener('change', e => { d.home = e.target.value; d.currencies = d.currencies.filter(c => c !== d.home); draw(); });
  q('#tAdd').addEventListener('change', e => { if (e.target.value) { d.currencies.push(e.target.value); draw(); } });
  q('#tCurs').addEventListener('click', e => {
    const c = e.target.closest('[data-rm]')?.dataset.rm;
    if (c) { d.currencies = d.currencies.filter(x => x !== c); draw(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = q('#tName').value.trim(), start = q('#tStart').value, end = q('#tEnd').value;
    const err = q('#tErr');
    const fail = msg => { err.textContent = msg; err.classList.remove('hidden'); };
    if (!name) return fail('請輸入旅程名稱'), q('#tName').focus();
    if (start && end && end < start) return fail('回程日期不能早於出發日期');
    const p = {
      name, home: lockHome ? ex.home : q('#tHome').value, currencies: d.currencies, start, end,
      budget: Math.max(0, parseNum(q('#tBud').value) || 0), dailyBudget: Math.max(0, parseNum(q('#tDay').value) || 0),
      feePct: Math.max(0, parseNum(q('#tFee').value) || 0),
    };
    if (ex) Object.assign(ex, p);
    else { const t = newTrip(p); S.trips.push(t); S.current = t.id; ui.filter = 'all'; ui.conv.from = ui.conv.to = null; }
    save(); closeSheet(); render(); toast(ex ? '旅程已更新' : '旅程已建立，開始記帳吧！');
  });
  setTimeout(() => q('#tName').focus(), 50);
}

function openTripsSheet() {
  const t = curTrip();
  openSheet(`<div class="sheet"><div class="sheet-h"><h2>切換旅程</h2><button type="button" class="x" data-act="closeSheet" aria-label="關閉">✕</button></div>
    <div class="sheet-b">${S.trips.map(x => `<button class="list-btn" data-act="switchTrip" data-id="${esc(x.id)}"><span class="t"><b>${esc(x.name)}</b><small>${x.expenses.length} 筆 · ${esc(x.home)}</small></span>${t && x.id === t.id ? '<span class="ck">使用中</span>' : ''}</button>`).join('')}
    </div><div class="sheet-f"><button class="btn primary" data-act="newTrip">＋ 新增旅程</button></div></div>`);
}

/* ========== 匯出／匯入／範例 ========== */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeName = s => s.replace(/[\\/:*?"<>|]/g, '_');

function exportCsv() {
  const t = curTrip(); if (!t) return;
  if (!t.expenses.length) return toast('這趟旅程還沒有花費可匯出');
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['日期', '分類', '備註', '付款方式', '幣別', '原幣金額', '匯率', '手續費%', `手續費(${t.home})`, `合計(${t.home})`];
  const rows = [...t.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map(e => {
    const k = calc(e);
    return [e.date, catOf(e.cat).name, e.note, payOf(e.pay).name, e.cur, e.amount, +e.rate.toPrecision(6), e.feePct, k.fee.toFixed(2), k.total.toFixed(2)];
  });
  const total = t.expenses.reduce((s, e) => s + calc(e).total, 0);
  rows.push(['總計', '', '', '', '', '', '', '', '', total.toFixed(2)]);
  const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n');   // BOM 讓 Excel 正確顯示中文
  download(`${safeName(t.name)}_${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('已匯出 CSV');
}
function exportJson() {
  download(`旅費記帳備份_${todayStr()}.json`, JSON.stringify({ app: 'travel-ledger', v: 1, trips: S.trips }, null, 2), 'application/json');
  toast('已匯出備份檔');
}
function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const ok = t => t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.home === 'string' && Array.isArray(t.expenses);
      if (!d || !Array.isArray(d.trips) || !d.trips.every(ok)) throw new Error('format');
      if (!confirm(`備份檔內有 ${d.trips.length} 趟旅程。編號相同的旅程會被覆蓋，其餘保留。要匯入嗎？`)) return;
      for (const t of d.trips) {
        t.currencies = Array.isArray(t.currencies) ? t.currencies : [];
        t.manualRates = t.manualRates || {};
        t.people = t.people || [{ id: 'me', name: '我' }];
        const i = S.trips.findIndex(x => x.id === t.id);
        if (i >= 0) S.trips[i] = t; else S.trips.push(t);
      }
      S.current = S.current || d.trips[0]?.id;
      save(); render(); toast('匯入完成');
    } catch { toast('匯入失敗：不是有效的備份檔'); }
  };
  r.readAsText(file);
}
function loadSample() {
  const today = todayStr(), start = addDays(today, -3), end = addDays(today, 1);
  const jpy = liveRate('JPY', 'TWD') || 0.215;
  const t = newTrip({ name: '範例：東京 5 日遊', home: 'TWD', currencies: ['JPY'], start, end, budget: 25000 });
  let seq = 0;
  const add = (day, cat, note, amount, pay, cur = 'JPY') => t.expenses.push({
    id: uid(), date: addDays(start, day), cat, note, amount, cur, rate: cur === 'JPY' ? jpy : 1,
    feePct: pay === 'cash' || cur === 'TWD' ? 0 : t.feePct, pay, payer: 'me', createdAt: Date.now() + seq++,
  });
  add(0, 'transport', '機場捷運', 160, 'mobile', 'TWD');
  add(0, 'lodging', '新宿飯店 3 晚', 36000, 'card');
  add(0, 'food', '一蘭拉麵', 1250, 'cash');
  add(0, 'transport', 'Suica 儲值', 3000, 'cash');
  add(1, 'fun', 'teamLab 門票', 3800, 'card');
  add(1, 'food', '壽司', 4800, 'card');
  add(1, 'shopping', '藥妝店', 6200, 'card');
  add(1, 'telecom', 'eSIM', 350, 'card', 'TWD');
  add(2, 'transport', '新幹線', 13320, 'card');
  add(2, 'food', '居酒屋', 5400, 'card');
  add(2, 'souvenir', '伴手禮', 3600, 'cash');
  add(3, 'food', '早餐', 780, 'cash');
  add(3, 'shopping', '服飾', 9800, 'card');
  add(3, 'medical', '旅平險', 890, 'card', 'TWD');
  S.trips.push(t); S.current = t.id; ui.filter = 'all'; ui.tab = 'ledger'; ui.conv.from = ui.conv.to = null;
  save(); closeSheet(); render(); toast('已載入範例旅程');
}

/* ========== 事件 ========== */
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const t = curTrip();
  switch (el.dataset.act) {
    case 'add': openExpenseSheet(); break;
    case 'edit': openExpenseSheet(el.dataset.id); break;
    case 'closeSheet': closeSheet(); break;
    case 'trips': S.trips.length ? openTripsSheet() : openTripSheet(); break;
    case 'newTrip': openTripSheet(); break;
    case 'editTrip': if (t) openTripSheet(t.id); break;
    case 'delTrip':
      if (t && confirm(`確定刪除「${t.name}」與其中 ${t.expenses.length} 筆花費？此動作無法復原，建議先備份。`)) {
        S.trips = S.trips.filter(x => x.id !== t.id); S.current = S.trips[0]?.id || null; save(); render(); toast('旅程已刪除');
      }
      break;
    case 'switchTrip': S.current = el.dataset.id; ui.filter = 'all'; ui.conv.from = ui.conv.to = null; save(); closeSheet(); ui.tab = 'ledger'; render(); window.scrollTo(0, 0); break;
    case 'filter': ui.filter = el.dataset.v; render(); break;
    case 'refresh': refreshRates(true); break;
    case 'swap': { const c = ui.conv; [c.from, c.to] = [$('#cvTo').value, $('#cvFrom').value]; c.amount = $('#cvAmt').value; render(); break; }
    case 'exportCsv': exportCsv(); break;
    case 'exportJson': exportJson(); break;
    case 'importJson': $('#importFile').click(); break;
    case 'sample': loadSample(); break;
  }
});
// 自訂匯率：離開欄位（change）時才儲存並重畫，避免輸入到一半失去焦點
document.addEventListener('change', e => {
  const cur = e.target.dataset?.rateCur, t = curTrip();
  if (!cur || !t) return;
  const v = parseNum(e.target.value);
  t.manualRates = t.manualRates || {};
  if (v > 0) t.manualRates[cur] = v; else delete t.manualRates[cur];
  save(); render(); toast(v > 0 ? `已設定 ${cur} 自訂匯率` : `已改回即時匯率`);
});
$('#importFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });

/* ========== 啟動 ========== */
render();
if (!S.trips.length) setTimeout(() => { if (!S.trips.length && !sheet.open) openTripSheet(); }, 300);
if (!S.fx.updatedAt || Date.now() - S.fx.updatedAt > RATE_TTL) refreshRates(false);
window.addEventListener('online', () => refreshRates(false));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
