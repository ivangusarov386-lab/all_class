import { EXPORT_URL, SHEET_URL, readReplacementWorkbook, teacherKey } from './replacements.js';
import { dateKey, monthKey, dateInMonth, shiftMonth, monthGrid, monthOptions } from './calendar.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const today = () => new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date()) + 'T12:00:00');
const fmt = (date, options) => new Intl.DateTimeFormat('ru-RU', options).format(date);
const shortDate = key => fmt(new Date(key + 'T12:00:00'), { day: 'numeric', month: 'long' });
const plural = (n, one, few, many) => `${n} ${n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many}`;
const externalIcon = '<svg class="inline-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 17 17 7M7 7h10v10"/></svg>';
const logoURL = new URL('../assets/school-emblem.svg', import.meta.url).href;
const empty = () => ({ version: 2, entries: [], unresolved: [], coverage: [], sheets: [], stats: {} });
let selected = today(), calendarOpen = false, data, snapshot = empty(), replacements = empty();
let className = read('school-class', '9Ц'), origin = 'snapshot', busy = false, failure = '', importMessage = '';
const validDataset = value => value?.version === 2 && Array.isArray(value.entries) && Array.isArray(value.unresolved) && Array.isArray(value.coverage);

function move(days) { selected.setDate(selected.getDate() + days); render(); }
function selectDate(key) {
  const wasOpen = calendarOpen;
  selected = new Date(key + 'T12:00:00'); calendarOpen = false; render();
  if (wasOpen) $('#toggle-calendar').focus({ preventScroll: true });
}
function changeMonth(key) { selected = dateInMonth(selected, key); calendarOpen = true; render(); }
function moveMonth(delta) { selected = shiftMonth(selected, delta); calendarOpen = true; render(); }

