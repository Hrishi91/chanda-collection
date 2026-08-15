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
  // A56: memoised on the RAW string, so it stays correct across writes without
  // anyone having to remember to invalidate it. cache() is reached through
  // labelOf → get, and matchParty calls labelOf twice per donor while the row
  // builder calls it twice more — at 500 donors that was ~1,000 JSON.parse per
  // keystroke in 📒 খাতা's search. Measured: 7.6 ms on an Apple-silicon Mac,
  // so roughly 90 ms per letter on the ₹5,000 Android this is actually for —
  // on the screen a collector opens to look somebody up with a donor waiting.
  // (A42 was verified against 8 rows; this only shows at real volume.)
  let memo = null, memoRaw = null;
  function cache() {
    try {
      const raw = localStorage.getItem(KEY) || 'null';
      if (raw !== memoRaw) { memoRaw = raw; memo = JSON.parse(raw); }
      return memo;
    } catch (e) { return null; }
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
  // A56: areas and locations change twice a season. This was called on every
  // 60 s poll, every window focus and every 🏪/🙍/🤝 tap — with eleven
  // collectors, ~1,320 needless Apps Script invocations an hour against a
  // 90-minute daily quota, and quota exhaustion looks like a generic network
  // failure. Once every five minutes is far more often than the data changes.
  let lastRefresh = 0;
  const REFRESH_MS = 5 * 60 * 1000;
  function refresh(force) {
    if (!navigator.onLine || !Auth.loggedIn() || !Sync.configured()) return Promise.resolve();
    const now = Date.now();
    if (!force && lastRefresh && (now - lastRefresh) < REFRESH_MS) return Promise.resolve();
    lastRefresh = now;
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
  // A115: the committee RANK of a post. 0 = no rank set, and a level-0 person
  // hands out nothing — the server says the same, and this is only the screen
  // agreeing with it early. Deliberately not seeded: the numbers are the
  // committee's to decide, and until they are typed in the admin appoints
  // everybody, exactly as before.
  function levelOf(id) {
    const it = itemOf('position', id);
    return Math.max(0, Number(it && it.level) || 0);
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
           itemOf: itemOf, permsOf: permsOf, maxOf: maxOf, levelOf: levelOf,
           isFull: isFull, maxMap: maxMap };
})();
