// Login/session against the Apps Script backend. Token + user cached in
// localStorage so the app keeps working offline after one online login.
const Auth = (function () {
  // A31/A34: the version of the JS this device is ACTUALLY RUNNING. It lives
  // here, not in app.js, because auth.js is the single door every server call
  // goes through and it loads first — reading a constant out of app.js from
  // here would depend on load order, which is the kind of thing that works in
  // testing and fails on somebody's phone. Bound to sw.js VERSION and Code.gs
  // CODE_VERSION by tests/run.js so the three cannot drift.
  const APP_VERSION = 'chanda-v4.21.3';
  // A43: the RELEASE string above is for people to read. This is the number
  // that decides anything: the server CONTRACT this client speaks — columns,
  // handlers, meanings. It moves only when Code.gs actually changes, so a
  // client-only release no longer demands a pointless redeploy, and no longer
  // leaves the admin staring at a "redeploy pending" line that means nothing.
  // Bump it in Code.gs and here TOGETHER, in the commit that changes the server.
  const APP_SCHEMA = 5;
  // What the SERVER last told us it is running. Kept in localStorage so the
  // warning survives a reload and stays true offline: once we know this device
  // is behind, going offline does not make it not behind.
  function serverVersion() {
    try { return localStorage.getItem('ck_srv_version') || ''; } catch (e) { return ''; }
  }
  // -1 unknown: either we have never heard from the server, or it is running a
  // build from before schemas existed. Unknown must never lock anybody out.
  function serverSchema() {
    try {
      const v = localStorage.getItem('ck_srv_schema');
      return v === null || v === '' ? -1 : Number(v);
    } catch (e) { return -1; }
  }
  // "chanda-v4.10.2" → [4,10,2]. Anything unparseable returns null, and every
  // caller treats null as "say nothing" — a garbled version must never raise an
  // alarm the user cannot act on.
  function verNums(v) {
    const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  // -1 this device is BEHIND · 0 same · 1 device is ahead · null unknown
  function versionCmp() {
    const a = verNums(APP_VERSION), b = verNums(serverVersion());
    if (!a || !b) return null;
    for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
    return 0;
  }
  // What the lock and the warnings actually ask. Release numbers move on every
  // commit; the contract does not, and only the contract can break anything.
  // -1 this client is BEHIND the server's contract · 0 same · 1 the SERVER is
  // behind (Code.gs not redeployed) · null unknown, so say nothing.
  function schemaCmp() {
    const b = serverSchema();
    if (b < 0) return null;
    return APP_SCHEMA < b ? -1 : APP_SCHEMA > b ? 1 : 0;
  }
  function noteServerVersion(v, sc) {
    let changed = false;
    if (v && v !== serverVersion()) {
      try { localStorage.setItem('ck_srv_version', String(v)); } catch (e) {}
      changed = true;
    }
    if (sc !== undefined && sc !== null && Number(sc) !== serverSchema()) {
      try { localStorage.setItem('ck_srv_schema', String(Number(sc))); } catch (e) {}
      changed = true;
    }
    if (changed) { try { window.dispatchEvent(new CustomEvent('ck-version')); } catch (e) {} }
  }
  function apiUrl() {
    return Settings.get('scriptUrl') || (window.CONFIG && CONFIG.SCRIPT_URL) || '';
  }
  // A69 (audit #2 P3): fetch() has no timeout of its own — none, ever. A phone
  // attached to a saturated tower keeps a request open indefinitely, and
  // `navigator.onLine` still says true because it reports LINK state, not
  // reachability. So the app sat there looking busy with nothing coming back,
  // while the 60 s poll started another one on top, and another.
  //
  // 25 s, not 10: one Apps Script round trip measured 2.81 s from a WIRED
  // connection, because script.google.com redirects to
  // script.googleusercontent.com — two hosts, two DNS lookups, two TLS
  // handshakes per logical call. On a village 3G that legitimately reaches
  // 15–20 s, and a timeout that fires on a request which WOULD have succeeded
  // is worse than no timeout: the collector retries, and the retry is slower
  // than the wait would have been.
  const CALL_TIMEOUT_MS = 25000;
  function call(action, payload) {
    if (!apiUrl()) return Promise.reject(new Error('not-configured'));
    const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timer = null;
    if (ac) timer = setTimeout(function () { ac.abort(); }, CALL_TIMEOUT_MS);
    const done = function () { if (timer) { clearTimeout(timer); timer = null; } };
    return fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: ac ? ac.signal : undefined,
      // Every request carries this device's version, so the server can record
      // who is running what — one place, so no handler can forget.
      body: JSON.stringify(Object.assign({ action: action, appVersion: APP_VERSION, appSchema: APP_SCHEMA }, payload || {})),
    }).then(function (r) { done(); return r.json(); })
      // an abort and a dead link are the same thing to the user — "it did not
      // get through" — and errMsg already turns 'network' into a sentence about
      // the internet rather than about the server
      .catch(function () { done(); throw new Error('network'); })
      .then(function (resp) {
        // …and every response carries the server's, ok or not. Read it before
        // anything can throw, or a device that is behind AND getting errors
        // would never learn the first fact.
        noteServerVersion(resp && resp.codeVersion, resp && resp.schema);
        if (!resp.ok) {
          // This device's session is no longer valid — the token was overwritten
          // by a login on another device (one account = one active device), or
          // the account was blocked. Drop the local session and tell the app.
          if ((resp.error === 'bad-token' || resp.error === 'blocked') && payload && payload.token) {
            localStorage.removeItem('ck_token');
            localStorage.removeItem('ck_user');
            try { window.dispatchEvent(new CustomEvent('ck-auth-invalid', { detail: resp.error })); } catch (e) {}
          }
          throw new Error(resp.error || 'server');
        }
        return resp;
      });
  }

  function token() { return localStorage.getItem('ck_token') || ''; }
  function current() {
    try { return JSON.parse(localStorage.getItem('ck_user') || 'null'); }
    catch (e) { return null; }
  }
  function saveSession(resp) {
    localStorage.setItem('ck_token', resp.token);
    localStorage.setItem('ck_user', JSON.stringify(resp.user));
    Settings.set('collectorName', resp.user.name); // display name on entries
    Settings.set('collectorUsername', resp.user.username); // stable identity key
    // role stamped on entries so corrections can enforce who-can-void
    Settings.set('collectorRole', Aggregate.roleOf(resp.user.role, resp.user.cashier));
  }
  function logout() {
    // best-effort: invalidate the token server-side too (don't block on it),
    // so a leaked/old token can't keep working after logout.
    var tok = token();
    if (tok && apiUrl()) call('logout', { token: tok }).catch(function () {});
    localStorage.removeItem('ck_token');
    localStorage.removeItem('ck_user');
  }

  return {
    APP_VERSION: APP_VERSION,
    APP_SCHEMA: APP_SCHEMA,
    serverVersion: serverVersion,
    serverSchema: serverSchema,
    versionCmp: versionCmp,
    schemaCmp: schemaCmp,
    call: call,
    token: token,
    current: current,
    isAdmin: function () { var u = current(); return !!u && u.role === 'admin'; },
    isCashier: function () { var u = current(); return !!u && (u.cashier === 1 || u.role === 'admin'); },
    loggedIn: function () { return !!token() && !!current(); },
    register: function (f) { return call('register', f); },
    login: function (username, password) {
      return call('login', { username: username, password: password, year: Settings.get('year') })
        .then(function (resp) { saveSession(resp); return resp.user; });
    },
    changePassword: function (oldPw, newPw) {
      return call('changePassword', { token: token(), oldPassword: oldPw, newPassword: newPw })
        .then(function () {
          var u = current();
          if (u) { u.mustChange = 0; localStorage.setItem('ck_user', JSON.stringify(u)); }
        });
    },
    logout: logout,
  };
})();
