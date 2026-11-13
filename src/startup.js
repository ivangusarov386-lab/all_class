function showOpening() {
  const root = document.getElementById('opening-intro');
  const video = document.getElementById('opening-video');
  const app = document.getElementById('app');
  const skip = document.getElementById('skip-opening');
  const bypass = !root || !video || !skip || window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData;
  if (bypass) {
    root?.remove();
    return { finished: Promise.resolve(), dismiss() {} };
  }

  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  let closing = false, removed = false, started = false;
  let startTimer, stallTimer, limitTimer, fadeTimer;
  const clearPlaybackTimers = () => { clearTimeout(startTimer); clearTimeout(stallTimer); clearTimeout(limitTimer); };
  const remove = () => {
    if (removed) return;
    removed = true;
    clearPlaybackTimers(); clearTimeout(fadeTimer);
    document.removeEventListener('keydown', onKey);
    video.onended = video.onerror = video.onplaying = video.onwaiting = null;
    video.pause(); video.removeAttribute('src'); video.load();
    root.remove(); app.hidden = false;
    document.body.classList.remove('has-opening');
    resolveFinished();
  };
  const finish = ({ immediate = false } = {}) => {
    if (removed) return;
    if (closing) { if (immediate) remove(); return; }
    closing = true; clearPlaybackTimers(); video.pause();
    if (immediate) remove();
    else { root.classList.add('is-leaving'); fadeTimer = setTimeout(remove, 240); }
  };
  const onKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); }
  };

  root.hidden = false; app.hidden = true;
  document.body.classList.add('has-opening');
  skip.onclick = () => finish();
  document.addEventListener('keydown', onKey);
  skip.focus({ preventScroll: true });
  video.muted = true; video.playsInline = true;
  video.onended = () => finish();
  video.onerror = () => finish({ immediate: true });
  video.onplaying = () => { started = true; clearTimeout(startTimer); clearTimeout(stallTimer); };
  video.onwaiting = () => {
    if (started) { clearTimeout(stallTimer); stallTimer = setTimeout(() => finish(), 2500); }
  };
  // A slow, unsupported or interrupted video must never block the timetable.
  startTimer = setTimeout(() => finish(), 3500);
  limitTimer = setTimeout(() => finish(), 13500);
  video.src = new URL('../assets/opening.mp4', import.meta.url).href;
  try { video.play()?.catch(() => finish({ immediate: true })); }
  catch { finish({ immediate: true }); }
  return { finished, dismiss: () => finish({ immediate: true }) };
}

let opening;
try { opening = showOpening(); }
catch {
  document.getElementById('opening-intro')?.remove();
  document.getElementById('app').hidden = false;
  document.body.classList.remove('has-opening');
  opening = { finished: Promise.resolve(), dismiss() {} };
}

// Load code and timetable data while the intro plays; display the app after it.
import('./main.js?v=12').then(module => module.init({ beforeRender: opening.finished })).catch(error => {
  opening.dismiss();
  console.error('Unable to start school timetable:', error);
  document.getElementById('app').innerHTML = `
    <main class="startup" role="alert">
      <h1>Не удалось открыть расписание</h1>
      <p>Проверьте подключение к интернету и перезагрузите страницу.</p>
      <a href="">Перезагрузить страницу</a>
    </main>`;
});
