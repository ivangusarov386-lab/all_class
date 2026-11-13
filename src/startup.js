// Keep a useful screen even if the app module cannot be downloaded or started.
import('./main.js?v=10').catch(error => {
  console.error('Unable to start school timetable:', error);
  document.getElementById('app').innerHTML = `
    <main class="startup" role="alert">
      <h1>Не удалось открыть расписание</h1>
      <p>Проверьте подключение к интернету и перезагрузите страницу.</p>
      <a href="">Перезагрузить страницу</a>
    </main>`;
});
