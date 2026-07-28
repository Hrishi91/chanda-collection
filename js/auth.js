// Login/session against the Apps Script backend. Token + user cached in
// localStorage so the app keeps working offline after one online login.
const Auth = (function () {
  // A31/A34: the version of the JS this device is ACTUALLY RUNNING. It lives
  // here, not in app.js, because auth.js is the single door every server call
  // goes through and it loads first — reading a constant out of app.js from
  // here would depend on load order, which is the kind of thing that works in
  // testing and fails on somebody's phone. Bound to sw.js VERSION and Code.gs
  // CODE_VERSION by tests/run.js so the three cannot drift.
  const APP_VERSION = 'chanda-v4.9.5';
  // What the SERVER last told us it is running. Kept in localStorage so the
  // warning survives a reload and stays true offline: once we know this device
  // is behind, going offline does not make it not behind.
  function serverVersion() {
    try { return localStorage.getItem('ck_srv_version') || ''; } catch (e) { return ''; }
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
  function noteServerVersion(v) {
    if (!v || v === serverVersion()) return;
    try { localStorage.setItem('ck_srv_version', String(v)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ck-version')); } catch (e) {}
  }
  function apiUrl() {
    return Settings.get('scriptUrl') || (window.CONFIG && CONFIG.SCRIPT_URL) || '';
  }
  function call(action, payload) {
    if (!apiUrl()) return Promise.reject(new Error('not-configured'));
    return fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // Every request carries this device's version, so the server can record
      // who is running what — one place, so no handler can forget.
      body: JSON.stringify(Object.assign({ action: action, appVersion: APP_VERSION }, payload || {})),
    }).then(function (r) { return r.json(); })
      .catch(function () { throw new Error('network'); })
      .then(function (resp) {
        // …and every response carries the server's, ok or not. Read it before
        // anything can throw, or a device that is behind AND getting errors
        // would never learn the first fact.
        noteServerVersion(resp && resp.codeVersion);
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
    serverVersion: serverVersion,
    versionCmp: versionCmp,
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
