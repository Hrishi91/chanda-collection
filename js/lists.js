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
    // The committee's four posts, bilingual. Editable from the admin panel like
    // areas and locations — renaming one never disturbs members already recorded
    // against it, because the row stores this id, not the label.
    // maxCount 0 = as many as you like. perms EMPTY on purpose — a post grants
    // nothing until the admin ticks the boxes; seeding power nobody asked for
    // is how "why can he do that?" becomes unanswerable. Same four ids are
    // seeded server-side (Code.gs POSITION_SEED) so these rows are editable.
    position: [
      { id: 'president', nameBn: 'সভাপতি', nameEn: 'President', maxCount: 1, perms: '' },
      { id: 'secretary', nameBn: 'সম্পাদক', nameEn: 'Secretary', maxCount: 1, perms: '' },
      { id: 'treasurer', nameBn: 'কোষাধ্যক্ষ', nameEn: 'Treasurer', maxCount: 1, perms: '' },
      { id: 'member', nameBn: 'সদস্য', nameEn: 'Member', maxCount: 0, perms: '' },
    ],
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
  function itemOf(kind, id) {
    return get(kind).find(function (x) { return x.id === id; }) || null;
  }
  // A post's permission set, as an array. Empty means the post grants nothing —
  // which is a real, deliberate state, not a missing value.
  function permsOf(id) {
    const it = itemOf('position', id);
    return String((it && it.perms) || '').split(',').filter(Boolean);
  }
  // 0 = unlimited. Only a positive number caps how many people may hold a post.
  function maxOf(id) {
    const it = itemOf('position', id);
    return Math.max(0, Number(it && it.maxCount) || 0);
  }
  // Would putting one more person in this post break its cap? `held` is how many
  // already hold it, EXCLUDING the person being edited — the caller knows which.
  function isFull(id, held) {
    const m = maxOf(id);
    return m > 0 && held >= m;
  }
  // { positionId: cap } for every capped post — handed to Aggregate.reconcile so
  // the anomaly desk can catch two people sharing a one-person post when the
  // client-side block was bypassed (two admins, both offline).
  function maxMap() {
    const out = {};
    get('position').forEach(function (p) { const m = Math.max(0, Number(p.maxCount) || 0); if (m > 0) out[p.id] = m; });
    return out;
  }
  return { get: get, labelOf: labelOf, refresh: refresh,
           itemOf: itemOf, permsOf: permsOf, maxOf: maxOf, isFull: isFull, maxMap: maxMap };
})();
