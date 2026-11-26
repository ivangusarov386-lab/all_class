export const LOCK_KEY = 'all-class-entry-lock-v1';
const ITERATIONS = 600000;
const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));

export function readLock(storage = localStorage) {
  const raw = storage.getItem(LOCK_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (value?.version === 1 && value.mode === 'none') return value;
  if (value?.version !== 1 || value.mode !== 'password' || value.iterations !== ITERATIONS || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{64}$/.test(value.verifier)) throw Error('Повреждены настройки пароля. Доступ закрыт.');
  if (value.input !== undefined && (value.input !== 'pin' || value.length !== 4)) throw Error('Неверный формат PIN-кода.');
  return value;
}

async function derive(password, salt) {
  if (!globalThis.crypto?.subtle) throw Error('Для пароля требуется защищённое подключение HTTPS и современный браузер.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: ITERATIONS }, key, 256)));
}

export async function createLock(password) {
  if (typeof password !== 'string' || !/^\d{4}$/.test(password)) throw Error('PIN-код должен содержать 4 цифры.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, mode: 'password', input: 'pin', length: 4, iterations: ITERATIONS, salt, verifier: await derive(password, salt) };
}

export async function matchesPassword(password, record) {
  const actual = await derive(password, record.salt);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ record.verifier.charCodeAt(i);
  return difference === 0;
}

function persist(record) {
  const json = JSON.stringify(record);
  localStorage.setItem(LOCK_KEY, json);
  if (localStorage.getItem(LOCK_KEY) !== json) throw Error('Не удалось сохранить настройки пароля.');
}

class AppLock {
  constructor() {
    this.view = null;
    window.addEventListener('storage', event => {
      if (event.key === LOCK_KEY || event.key === null) location.reload();
    });
  }

  async enter() {
    let record;
    try { record = readLock(); }
    catch (error) {
      // Read failures cannot silently disable an existing password.
      return this.show('error', null, false);
    }
    if (record?.mode === 'none') return;
    if (record && record.input !== 'pin') {
      await this.show('unlock', record, false);
      if (!this.legacyVerified) return new Promise(() => {});
      this.legacyVerified = false;
      return this.showPin('setup', null, false);
    }
    return this.showPin(record ? 'unlock' : 'setup', record, false);
  }

  async settings() {
    if (this.view) return;
    try {
      const record = readLock();
      if (record?.mode === 'password' && record.input !== 'pin') {
        await this.show('unlock', record, true);
        // Cancelled legacy verification must not grant access to new settings.
        if (!this.legacyVerified) return;
        this.legacyVerified = false;
        return this.showPin('setup', null, true);
      }
      return this.showPin(record?.mode === 'password' ? 'manage' : 'setup', record, true);
    } catch { return this.show('error', null, true); }
  }

  dismiss() { this.close?.(); }

  showPin(mode, record, settings) {
    return new Promise(resolve => {
      const app = document.getElementById('app'), previousFocus = document.activeElement;
      const hidden = app.hidden, inert = app.inert;
      app.hidden = true; app.inert = true;
      const view = document.createElement('section'); this.view = view;
      view.className = 'entry-lock pin-lock';
      view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true'); view.setAttribute('aria-labelledby', 'entry-title');
      const erase = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h11v14H9l-7-7Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>';
      view.innerHTML = `<div class="entry-panel pin-panel"><img src="${new URL('../assets/school-emblem.svg', import.meta.url).href}" width="48" height="48" alt="Герб школы"><p class="entry-brand">All-Class · ЗилАрт 548</p>
        <h1 id="entry-title"></h1><p class="entry-description" id="pin-description"></p>
        <div id="pin-dots" class="pin-dots" aria-hidden="true">${'<span></span>'.repeat(4)}</div><span id="pin-progress" class="sr-only" role="status" aria-live="polite"></span>
        <p id="entry-error" class="password-error pin-error" role="alert"></p>
        <div id="pin-pad" class="pin-pad" role="group" aria-label="Цифровая клавиатура PIN-кода">${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="pin-key" data-pin-digit="${n}" aria-label="${n}">${n}</button>`).join('')}
          <button type="button" class="pin-key pin-function" id="pin-clear" aria-label="Очистить введённые цифры">C</button><button type="button" class="pin-key" data-pin-digit="0" aria-label="0">0</button><button type="button" class="pin-key pin-function" id="pin-delete" aria-label="Удалить последнюю цифру">${erase}</button></div>
        <div class="pin-actions"><button id="pin-change" class="entry-secondary" type="button" hidden>Изменить PIN-код</button><button id="pin-restart" class="text-button" type="button" hidden>Ввести новый код заново</button><button id="entry-without" class="entry-secondary" type="button">Продолжить без PIN-кода</button><button id="entry-once" class="entry-secondary" type="button" hidden>Без PIN-кода только в этот раз</button>${settings ? '<button id="entry-cancel" class="text-button" type="button">Отмена</button>' : ''}</div>
        <p class="entry-help">Код хранится только на этом устройстве. Системная клавиатура не нужна.</p></div>`;
      document.body.append(view);
      const $ = selector => view.querySelector(selector);
      let stage = mode === 'setup' ? 'choose' : 'current', buffer = '', first = '', busy = false, disposed = false;
      const close = () => { if (disposed) return; disposed = true; view.remove(); this.view = null; this.close = null; app.hidden = hidden; app.inert = inert; previousFocus?.focus?.({ preventScroll: true }); resolve(); };
      this.close = close;
      const paint = () => {
        $('#entry-title').textContent = stage === 'actions' ? 'Настройки PIN-кода' : stage === 'choose' ? 'Придумайте PIN-код' : stage === 'confirm' ? 'Повторите PIN-код' : 'Введите PIN-код';
        $('#pin-description').textContent = busy ? 'Проверяем…' : stage === 'actions' ? 'Выберите действие.' : stage === 'choose' ? 'Выберите 4 цифры для входа.' : stage === 'confirm' ? 'Нажмите те же 4 цифры ещё раз.' : 'Нажмите 4 цифры на экране.';
        $('#pin-pad').hidden = $('#pin-dots').hidden = stage === 'actions';
        $('#pin-change').hidden = stage !== 'actions';
        $('#pin-restart').hidden = stage !== 'confirm';
        $('#entry-without').hidden = mode === 'unlock' || (mode === 'manage' && stage !== 'actions');
        $('#entry-without').textContent = stage === 'actions' ? 'Отключить PIN-код' : 'Продолжить без PIN-кода';
        $('#pin-progress').textContent = busy ? 'Проверяем PIN-код' : `${$('#entry-title').textContent}: введено ${buffer.length} из 4 цифр`;
        [...$('#pin-dots').children].forEach((dot, i) => dot.classList.toggle('filled', i < buffer.length));
        view.querySelectorAll('button').forEach(button => { button.disabled = busy; });
      };
      const run = async action => { if (busy || disposed) return; busy = true; paint(); try { await action(); } catch (error) { if (!disposed) { buffer = ''; $('#entry-error').textContent = error.message || 'Не удалось сохранить PIN-код.'; } } finally { busy = false; if (!disposed) { paint(); if (stage === 'actions') $('#pin-change').focus(); } } };
      const add = digit => {
        if (busy || disposed || stage === 'actions' || buffer.length >= 4) return;
        $('#entry-error').textContent = ''; buffer += digit; paint();
        if (buffer.length !== 4) return;
        const entered = buffer;
        if (stage === 'choose') { first = entered; buffer = ''; stage = 'confirm'; paint(); return; }
        run(async () => {
          if (stage === 'current') {
            if (!await matchesPassword(entered, record)) throw Error('Неверный PIN-код. Попробуйте ещё раз.');
            if (mode === 'unlock') { close(); return; }
            stage = 'actions'; buffer = ''; return;
          }
          if (entered !== first) throw Error('PIN-коды не совпадают. Повторите код.');
          const next = await createLock(entered); if (disposed) return;
          persist(next); first = ''; close();
        });
      };
      view.querySelectorAll('[data-pin-digit]').forEach(button => { button.onclick = () => add(button.dataset.pinDigit); });
      const eraseOne = () => { if (!busy) { buffer = buffer.slice(0, -1); $('#entry-error').textContent = ''; paint(); } };
      $('#pin-delete').onclick = eraseOne;
      $('#pin-clear').onclick = () => { if (!busy) { buffer = ''; $('#entry-error').textContent = ''; paint(); } };
      $('#pin-restart').onclick = $('#pin-change').onclick = () => { first = buffer = ''; stage = 'choose'; $('#entry-error').textContent = ''; paint(); };
      $('#entry-without').onclick = () => {
        if (mode === 'unlock' || (mode === 'manage' && stage !== 'actions')) return;
        run(async () => {
        try { persist({ version: 1, mode: 'none' }); }
        catch { if (mode === 'setup') $('#entry-once').hidden = false; throw Error('Браузер не разрешил сохранить выбор. Настройки не изменены.'); }
        close();
        });
      };
      $('#entry-once').onclick = close;
      if ($('#entry-cancel')) $('#entry-cancel').onclick = close;
      view.onpaste = event => { event.preventDefault(); if (busy || disposed || stage === 'actions') return; const digits = event.clipboardData?.getData('text').trim(); if (/^\d{4}$/.test(digits || '')) { buffer = ''; for (const digit of digits) add(digit); } };
      view.onkeydown = event => {
        if (/^\d$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); add(event.key); }
        else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); eraseOne(); }
        else if (event.key === 'Escape') { event.preventDefault(); if (settings && !busy) close(); }
        else if (event.key === 'Tab') {
          const controls = [...view.querySelectorAll('button')].filter(button => !button.disabled && button.getClientRects().length);
          const a = controls[0], z = controls.at(-1);
          if (event.shiftKey && document.activeElement === a) { event.preventDefault(); z?.focus(); }
          else if (!event.shiftKey && document.activeElement === z) { event.preventDefault(); a?.focus(); }
        }
      };
      paint(); view.querySelector('[data-pin-digit]')?.focus();
    });
  }

  show(mode, record, settings) {
    return new Promise(resolve => {
      const app = document.getElementById('app');
      const previousFocus = document.activeElement;
      const wasHidden = app.hidden, wasInert = app.inert;
      app.hidden = true; app.inert = true;
      const view = document.createElement('section');
      this.view = view;
      view.className = 'entry-lock';
      view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true');
      view.setAttribute('aria-labelledby', 'entry-title');
      this.legacyVerified = false;
      const title = mode === 'unlock' ? 'Введите прежний пароль' : mode === 'manage' ? 'Пароль входа' : mode === 'error' ? 'Не удалось прочитать настройки' : 'Защитить вход паролем?';
      const passwordField = (id, label, existing = false) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="password" autocomplete="${existing ? 'current-password' : 'new-password'}" ${existing ? '' : 'minlength="4"'} maxlength="128" required></div>`;
      view.innerHTML = `<div class="entry-panel">
        <img src="${new URL('../assets/school-emblem.svg', import.meta.url).href}" width="56" height="56" alt="Герб школы">
        <p class="entry-brand">All-Class · ЗилАрт 548</p><h1 id="entry-title">${title}</h1>
        <p class="entry-description">${mode === 'unlock' ? 'Введите прежний пароль один раз, чтобы перейти на PIN-код.' : mode === 'manage' ? 'Для смены или отключения введите действующий пароль.' : mode === 'error' ? 'Настройки недоступны или повреждены. Перезагрузите страницу и проверьте разрешение на хранение данных сайта.' : 'Задайте пароль или продолжите без него. Выбор сохранится на этом устройстве.'}</p>
        ${mode === 'error' ? '<button id="entry-reload" class="setup-submit" type="button">Перезагрузить</button>' : `<form id="entry-form">
          ${mode === 'manage' ? passwordField('entry-current', 'Действующий пароль', true) : ''}
          ${passwordField('entry-password', mode === 'manage' ? 'Новый пароль' : 'Пароль', mode === 'unlock')}
          ${mode === 'unlock' ? '' : passwordField('entry-confirm', 'Повторите пароль')}
          <button id="entry-reveal" type="button" class="text-button" aria-pressed="false">Показать пароль</button>
          <p id="entry-error" class="password-error" role="alert" hidden></p>
          <button id="entry-submit" class="setup-submit" type="submit">${mode === 'unlock' ? 'Войти' : mode === 'manage' ? 'Сменить пароль' : 'Задать пароль'}</button>
          ${mode === 'unlock' ? '' : `<button id="entry-without" class="entry-secondary" type="button">${mode === 'manage' ? 'Отключить пароль' : 'Продолжить без пароля'}</button>`}
          <button id="entry-once" class="entry-secondary" type="button" hidden>Без пароля только в этот раз</button>
        </form>`}
        ${settings ? '<button id="entry-cancel" class="entry-secondary" type="button">Отмена</button>' : ''}
        <p class="entry-help">Пароль не отправляется на сервер. Это локальная блокировка: очистка данных сайта сбросит пароль, настройки и заметки. Восстановления через почту нет.</p>
      </div>`;
      document.body.append(view);
      const $ = selector => view.querySelector(selector);
      let busy = false, disposed = false;
      const close = () => {
        if (disposed) return;
        disposed = true; view.remove(); this.view = null; this.close = null;
        app.hidden = wasHidden; app.inert = wasInert;
        previousFocus?.focus?.({ preventScroll: true }); resolve();
      };
      this.close = close;
      const error = message => { $('#entry-error').textContent = message; $('#entry-error').hidden = false; };
      const run = async action => {
        if (busy) return;
        busy = true;
        const inputs = [...view.querySelectorAll('input,button')];
        inputs.forEach(input => { input.disabled = true; });
        try { await action(); }
        catch (reason) { if (!disposed) error(reason.message || 'Не удалось сохранить настройки. Проверьте хранилище браузера.'); }
        finally { busy = false; inputs.forEach(input => { input.disabled = false; }); }
      };
      if ($('#entry-reload')) $('#entry-reload').onclick = () => location.reload();
      if ($('#entry-cancel')) $('#entry-cancel').onclick = close;
      if (mode !== 'error') {
        $('#entry-reveal').onclick = event => {
          const revealed = event.currentTarget.getAttribute('aria-pressed') !== 'true';
          view.querySelectorAll('input').forEach(input => { input.type = revealed ? 'text' : 'password'; });
          event.currentTarget.setAttribute('aria-pressed', String(revealed));
          event.currentTarget.textContent = revealed ? 'Скрыть пароль' : 'Показать пароль';
        };
        const authenticate = async password => {
          if (!await matchesPassword(password, record)) throw Error('Неверный пароль. Попробуйте ещё раз.');
        };
        $('#entry-form').onsubmit = event => {
          event.preventDefault();
          const password = $('#entry-password').value;
          const current = $('#entry-current')?.value;
          const confirmation = $('#entry-confirm')?.value;
          run(async () => {
            if (mode === 'unlock') { await authenticate(password); this.legacyVerified = true; close(); return; }
            if (mode === 'manage') await authenticate(current);
            if (password !== confirmation) throw Error('Пароли не совпадают. Повторите ввод.');
            const next = await createLock(password);
            if (disposed) return;
            persist(next); close();
          });
        };
        if ($('#entry-without')) $('#entry-without').onclick = () => {
          const current = $('#entry-current')?.value;
          run(async () => {
            if (mode === 'manage') await authenticate(current || '');
            try { persist({ version: 1, mode: 'none' }); }
            catch {
              if (mode === 'setup') $('#entry-once').hidden = false;
              throw Error('Браузер не разрешил сохранить выбор. Настройки не изменены.');
            }
            close();
          });
        };
        $('#entry-once').onclick = close;
      }
      view.onkeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); if (settings && !busy) close(); }
        if (event.key !== 'Tab') return;
        const controls = [...view.querySelectorAll('input,button')].filter(input => !input.disabled && !input.hidden);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      };
      (view.querySelector('input') || view.querySelector('button'))?.focus();
    });
  }
}

export const appLock = new AppLock();
