const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const mergeContext = { window: {} }; vm.runInNewContext(source('sync-merge.js'), mergeContext);
const merge = (...args) => JSON.parse(JSON.stringify(mergeContext.window.LedgerMerge(...args)));
const modelContext={window:{}};vm.runInNewContext(source('model.js'),modelContext);
const trip=(entries=[])=>({id:'t1',name:'個人帳本',home:'TWD',defaultBudget:0,budgets:{},categories:JSON.parse(JSON.stringify(modelContext.window.DailyModel.defaults())),entries,createdAt:1});
const expense=(id,amount=100)=>({id,amount,note:'餐飲',type:'expense',date:'2026-10-12',cur:'TWD',rate:1,cat:'food',pay:'cash',createdAt:1});
const copy = x => JSON.parse(JSON.stringify(x));
test('simultaneous additions to same trip are preserved', () => {
  const base = [trip()];
  const result = merge(base, [trip([expense('a')])], [trip([expense('b')])]);
  assert.deepEqual(result[0].entries.map(e => e.id).sort(), ['a', 'b']);
});
test('independent fields merge; a changed field is not overwritten', () => {
  const base = [trip([expense('a')])], local = copy(base), remote = copy(base);
  local[0].entries[0].amount = 200; remote[0].entries[0].note = '早餐';
  assert.deepEqual(merge(base,local,remote)[0].entries[0],{...expense('a',200),note:'早餐'});
});
test('deletions propagate without resurrection', () => {
  const base = [trip([expense('a'), expense('b')])];
  assert.deepEqual(merge(base, base, [trip([expense('b')])]), [trip([expense('b')])]);
  assert.deepEqual(merge(base, [], base), []);
});
test('conflicting edit/edit and delete/edit stop', () => {
  const base = [trip([expense('a')])], local = copy(base), remote = copy(base);
  local[0].entries[0].amount = 200; remote[0].entries[0].amount = 300;
  assert.throws(() => merge(base, local, remote), /同步衝突/);
  assert.throws(() => merge(base, [], remote), /同步衝突/);
});
test('new books, equal concurrent changes and manual rate fields', () => {
  assert.equal(merge([], [trip()], [trip()]).length, 1);
  const base = [Object.assign(trip(), {manualRates: {JPY: 0.2}})];
  const a = copy(base), b = copy(base); a[0].manualRates.JPY = 0.21; b[0].manualRates.USD = 32;
  assert.deepEqual(merge(base, a, b)[0].manualRates, {JPY: 0.21, USD: 32});
});

