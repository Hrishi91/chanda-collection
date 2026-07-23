// Web Speech API wrapper. Guided flow only — result goes into the input
// box for the user to confirm, never saved directly.
const Voice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let active = null;

  function supported() { return !!SR; }

  function start(onResult, onEnd, onError) {
    if (!SR) { onError && onError('unsupported'); return null; }
    stop();
    const r = new SR();
    r.lang = Settings.get('lang') === 'bn' ? 'bn-IN' : 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = function (e) {
      const txt = e.results[0][0].transcript;
      onResult && onResult(txt);
    };
    r.onerror = function (e) { onError && onError(e.error); };
    r.onend = function () { active = null; onEnd && onEnd(); };
    active = r;
    try { r.start(); } catch (e) { active = null; onError && onError('start-failed'); }
    return r;
  }

  function stop() {
    if (active) { try { active.stop(); } catch (e) {} active = null; }
  }

  return { supported: supported, start: start, stop: stop };
})();
