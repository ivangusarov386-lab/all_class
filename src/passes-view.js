import { PASS_REFRESH_MS, loadStudent, storeStudent, passRequest, rosterForClass, studentPasses, passExpiresAt, moscowExit } from './passes.js';
import { passQR } from './pass-qr.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const networkError = error => error?.name === 'AbortError'
  ? 'Не удалось дождаться ответа. Проверьте соединение и повторите.'
  : error?.message?.startsWith('Failed to fetch') || error instanceof TypeError
    ? 'Нет соединения с таблицей. Проверьте интернет и повторите.' : error.message;

export class PassesView {
  constructor() {
    this.choice = loadStudent(); this.className = ''; this.active = false;
    this.students = []; this.rosterState = 'idle'; this.rosterError = '';
    this.passes = []; this.passWarnings = []; this.passState = 'idle'; this.passError = ''; this.updatedAt = null;
    this.timer = null; this.expiryTimer = null; this.generation = 0;
    document.addEventListener('visibilitychange', () => {
      this.stopPolling();
      if (this.visible()) { this.refresh(); this.startPolling(); }
      else this.cancelPassRequest();
    });
    window.addEventListener('storage', event => {
      if (event.key === 'all-class-student-v1' || event.key === null) {
        const choice = loadStudent();
        this.selectStudent(choice?.className === this.className ? choice.studentId : 0, false);
      }
    });
  }
  visible() { return this.active && !document.hidden && this.root?.isConnected; }
  mount(root, className) {
    this.root = root;
    if (className !== this.className) {
      this.cancelRosterRequest(); this.clearPasses(); this.stopPolling();
      this.className = className; this.students = []; this.rosterState = 'idle'; this.rosterError = '';
      if (this.choice?.className !== className) { this.choice = null; storeStudent(null); }
    }
    this.paint();
    if (this.rosterState === 'idle') this.loadRoster();
  }
  reset() {
    this.cancelRosterRequest(); this.clearPasses(); this.stopPolling();
    this.choice = null; storeStudent(null); this.className = ''; this.rosterState = 'idle';
    this.students = []; this.active = false; this.root = null;
  }
  cancelRosterRequest() { this.rosterAbort?.abort(); }
  cancelPassRequest() {
    this.generation++; this.passAbort?.abort(); this.passAbort = null;
    if (this.passState === 'loading') this.passState = this.updatedAt ? 'ready' : 'idle';
  }
  clearPasses() {
    this.cancelPassRequest(); this.passes = []; this.passWarnings = []; this.passState = 'idle'; this.passError = ''; this.updatedAt = null;
  }
  async loadRoster() {
    this.cancelRosterRequest();
    const controller = new AbortController(); this.rosterAbort = controller;
    const className = this.className;
    const timeout = setTimeout(() => controller.abort(), 20000);
    this.rosterState = 'loading'; this.rosterError = ''; this.paint();
    try {
      const result = await passRequest({ action: 'students' }, { signal: controller.signal });
      if (this.rosterAbort !== controller || this.className !== className) return;
      this.students = rosterForClass(result.students, className); this.rosterState = 'ready';
      if (this.choice && !this.students.some(student => student.studentId === this.choice.studentId)) {
        this.choice = null; storeStudent(null); this.clearPasses();
      }
      this.paint();
      if (this.visible()) { this.refresh(); this.startPolling(); }
    } catch (error) {
      if (this.rosterAbort !== controller || this.className !== className) return;
      this.rosterState = 'error'; this.rosterError = networkError(error); this.paint();
    } finally { clearTimeout(timeout); }
  }
  selectStudent(id, persist = true) {
    // Clear synchronously BEFORE a new identity or any asynchronous request is used.
    this.clearPasses(); this.stopPolling();
    this.choice = this.students.find(student => student.studentId === Number(id)) || null;
    if (persist) this.storageFailed = !storeStudent(this.choice);
    this.paint();
    if (this.visible()) { this.refresh(); this.startPolling(); }
  }
  setActive(active) {
    this.active = active;
    this.stopPolling();
    if (!active) this.cancelPassRequest();
    this.paint();
    if (this.visible()) { this.refresh(); this.startPolling(); }
  }
  startPolling() {
    this.stopPolling();
    if (this.visible() && this.choice && this.rosterState === 'ready') {
      this.timer = setInterval(() => { if (this.visible()) this.refresh(); }, PASS_REFRESH_MS);
    }
  }
  stopPolling() {
    clearInterval(this.timer);
    clearTimeout(this.expiryTimer);
    this.timer = null;
    this.expiryTimer = null;
  }
  async refresh() {
    if (!this.visible() || !this.choice || this.rosterState !== 'ready' || this.passAbort) return;
    const controller = new AbortController(); this.passAbort = controller;
    const generation = ++this.generation, choice = { ...this.choice };
    const timeout = setTimeout(() => controller.abort(), 20000);
    this.passState = 'loading'; this.passError = ''; this.paintPasses();
    try {
      const result = await passRequest({ action: 'studentPasses', studentId: choice.studentId, className: choice.className }, { signal: controller.signal });
      if (generation !== this.generation || !this.visible()) return;
      this.passes = studentPasses(result.passes, choice);
      this.passWarnings = Array.isArray(result.warnings)
        ? result.warnings.filter(warning => Number.isSafeInteger(warning?.rowNumber) && warning.rowNumber > 1)
        : [];
      this.passState = 'ready'; this.updatedAt = new Date();
    } catch (error) {
      if (generation !== this.generation || !this.visible()) return;
      this.passes = []; this.passWarnings = []; this.passState = 'error'; this.passError = networkError(error); this.updatedAt = null;
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) { this.passAbort = null; this.paintPasses(); }
    }
  }
  paint() {
    if (!this.root?.isConnected) return;
    const focused = this.root.contains(document.activeElement) ? document.activeElement.id : null;
    const loading = this.rosterState === 'loading';
    this.root.innerHTML = `<div class="student-profile">
      <div class="field"><label for="student-select">Ученик · ${esc(this.className)}</label>
        <select id="student-select" ${loading || this.rosterState !== 'ready' || !this.students.length ? 'disabled' : ''} aria-describedby="student-hint">
          <option value="">${loading ? 'Загружаем учеников…' : 'Выберите ученика'}</option>
          ${this.students.map(student => `<option value="${student.studentId}" ${student.studentId === this.choice?.studentId ? 'selected' : ''}>${esc(student.studentName)}</option>`).join('')}
        </select>
      </div>
      <p id="student-hint" ${this.rosterState === 'error' ? 'role="alert"' : ''}>${this.rosterState === 'error' ? esc(this.rosterError) : this.rosterState === 'ready' && !this.students.length ? 'В таблице пока нет учеников этого класса. Расписание доступно.' : this.storageFailed ? 'Выбор сохранён только на это посещение: браузер запретил локальное хранение.' : 'Выбор сохранится на этом устройстве. Пропуски привязаны к ученику.'}</p>
      ${this.rosterState === 'error' ? '<button id="retry-students" type="button">Повторить загрузку учеников</button>' : ''}
    </div>
    <nav class="student-sections" aria-label="Разделы приложения"><button id="show-schedule" type="button" aria-pressed="${!this.active}" aria-controls="schedule-panel">Расписание</button><button id="show-passes" type="button" aria-pressed="${this.active}" aria-controls="passes-panel">Пропуски</button></nav>
    <section id="passes-panel" class="passes-panel" aria-labelledby="passes-heading" ${this.active ? '' : 'hidden'}></section>`;
    this.root.querySelector('#student-select').onchange = event => this.selectStudent(event.target.value);
    this.root.querySelector('#retry-students')?.addEventListener('click', () => this.loadRoster());
    this.root.querySelector('#show-schedule').onclick = () => this.setActive(false);
    this.root.querySelector('#show-passes').onclick = () => this.setActive(true);
    document.querySelector('#schedule-panel')?.toggleAttribute('hidden', this.active);
    document.querySelector('.source-note')?.toggleAttribute('hidden', this.active);
    this.paintPasses();
    if (focused) this.root.querySelector(`#${focused}`)?.focus({ preventScroll: true });
  }
  paintPasses() {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const panel = this.root?.querySelector('#passes-panel');
    if (!panel || !this.active) return;
    this.passes = this.passes.filter(pass => passExpiresAt(pass) > Date.now());
    if (this.visible() && this.passes.length) {
      const nextExpiry = Math.min(...this.passes.map(passExpiresAt));
      const delay = Math.min(Math.max(nextExpiry - Date.now(), 0), 2147483647);
      this.expiryTimer = setTimeout(() => this.paintPasses(), delay);
    }
    const selected = this.students.find(student => student.studentId === this.choice?.studentId);
    const loading = this.passState === 'loading';
    let content;
    if (!selected) content = `<div class="passes-message"><h3>Выберите ученика</h3><p>Укажите своё имя в списке выше, чтобы увидеть пропуски.</p></div>`;
    else if (this.passState === 'error') content = `<div class="passes-message passes-error" role="alert"><h3>Не удалось загрузить пропуски</h3><p>${esc(this.passError)}</p></div>`;
    else if (this.passes.length) content = this.passes.map((pass, index) => this.card(pass, index)).join('');
    else content = `<div class="passes-message"><h3>${loading ? 'Загружаем пропуски…' : 'Пропусков пока нет'}</h3><p>${loading ? 'Проверяем записи в таблице.' : 'Когда учитель оформит пропуск, он появится здесь автоматически.'}</p></div>`;
    const status = loading ? 'Обновляем пропуски…' : this.updatedAt ? `Обновлено в ${moscowExit(this.updatedAt).time} · Москва` : '';
    panel.innerHTML = `<div class="passes-heading"><div><p class="passes-eyebrow">Выход из школы</p><h2 id="passes-heading">Пропуски</h2><p>${selected ? `${esc(selected.studentName)} · ${esc(this.className)}` : 'Личные пропуски ученика'}</p></div><button id="refresh-passes" type="button" ${!selected || loading || this.rosterState !== 'ready' ? 'disabled' : ''}>${loading ? 'Загрузка…' : 'Обновить'}</button></div>
      <p class="passes-auto">Автообновление каждые 15 секунд, пока раздел открыт.</p>
      <p class="passes-status" role="status" aria-live="polite">${esc(status)}</p>
      ${this.passWarnings.length ? `<p class="passes-warning" role="status">Некоторые строки пропусков требуют проверки учителем. Строки ${this.passWarnings.map(warning => warning.rowNumber).join(', ')}.</p>` : ''}
      <div class="pass-list" aria-busy="${loading}">${content}</div>`;
    panel.querySelector('#refresh-passes').onclick = () => this.refresh();
  }
  card(pass, index) {
    const exit = moscowExit(pass.exitAt);
    let qr;
    try { qr = passQR(pass.qrPayload, `pass-qr-title-${index}`); }
    catch { qr = '<p role="alert">Не удалось сформировать QR-код. Обратитесь к учителю.</p>'; }
    return `<article class="pass-card" data-pass-id="${esc(pass.id)}"><div class="pass-details"><span class="pass-label">Пропуск на выход</span><h3>${esc(pass.studentName)}</h3><p class="pass-class">${esc(pass.className)} класс</p><div class="pass-exit"><span>${esc(exit.date)}</span><strong>${esc(exit.time)} <small>МСК</small></strong></div><p class="pass-id">ID пропуска<br><span>${esc(pass.id)}</span></p></div><div class="pass-code">${qr}<p>Покажите QR-код сотруднику школы</p></div></article>`;
  }
}