function server() {
  return { rows: new Map(), rejectOnce: false, fail: false, writes: 0, duringWrite: null,
    async fetch(url, options) {
      if (this.fail) throw new Error('network unavailable');
      const user = options.headers.Authorization?.replace('Bearer ', '');
      const row = this.rows.get(user) || {books: [], revision: 0};
      const body = JSON.parse(options.body || '{}'); let result;
      if (url.endsWith('daily_ledger_read')) result = copy(row);
      else if (url.endsWith('daily_ledger_write')) {
        if (this.duringWrite) { const fn = this.duringWrite; this.duringWrite = null; fn(); }
        if (this.rejectOnce) { this.rejectOnce = false; result = {ok: false}; }
        else if (row.revision !== body.expected_revision) result = {ok: false};
        else { const next = {books: body.new_books, revision: row.revision + 1}; this.rows.set(user, copy(next)); this.writes++; result = {ok: true, ...next}; }
      } else throw new Error('Unexpected URL: ' + url);
      return {ok: true, json: async () => result};
    }
  };
}
function device(db, user = 'u1', existing) {
  const entries = existing || new Map();
  entries.set('dailyLedger.cloud.session', JSON.stringify({user: {id: user, email: user + '@test.com'}, access_token: user, expires_at: Date.now() / 1000 + 3600}));
  const nodes = new Map(), events = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, {textContent: '', handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; }}); return nodes.get(id); };
  let state = JSON.parse(entries.get('dailyLedger.account.' + user) || '{"books":[],"cloudBase":[]}');
  const ctx = {
    window: {}, navigator: {onLine: true}, document: {hidden: false, getElementById: node, addEventListener: (name, fn) => events.set(name, fn)},
    location: {reload() {}}, localStorage: {getItem: k => entries.get(k) || null, setItem: (k, v) => entries.set(k, v), removeItem: k => entries.delete(k)},
    AbortController, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, Date, crypto: require('node:crypto').webcrypto,
    fetch: db.fetch.bind(db), confirm: () => true
  };
  ctx.window.DAILY_CLOUD = {url: 'https://test.supabase.co', key: 'public-key'};
  ctx.window.addEventListener = (name, fn) => events.set(name, fn);
  vm.createContext(ctx); vm.runInContext(source('model.js'),ctx);vm.runInContext(source('sync-merge.js'), ctx); vm.runInContext(source('cloud.js'), ctx);
  ctx.window.LedgerCloud.start({get: () => state, set: value => {state = value;}, empty: () => ({books: []}), toast() {}});
  return { ctx, entries, nodes, events, get: () => state,
    edit(fn) {fn(state); ctx.window.LedgerCloud.persist(state);},
    sync: () => node('syncNow').handlers.click(),
    status: () => node('cloudStatus').textContent
  };
}
async function settle() { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); }
test('two devices sync additions, edits and deletes', async () => {
  const db = server(), a = device(db), b = device(db); await settle();
  a.edit(s => s.books.push(trip([expense('a')]))); await a.sync(); await b.sync();
  assert.deepEqual(b.get().books, a.get().books);
  b.edit(s => s.books[0].entries[0].amount = 250); await b.sync(); await a.sync();
  assert.equal(a.get().books[0].entries[0].amount, 250);
  a.edit(s => s.books[0].entries = []); await a.sync(); await b.sync();
  assert.equal(b.get().books[0].entries.length, 0);
});
test('offline edits survive reload and merge with remote additions', async () => {
  const db = server(), a = device(db); await settle();
  a.edit(s => s.books.push(trip())); await a.sync();
  const b = device(db); await settle();
  a.ctx.navigator.onLine = false; a.edit(s => s.books[0].entries.push(expense('offline')));
  b.edit(s => s.books[0].entries.push(expense('online'))); await b.sync();
  const restarted = device(db, 'u1', a.entries); await settle();
  assert.deepEqual(copy(restarted.get().books[0].entries.map(e => e.id).sort()), ['offline', 'online']);
});
test('revision collision retries; in-flight edits stay pending', async () => {
  const db = server(), a = device(db); await settle();
  a.edit(s => s.books.push(trip())); db.rejectOnce = true; await a.sync();
  a.edit(s=>s.books[0].name='改名');
  db.duringWrite = () => a.edit(s => s.books[0].entries.push(expense('in-flight')));
  await a.sync();
  assert.equal(a.get().books[0].entries.length, 1);
  await a.sync(); assert.equal(db.rows.get('u1').books[0].entries.length, 1);
});
test('conflicts preserve local and cloud, explicit cloud resolution works', async () => {
  const db = server(), a = device(db); await settle();
  a.edit(s => s.books.push(trip([expense('a')]))); await a.sync();
  const b = device(db); await settle();
  a.edit(s => s.books[0].entries[0].amount = 200);
  b.edit(s => s.books[0].entries[0].amount = 300); await b.sync(); await a.sync();
  assert.match(a.status(), /同步衝突/);
  assert.equal(a.get().books[0].entries[0].amount, 200);
  assert.equal(db.rows.get('u1').books[0].entries[0].amount, 300);
  await a.nodes.get('keepRemote').handlers.click(); await settle();
  assert.equal(a.get().books[0].entries[0].amount, 300);
});
test('account caches are separate and legacy records are retained', async () => {
  const db = server(), entries = new Map([['dailyLedger.v1', JSON.stringify({books: [trip()]})]]);
  const a = device(db, 'u1', entries); await settle();
  a.edit(s => s.books.push(trip())); await a.sync();
  const b = device(db, 'u2', entries); await settle();
  assert.equal(b.get().books.length, 0);
  assert.equal(JSON.parse(entries.get('dailyLedger.v1')).books.length, 1);
});
test('network errors do not erase pending local changes', async () => {
  const db = server(), a = device(db); await settle();
  a.edit(s => s.books.push(trip())); db.fail = true; await a.sync();
  assert.equal(a.get().books.length, 1);
  assert.equal(JSON.parse(a.entries.get('dailyLedger.account.u1')).books.length, 1);
  db.fail = false; await a.sync(); assert.equal(db.rows.get('u1').books.length, 1);
});
test('open expense form postpones background sync to preserve form references', async () => {
  const db = server(), a = device(db); await settle();
  a.ctx.window.LedgerCloud.start({get: a.get, set() {throw new Error('must not apply while editing');}, editing: () => true});
  const before = db.writes; await a.sync(); await settle(); assert.equal(db.writes, before);
});
