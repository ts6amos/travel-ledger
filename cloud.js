(function() {
  'use strict';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const config = window.TRAVEL_CLOUD || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') && !!config.key;
  const sessionKey = 'travelLedger.cloud.session';
  let session = read(sessionKey, null), bridge, busy = false, message = '', conflict = null;
  let timer;
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = () => session?.user?.id ? `travelLedger.account.${session.user.id}` : 'travelLedger.v1';
  const persistSession = data => {
    const next = { ...data, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in };
    localStorage.setItem(sessionKey, JSON.stringify(next));
    session = next;
  };
  const stored = () => read(key(), null);
  function persist(state, base = stored()?.cloudBase ?? []) {
    // State and acknowledged base are written atomically, so reload preserves pending changes.
    localStorage.setItem(key(), JSON.stringify({ ...state, cloudBase: base }));
  }
  async function request(path, body, token, method = 'POST') {
    const ctl = new AbortController(), timeout = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(config.url.replace(/\/$/, '') + path, {
        method, signal: ctl.signal,
        headers: { apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || data.message || data.error_description || `伺服器錯誤 ${res.status}`);
      return data;
    } finally { clearTimeout(timeout); }
  }
  async function token() {
    if (!session) throw new Error('請先登入');
    if (session.expires_at < Date.now() / 1000 + 90) {
      persistSession(await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
    }
    return session.access_token;
  }
  function status() {
    const el = document.getElementById('cloudStatus');
    if (el) el.textContent = !configured ? '雲端尚未設定' : !session ? (message || '本機模式 · 登入以同步') :
      !navigator.onLine ? '離線 · 連線後同步' : message || (busy ? '同步中…' : '等待同步');
    const email = document.getElementById('cloudEmail');
    if (email) email.textContent = session?.user?.email || '';
  }
  async function sync(force) {
    if (!configured || !session || busy || !navigator.onLine || bridge?.editing?.() || (conflict && !force)) { status(); return; }
    busy = true; message = '同步中…'; status();
    try {
      const access = await token();
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await request('/rest/v1/rpc/ledger_read', {}, access);
        const sent = clone(bridge.get().trips), base = stored()?.cloudBase ?? [];
        let merged;
        try { merged = force === 'local' ? sent : force === 'remote' ? remote.trips : window.LedgerMerge(base, sent, remote.trips); }
        catch (e) { conflict = remote; throw e; }
        const result = await request('/rest/v1/rpc/ledger_write', { expected_revision: remote.revision, new_trips: merged }, access);
        if (!result.ok) continue;
        if (bridge.editing?.()) throw new Error('表單編輯中，關閉後再同步');
        // Edits made while the network request was in flight remain pending.
        const latest = bridge.get();
        let applied;
        try { applied = window.LedgerMerge(sent, latest.trips, merged); }
        catch (e) { conflict = result; throw e; }
        const updated = { ...latest, trips: applied };
        persist(updated, merged);
        bridge.set(updated);
        conflict = null; message = '已同步 · ' + new Date().toLocaleTimeString('zh-TW');
        if (JSON.stringify(applied) !== JSON.stringify(merged)) schedule();
        return;
      }
      throw new Error('其他裝置正在更新，稍後重試');
    } catch (e) {
      message = navigator.onLine ? e.message : '離線 · 連線後同步';
    } finally { busy = false; status(); }
  }
  function schedule() {
    if (session && !conflict) { message = '有本機變更 · 等待同步'; status(); }
    clearTimeout(timer); timer = setTimeout(() => sync(), 700);
  }
  function panel() {
    const el = document.getElementById('cloudPanel');
    el.innerHTML = `<details class="card"><summary>☁️ 跨裝置同步：<span id="cloudStatus" role="status"></span></summary>
      <p class="hint">各裝置登入同一帳號，共用旅程與花費。離線變更會在連線後同步。</p>
      ${!configured ? '<p>管理者尚未設定雲端。請依 CLOUD_SETUP.md 建立資料庫並填寫 cloud-config.js。</p>' :
      session ? `<p id="cloudEmail"></p><div class="btn-row"><button class="btn" id="syncNow">立即同步</button><button class="btn" id="migrateLocal">匯入這台裝置的舊帳目</button><button class="btn" id="cloudLogout">登出</button></div>
      <p class="hint">同一筆資料衝突時，會暫停同步。先用「備份全部資料」保留本機版本，再選擇：</p>
      <div class="btn-row"><button class="btn" id="keepRemote">採用雲端版本</button><button class="btn danger" id="keepLocal">以本機版本取代雲端</button></div>` :
      `<form id="cloudLogin"><label class="f">Email<input name="email" type="email" required autocomplete="username"></label><label class="f">密碼<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><div class="btn-row"><button class="btn primary" name="mode" value="login">登入</button><button class="btn" name="mode" value="signup">註冊</button></div></form>`}
    </details>`;
    document.getElementById('cloudLogin')?.addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      const form = e.target, fields = new FormData(form), signup = e.submitter?.value === 'signup';
      busy = true; message = '登入處理中…'; status();
      try {
        const data = await request(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { email: fields.get('email'), password: fields.get('password') });
        if (!data.access_token) { message = '請到信箱確認註冊，再回來登入'; return; }
        persistSession(data); form.reset();
        conflict = null;
        bridge.set(stored() || bridge.empty()); panel();
      } catch (err) { message = err.message; }
      finally { busy = false; status(); if (session) sync(); }
    });
    document.getElementById('syncNow')?.addEventListener('click', () => sync());
    document.getElementById('cloudLogout')?.addEventListener('click', async () => {
      if (busy) return;
      if (JSON.stringify(bridge.get().trips) !== JSON.stringify(stored()?.cloudBase ?? []) &&
          !confirm('有尚未同步的帳目。資料會保留在本機帳號快取，下次登入再同步。仍要登出？')) return;
      busy = true;
      try { await request('/auth/v1/logout?scope=local', {}, await token()); } catch { /* Offline logout still removes this device session. */ }
      localStorage.removeItem(sessionKey); session = null; conflict = null; message = '';
      busy = false; bridge.set(stored() || bridge.empty()); panel();
    });
    document.getElementById('migrateLocal')?.addEventListener('click', () => {
      if (busy) return;
      const old = read('travelLedger.v1', { trips: [] });
      if (!old.trips.length) return bridge.toast('這台裝置沒有舊帳目');
      if (!confirm(`匯入 ${old.trips.length} 趟本機旅程？原始本機資料會保留；編號相同但內容不同的旅程會建立副本。`)) return;
      const state = clone(bridge.get());
      for (const trip of old.trips) {
        const existing = state.trips.find(x => x.id === trip.id);
        if (JSON.stringify(existing) === JSON.stringify(trip)) continue;
        const copy = clone(trip);
        if (existing) { copy.id = crypto.randomUUID(); copy.name += '（本機匯入）'; }
        state.trips.push(copy);
      }
      try { persist(state); bridge.set(state); schedule(); bridge.toast('已匯入，等待同步'); }
      catch { bridge.toast('本機儲存失敗，請先匯出備份'); }
    });
    for (const [id, mode] of [['keepRemote', 'remote'], ['keepLocal', 'local']]) {
      document.getElementById(id)?.addEventListener('click', () => {
        if (!conflict) return bridge.toast('目前沒有待處理的同步衝突');
        if (confirm(mode === 'remote' ? '先備份本機帳目。確定捨棄本機待同步變更並採用雲端？' : '先備份本機帳目。確定以全部本機旅程取代雲端資料？')) sync(mode);
      });
    }
    status();
  }
  window.LedgerCloud = {
    key, persist,
    changed: schedule,
    start(b) {
      bridge = b; panel(); sync();
      setInterval(() => { if (!document.hidden) sync(); }, 15000);
      window.addEventListener('online', () => sync());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
      window.addEventListener('storage', e => {
        if (e.key === sessionKey || e.key === key()) location.reload();
      });
    }
  };
})();
