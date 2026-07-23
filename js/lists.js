// Admin-editable master lists (shop areas, person locations) — bilingual.
// Cached in localStorage so entry flows + display work offline; refreshed
// from the server when online. Falls back to the seeded areas.
window.Lists = (function () {
  const KEY = 'ck_lists';
  const SEED = {
    area: [
      { id: 'main_malda', nameBn: 'মেন রোড — মালদার দিকে', nameEn: 'Main Rd — Malda side' },
      { id: 'main_balurghat', nameBn: 'মেন রোড — বালুরঘাটের দিকে', nameEn: 'Main Rd — Balurghat side' },
      { id: 'harirampur', nameBn: 'হরিরামপুর রোড', nameEn: 'Harirampur Road' },
      { id: 'singhadaha', nameBn: 'সিংহদহ রোড', nameEn: 'Singhadaha Road' },
    ],
    location: [],
  };
  function cache() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function get(kind) {
    const c = cache();
    if (c && Array.isArray(c[kind]) && c[kind].length) return c[kind];
    return (SEED[kind] || []).slice();
  }
  function labelOf(kind, id) {
    if (!id) return '';
    const item = get(kind).find(function (x) { return x.id === id; });
    if (!item) return String(id);
    const lang = (window.Settings && Settings.get('lang')) || 'bn';
    return (lang === 'en' ? item.nameEn : item.nameBn) || item.nameBn || item.nameEn || String(id);
  }
  function refresh() {
    if (!navigator.onLine || !Auth.loggedIn() || !Sync.configured()) return Promise.resolve();
    return Auth.call('listItems', { token: Auth.token() }).then(function (resp) {
      const by = { area: [], location: [] };
      (resp.items || []).forEach(function (it) { (by[it.kind] = by[it.kind] || []).push(it); });
      localStorage.setItem(KEY, JSON.stringify(by));
    }).catch(function () { /* offline / not ready */ });
  }
  return { get: get, labelOf: labelOf, refresh: refresh };
})();
