// Deployment config. SCRIPT_URL is baked in after the owner deploys the
// Apps Script web app (docs/user-guide/setup-google.md); Settings'
// scriptUrl field overrides it (useful for testing).
// NOTE: assigned to window (not `const`) because auth.js/sync.js read it as
// `window.CONFIG`; a top-level `const` is NOT a window property, which made
// apiUrl() always empty → every login/register failed with "Sync URL not set".
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwkGqknn1VIQnwe6gs7Qrh6XiI-7phg7Uhc0QGkynNmVsqTiIblgeJr_gHbYY9WDkWOQw/exec',
};
