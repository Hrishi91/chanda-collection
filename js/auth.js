// Login/session against the Apps Script backend. Token + user cached in
// localStorage so the app keeps working offline after one online login.
const Auth = (function () {
  function apiUrl() {
    return Settings.get('scriptUrl') || (window.CONFIG && CONFIG.SCRIPT_URL) || '';
  }
  function call(action, payload) {
    if (!apiUrl()) return Promise.reject(new Error('not-configured'));
    return fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    }).then(function (r) { return r.json(); })
      .catch(function () { throw new Error('network'); })
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.error || 'server');
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
    Settings.set('collectorName', resp.user.name); // stamped on entries
  }
  function logout() {
    localStorage.removeItem('ck_token');
    localStorage.removeItem('ck_user');
  }

  return {
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