function monthPanelHTML(counts) {
  const selectedKey = dateKey(selected), currentKey = dateKey(today());
  const monthLabel = fmt(selected, { month: 'long', year: 'numeric' }).replace(' г.', '');
  const hasSourceData = replacements.coverage.some(key => key.startsWith(monthKey(selected)));
  return `<div class="month-panel-heading"><span>Выберите дату</span><div class="month-controls"><button id="month-prev" aria-label="Предыдущий месяц">←</button><button id="month-next" aria-label="Следующий месяц">→</button></div></div>
    <div class="month-weekdays" aria-hidden="true">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<span>${day}</span>`).join('')}</div>
    <div class="month-grid" role="group" aria-label="Даты: ${esc(monthLabel)}">${monthGrid(selected).map(cell => {
      const count = counts.get(cell.key) || { changes: 0, pending: 0 };
      const label = fmt(cell.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (count.changes ? ', ' + plural(count.changes, 'замена', 'замены', 'замен') : '') + (count.pending ? ', ' + plural(count.pending, 'запись для уточнения', 'записи для уточнения', 'записей для уточнения') : '');
      return `<button id="calendar-day-${cell.key}" data-date="${cell.key}" class="month-day ${cell.outside ? 'outside-month' : ''} ${cell.key === selectedKey ? 'selected' : ''} ${cell.key === currentKey ? 'today' : ''}" aria-label="${esc(label)}" aria-pressed="${cell.key === selectedKey}" ${cell.key === currentKey ? 'aria-current="date"' : ''}><span>${cell.date.getDate()}</span><span class="date-markers">${count.changes ? '<i class="replacement-marker"></i>' : ''}${count.pending ? '<i class="pending-marker"></i>' : ''}</span></button>`;
    }).join('')}</div>
    <div class="calendar-legend"><span><i class="replacement-marker"></i>Замены ${esc(className)}</span><span><i class="pending-marker"></i>Нужно уточнить</span></div>
    ${hasSourceData ? '' : '<p class="month-data-note">В таблице пока нет записей за этот месяц. Доступно основное расписание.</p>'}`;
}

function sheetReportsHTML() {
  const reports = replacements.sheetReports || [];
  if (!reports.length) return (replacements.sheets || []).map(name => `<p class="small">${esc(name)}</p>`).join('');
  const monthLabel = key => fmt(new Date(key + '-01T12:00:00'), { month: 'long', year: 'numeric' }).replace(' г.', '');
  const fullDate = key => fmt(new Date(key + 'T12:00:00'), { day: 'numeric', month: 'short', year: 'numeric' });
  return `<ul class="sheet-reports">${reports.map(report => `<li><strong>${esc(report.name)}</strong><span>${report.firstDate ? `Даты записей: ${fullDate(report.firstDate)} — ${fullDate(report.lastDate)}.` : 'Заполненных дат пока нет.'}</span><span>${Object.entries(report.monthCounts).map(([key, count]) => `${monthLabel(key)}: ${plural(count, 'строка', 'строки', 'строк')}`).join('; ')}</span>${report.otherMonthRows ? `<span class="sheet-month-note">${plural(report.otherMonthRows, 'строка относится', 'строки относятся', 'строк относятся')} к другим месяцам. Учитываются даты самих записей.</span>` : ''}</li>`).join('')}</ul>`;
}

function updateClass(value) { className = value; save('school-class', className); render(); }
function syncStatus() {
  const label = origin === 'file' ? 'Загруженный файл' : origin === 'google' ? 'Google Таблицы' : 'Сохранённая копия таблицы';
  const timestamp = replacements.fetchedAt ? fmt(new Date(replacements.fetchedAt), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '';
  if (busy) return 'Обновляем замены из Google Таблиц…';
  return `${failure ? 'Не удалось обновить. ' : ''}${label}${timestamp ? ' · ' + timestamp : ''}`;
}

function render() {
  const dialogOpen = $('#source-dialog')?.open;
  const focused = document.activeElement?.id;
  const classes = Object.keys(data.classes).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b, 'ru'));
  if (!classes.includes(className)) className = classes[0];
  const grade = parseInt(className), grades = [...new Set(classes.map(name => parseInt(name)))];
  const sourceMonths = [...new Set([...replacements.coverage.map(key => key.slice(0, 7)), ...(replacements.sheetReports || []).map(report => report.declaredMonth).filter(Boolean)])];
  const months = monthOptions(today(), selected, sourceMonths);
  const dayCounts = new Map();
  for (const [name, rows] of [['changes', replacements.entries], ['pending', replacements.unresolved]]) {
    for (const row of rows) {
      if (row.className !== className || !row.date) continue;
      if (!dayCounts.has(row.date)) dayCounts.set(row.date, { changes: 0, pending: 0 });
      dayCounts.get(row.date)[name]++;
    }
  }
  const key = dateKey(selected), isToday = key === dateKey(today()), day = (selected.getDay() + 6) % 7;
  const slots = data.classes[className][String(day)] || {};
  const changes = replacements.entries.filter(row => row.className === className && row.date === key);
  const pending = replacements.unresolved.filter(row => row.className === className && row.date === key);
  const numbers = [...new Set([...Object.keys(slots).map(Number), ...changes.map(row => row.lesson)])].sort((a, b) => a - b);
  const relevantDates = [...replacements.entries, ...replacements.unresolved].filter(row => row.className === className && row.date).map(row => row.date).sort();
  const lastDate = relevantDates.at(-1), latest = replacements.coverage.at(-1);
  const review = replacements.unresolved.filter(row => row.className === className || !row.className).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const week = new Date(selected); week.setDate(week.getDate() - day);
  const coverageNote = !replacements.coverage.includes(key)
    ? `На ${shortDate(key)} в таблице пока нет записей замен. Показано основное расписание.`
    : !changes.length && !pending.length ? `Для ${className} на этот день замен в таблице не указано.` : '';
  const badge = changes.length ? plural(changes.length, 'замена', 'замены', 'замен') : pending.length ? 'Есть записи для проверки' : 'Базовое расписание';
  $('#app').innerHTML = `
    <div class="page">
      <header class="topbar">
        <a href="./" class="brand"><img class="school-emblem" src="${logoURL}" alt="Герб школы" width="48" height="48"> Школьное расписание</a>
        <button class="text-button" id="settings">Источники ${externalIcon}</button>
      </header>
      <main>
        <section class="hero"><div class="class-badge" aria-label="Выбранный класс ${esc(className)}">${esc(className)}</div><div class="hero-copy"><p>Все уроки под рукой</p><h1>Твой учебный день.</h1><p class="subtitle">Выбери класс. Остальное — по расписанию.</p></div></section>
        <section class="chooser" aria-label="Выбор класса">
          <div class="field"><label for="grade">Параллель</label><select id="grade">${grades.map(g => `<option ${g === grade ? 'selected' : ''} value="${g}">${g}-я</option>`).join('')}</select></div>
          <div class="field class-field"><label for="class-select">Класс</label><select id="class-select">${classes.filter(name => parseInt(name) === grade).map(name => `<option value="${esc(name)}" ${name === className ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        </section>
        <section class="calendar">
          <div class="calendar-toolbar"><div class="field month-field"><label class="sr-only" for="month-select">Месяц расписания</label><select id="month-select">${months.map(month => `<option value="${month}" ${month === monthKey(selected) ? 'selected' : ''}>${esc(fmt(new Date(month + '-01T12:00:00'), { month: 'long', year: 'numeric' }).replace(' г.', ''))}</option>`).join('')}</select></div><button id="toggle-calendar" class="calendar-toggle" aria-label="${calendarOpen ? 'Скрыть календарь' : 'Открыть календарь'}" aria-controls="month-panel" aria-expanded="${calendarOpen}"><svg class="inline-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></svg> Даты <span aria-hidden="true">${calendarOpen ? '⌃' : '⌄'}</span></button></div>
          <div class="calendar-heading"><div><h2>${isToday ? 'Сегодня' : esc(fmt(selected, { weekday: 'long' }))}<span class="date-label">${shortDate(key)}</span></h2></div><div class="day-controls"><button id="today">Сегодня</button><button id="prev" aria-label="Предыдущий день">←</button><button id="next" aria-label="Следующий день">→</button></div></div>
          <div id="month-panel" class="month-panel" ${calendarOpen ? '' : 'hidden'}>${calendarOpen ? monthPanelHTML(dayCounts) : ''}</div>
          <div class="week" aria-label="Дни недели" ${calendarOpen ? 'hidden' : ''}>${calendarOpen ? '' : Array.from({ length: 7 }, (_, index) => {
            const date = new Date(week); date.setDate(date.getDate() + index);
            return `<button data-date="${dateKey(date)}" aria-pressed="${dateKey(date) === key}" class="week-day ${dateKey(date) === key ? 'selected' : ''} ${dateKey(date) === dateKey(today()) ? 'is-today' : ''}"><span>${fmt(date, { weekday: 'short' })}</span><strong>${date.getDate()}</strong><i></i></button>`;
          }).join('')}</div>
          <div class="schedule-meta"><div class="schedule-summary"><span class="selected-class">${esc(className)} класс</span><span>${numbers.length ? plural(numbers.length, 'урок', 'урока', 'уроков') : 'Нет занятий'}</span></div><span class="change-tag ${changes.length ? 'has-changes' : ''}">${badge}</span></div>
          ${coverageNote ? `<div class="coverage-note" role="status"><p>${esc(coverageNote)}</p>${lastDate && lastDate !== key ? `<button id="last-changes">Последние записи для класса: ${shortDate(lastDate)}</button>` : ''}</div>` : ''}
          ${pending.length ? `<section class="unmatched"><h3>Нужно уточнить ${plural(pending.length, 'запись', 'записи', 'записей')}</h3><p>Эти замены есть в таблице, но пока не привязаны к конкретному занятию.</p><ul>${pending.map(row => `<li><strong>${row.lesson ? row.lesson + ' урок · ' : ''}${row.cancelled ? 'Отмена · ' : ''}${esc(row.subject || row.originalSubject || 'Предмет не указан')}</strong><span>${esc(row.teacher || 'Учитель не указан')}${row.room ? ' · Каб. ' + esc(row.room) : ''}</span><span>${esc(row.reason)}</span><small>${esc(row.source?.sheet)} · строка ${esc(row.source?.row)}</small></li>`).join('')}</ul></section>` : ''}
          <div class="lessons" id="lessons">${numbers.length ? numbers.map(number => lessonHTML(number, slots[String(number)] || [], changes.filter(row => row.lesson === number))).join('') : `<div class="empty"><span aria-hidden="true">☀</span><h3>${day === 6 ? 'Воскресенье. Можно выдохнуть.' : 'На этот день уроков нет'}</h3><p>В исходном расписании занятия не указаны.</p><button id="next-school">Следующий учебный день</button></div>`}</div>
          <div class="sync-bar"><div><span class="status-dot ${failure ? '' : 'loaded'}"></span><span id="sync-status" role="status">${esc(syncStatus())}</span></div><button id="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Загрузка…' : '↻ Обновить замены'}</button></div>
        </section>
        <p class="source-note">Красным — замена, зачёркнуто — исходное занятие.${latest ? ' Последние записи в таблице: ' + shortDate(latest) + '.' : ''}<br>Время уроков — московское. Смахните влево или вправо, чтобы сменить день.</p>
        <footer><span>Учиться проще, когда всё по порядку.</span><button class="text-button" id="details">О расписании</button></footer>
      </main>
    </div>
    <dialog id="source-dialog">
      <div class="dialog-header"><h2>Источники расписания</h2><button id="close-dialog" aria-label="Закрыть">×</button></div>
      <p>Основное расписание: ${classes.length} классов, понедельник — суббота. Загружено из вашей таблицы Excel.</p>
      <h3>Замены из Google Таблиц</h3>
      <p>Обновляются при открытии сайта и каждые 5 минут, пока страница открыта. При отсутствии сети остаётся последняя сохранённая копия. ${latest ? `Последняя дата с записями: ${shortDate(latest)}.` : ''}</p>
      <p>Сопоставлено ${plural(replacements.entries.length, 'занятие', 'занятия', 'занятий')}. Для уточнения: ${plural(replacements.unresolved.length, 'запись', 'записи', 'записей')}. Классы, отсутствующие в основном расписании, пропущены.</p>
      <h3>Проверенные листы</h3>
      ${sheetReportsHTML()}
      <a href="${SHEET_URL}" target="_blank" rel="noreferrer">Открыть таблицу замен ${externalIcon}</a>
      <label class="upload">Загрузить XLSX или CSV<input id="import-file" type="file" accept=".xlsx,.xls,.csv"></label>
      <p class="small">Можно загрузить исходную школьную таблицу целиком или файл по шаблону. Диапазоны уроков распознаются. Номер отсутствующего урока определяется только при однозначном совпадении. После ручного импорта автоматическое обновление приостанавливается; кнопка «Обновить замены» снова загрузит Google Таблицу.</p>
      <a href="${new URL('../replacement-template.csv', import.meta.url).href}" download>Скачать шаблон CSV</a>
      <p id="import-status" role="status">${esc(importMessage)}</p>
      <button id="clear" class="danger-button">Сбросить локальный импорт</button>
      ${review.length ? `<details class="source-review"><summary>Записи для проверки: ${esc(className)} и строки без класса (${review.length})</summary><p class="small">Показаны последние ${Math.min(30, review.length)} записей. Исправьте исходную строку в Google Таблице и обновите замены.</p><ul>${review.slice(0, 30).map(row => `<li><strong>${row.date ? shortDate(row.date) : 'Без даты'} · ${esc(row.sourceClass)}${row.lesson ? ' · ' + row.lesson + ' урок' : ''}</strong><span>${esc(row.subject || row.originalSubject)} · ${esc(row.teacher)}</span><span>${esc(row.reason)}</span><small>${esc(row.source?.sheet)} · строка ${esc(row.source?.row)}</small></li>`).join('')}</ul></details>` : ''}
      <details><summary>Особенности исходных таблиц</summary>${data.notes.map(note => `<p class="small">${esc(note)}</p>`).join('')}<p class="small">Даты берутся из строк, а не из названия листа. Повторы удаляются. При замене одной подгруппы зачёркивается только её учитель. Если кабинет не заполнен в таблице замен, приложение не подставляет его автоматически.</p></details>
    </dialog>`;
  $('#grade').onchange = event => updateClass(classes.find(name => parseInt(name) === +event.target.value));
  $('#class-select').onchange = event => updateClass(event.target.value);
  document.querySelectorAll('[data-date]').forEach(button => button.onclick = () => selectDate(button.dataset.date));
  $('#month-select').onchange = event => changeMonth(event.target.value);
  $('#toggle-calendar').onclick = () => { calendarOpen = !calendarOpen; render(); };
  if ($('#month-prev')) $('#month-prev').onclick = () => moveMonth(-1);
  if ($('#month-next')) $('#month-next').onclick = () => moveMonth(1);
  $('#month-panel').onkeydown = event => { if (event.key === 'Escape') { calendarOpen = false; render(); $('#toggle-calendar').focus(); } };
  $('#prev').onclick = () => move(-1); $('#next').onclick = () => move(1);
  $('#today').onclick = () => selectDate(dateKey(today()));
  if ($('#last-changes')) $('#last-changes').onclick = () => selectDate(lastDate);
  if ($('#next-school')) $('#next-school').onclick = () => { for (let i = 0; i < 7; i++) { selected.setDate(selected.getDate() + 1); if (Object.keys(data.classes[className][String((selected.getDay() + 6) % 7)] || {}).length) break; } render(); };
  $('#settings').onclick = $('#details').onclick = () => $('#source-dialog').showModal();
  $('#close-dialog').onclick = () => $('#source-dialog').close();
  $('#refresh').onclick = () => sync(); $('#import-file').onchange = importFile;
  $('#clear').onclick = () => { replacements = snapshot; origin = 'snapshot'; failure = ''; save('school-replacements-v2', null); importMessage = 'Локальный импорт сброшен. Показана школьная таблица.'; render(); };
  let touch;
  $('.calendar').addEventListener('touchstart', event => { touch = event.changedTouches[0]; }, { passive: true });
  $('.calendar').addEventListener('touchend', event => { const point = event.changedTouches[0]; if (touch && Math.abs(point.clientX - touch.clientX) > 70 && Math.abs(point.clientY - touch.clientY) < 60) { const direction = point.clientX < touch.clientX ? 1 : -1; if (calendarOpen) moveMonth(direction); else move(direction); } }, { passive: true });
  if (dialogOpen) $('#source-dialog').showModal();
  if (focused && document.getElementById(focused)) document.getElementById(focused).focus({ preventScroll: true });
}

function replacementHTML(row) {
  if (row.cancelled) return `<div class="replacement"><span class="replacement-label">Отмена</span><h3>Урок отменён</h3><p>${esc(row.subject || row.originalSubject)}</p></div>`;
  const sourceMismatch = row.originalTeacher && row.targetTeachers.length && !row.targetTeachers.some(name => teacherKey(name) === teacherKey(row.originalTeacher));
  return `<div class="replacement"><span class="replacement-label">${row.addedLesson ? 'Занятие из таблицы замен' : 'Замена'}</span><h3>${esc(row.subject || row.originalSubject || 'Предмет не указан')}</h3><p>${esc(row.teacher || 'Учитель не указан')} · ${row.room ? 'Каб. ' + esc(row.room) : 'Кабинет не указан в заменах'}</p>${row.inferredLesson ? '<small>Номер урока определён по основному расписанию</small>' : ''}${sourceMismatch ? `<small>В таблице: вместо ${esc(row.originalTeacher)}</small>` : ''}</div>`;
}

function lessonHTML(number, items, changes) {
  const bell = data.bells[number - 1], shown = new Set();
  let content = items.map(item => {
    const matching = changes.filter(row => row.targetTeachers.includes(item.teacher));
    const labels = matching.filter(row => !shown.has(row)).map(row => { shown.add(row); return replacementHTML(row); }).join('');
    return `${labels}<div class="original ${matching.length ? 'crossed' : ''}"><h3>${esc(item.subject)}</h3><p>${esc(item.teacher)}${item.room ? ' · Каб. ' + esc(item.room) : ''}</p></div>`;
  }).join('');
  content += changes.filter(row => !shown.has(row)).map(replacementHTML).join('');
  return `<article class="lesson ${changes.length ? 'changed' : ''}"><div class="lesson-time"><strong>${esc(bell.start)}</strong><span>${esc(bell.end)}</span></div><div class="lesson-number">${number}</div><div class="lesson-content">${content}${items.length > 1 ? '<span class="group-note">Учителя / подгруппы из основного расписания</span>' : ''}</div></article>`;
}

async function importFile(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw Error('Максимальный размер файла — 5 МБ.');
    const result = await readReplacementWorkbook(await file.arrayBuffer(), data);
    if (!result.entries.length && !result.unresolved.some(row => data.classes[row.className])) throw Error('В файле нет замен для классов основного расписания.');
    replacements = result; origin = 'file'; failure = ''; importMessage = 'Файл загружен. Записи для проверки отмечены в соответствующих днях.';
    save('school-replacements-v2', { ...result, origin }); render();
  } catch (error) { importMessage = error.message; if ($('#import-status')) $('#import-status').textContent = importMessage; }
}

async function sync({ quiet = false } = {}) {
  if (busy || (quiet && origin === 'file')) return;
  busy = true; failure = ''; render();
  try {
    const response = await fetch(EXPORT_URL, { signal: AbortSignal.timeout(20000), cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const result = await readReplacementWorkbook(await response.arrayBuffer(), data);
    // A user's manual import made while the network request was pending wins.
    if (quiet && origin === 'file') return;
    replacements = result; origin = 'google'; save('school-replacements-v2', { ...result, origin });
  } catch { if (!quiet || origin !== 'file') failure = 'Таблица временно недоступна'; }
  finally { busy = false; render(); }
}

async function init() {
  try {
    const response = await fetch(new URL('../data/schedule.json', import.meta.url));
    if (!response.ok) throw Error();
    data = await response.json();
    try {
      const response = await fetch(new URL('../data/replacements.json', import.meta.url));
      const result = response.ok ? await response.json() : null;
      if (validDataset(result)) snapshot = result;
    } catch {}
    const cached = read('school-replacements-v2', null);
    if (validDataset(cached) && (cached.origin === 'file' || (Date.parse(cached.fetchedAt) || 0) > (Date.parse(snapshot.fetchedAt) || 0))) {
      replacements = cached; origin = cached.origin === 'file' ? 'file' : 'google';
    } else replacements = snapshot;
    render();
    sync({ quiet: true });
    setInterval(() => { if (!document.hidden) sync({ quiet: true }); }, 5 * 60 * 1000);
  } catch {
    $('#app').innerHTML = '<main class="load-error"><h1>Не удалось загрузить расписание</h1><p>Проверьте подключение и обновите страницу.</p><button onclick="location.reload()">Повторить</button></main>';
  }
}
init();
