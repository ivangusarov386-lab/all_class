import { getSubjectNote, saveSubjectNotes, MAX_NOTE_LENGTH } from './notes.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = selector => document.querySelector(selector);

export class SubjectNoteEditor {
  constructor({ getNotes, onSaved, onRender }) {
    this.getNotes = getNotes; this.onSaved = onSaved; this.onRender = onRender;
    this.state = null;
  }

  get isOpen() { return !!this.state; }

  open(className, subjects, triggerId) {
    const initial = Object.fromEntries(subjects.map(subject => [subject, getSubjectNote(this.getNotes(), className, subject)]));
    this.state = { className, subjects, subject: subjects.find(subject => initial[subject]) || subjects[0], initial, drafts: { ...initial }, triggerId, error: '', message: '', focus: null };
    this.onRender();
  }

  dismiss() { this.state = null; }

  close() {
    const triggerId = this.state?.triggerId;
    this.dismiss(); this.onRender();
    document.getElementById(triggerId)?.focus({ preventScroll: true });
  }

  captureFocus() {
    const active = document.activeElement;
    if (!this.state || !$('#note-dialog')?.contains(active)) return;
    this.state.focus = { id: active.id, start: active.selectionStart, end: active.selectionEnd, scrollTop: active.scrollTop };
  }

  refreshUneditedDrafts() {
    const state = this.state;
    if (!state) return;
    for (const subject of state.subjects) if (state.drafts[subject] === state.initial[subject]) {
      state.initial[subject] = state.drafts[subject] = getSubjectNote(this.getNotes(), state.className, subject);
    }
  }

  changes() {
    const state = this.state;
    return state.subjects.filter(subject => state.drafts[subject] !== state.initial[subject]).map(subject => ({ subject, text: state.drafts[subject] }));
  }

  html() {
    const state = this.state;
    if (!state) return '';
    return `<dialog id="note-dialog" class="note-dialog" aria-labelledby="note-title" aria-describedby="note-help">
      <div class="dialog-header"><h2 id="note-title">Заметка</h2><button id="close-note" type="button" aria-label="Закрыть заметку">×</button></div>
      <span class="note-class">${esc(state.className)} класс · для всех дней</span>
      <form id="note-form">
        ${state.subjects.length > 1 ? `<div class="field note-subject-field"><label for="note-subject">Предмет</label><select id="note-subject">${state.subjects.map(subject => `<option value="${esc(subject)}" ${subject === state.subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select></div>` : ''}
        <p id="note-current-subject" class="note-current-subject">${esc(state.subject)}</p>
        <div class="field"><label class="sr-only" for="note-text">Текст заметки</label><textarea id="note-text" name="note" rows="6" maxlength="${MAX_NOTE_LENGTH}" placeholder="Что важно помнить об этом предмете…"></textarea></div>
        <p id="note-help" class="note-help">Заметка появится у всех уроков этого предмета в ${esc(state.className)}. Сохраняется в этом браузере.</p>
        <p id="note-error" class="note-error" role="alert" ${state.error ? '' : 'hidden'}>${esc(state.error)}</p>
        <p id="note-message" class="note-message" role="status" ${state.message ? '' : 'hidden'}>${esc(state.message)}</p>
        <div class="note-actions"><button id="save-note" class="setup-submit" type="submit">Сохранить</button><button id="cancel-note" class="text-button" type="button">Отмена</button><button id="delete-note" class="delete-note" type="button">Удалить заметку</button></div>
      </form>
    </dialog>`;
  }

  updateActions() {
    $('#save-note').disabled = !this.changes().length;
    $('#delete-note').hidden = !getSubjectNote(this.getNotes(), this.state.className, this.state.subject);
  }

  showError(message) {
    this.state.error = message;
    $('#note-error').textContent = message; $('#note-error').hidden = !message;
  }

  mount() {
    const state = this.state;
    if (!state) return;
    const dialog = $('#note-dialog');
    $('#note-text').value = state.drafts[state.subject];
    $('#note-text').oninput = event => {
      state.drafts[state.subject] = event.target.value;
      this.showError(''); this.updateActions();
    };
    if ($('#note-subject')) $('#note-subject').onchange = event => {
      state.subject = event.target.value;
      $('#note-text').value = state.drafts[state.subject];
      $('#note-current-subject').textContent = state.subject;
      this.showError(''); this.updateActions();
    };
    $('#note-form').onsubmit = event => {
      event.preventDefault();
      try {
        this.onSaved(saveSubjectNotes(state.className, this.changes()));
        this.close();
      } catch {
        this.showError('Не удалось сохранить заметку в браузере. Скопируйте текст, чтобы не потерять его, и проверьте разрешение на хранение данных сайта.');
      }
    };
    $('#delete-note').onclick = () => {
      try {
        this.onSaved(saveSubjectNotes(state.className, [{ subject: state.subject, text: '' }]));
        state.initial[state.subject] = state.drafts[state.subject] = '';
        if (!this.changes().length) this.close();
        else { state.message = 'Заметка по этому предмету удалена. Изменения других предметов можно сохранить.'; this.onRender(); }
      } catch { this.showError('Не удалось удалить заметку: браузер не разрешил изменить сохранённые данные.'); }
    };
    $('#close-note').onclick = $('#cancel-note').onclick = () => this.close();
    dialog.oncancel = event => { event.preventDefault(); this.close(); };
    this.updateActions();
    dialog.showModal();
    const focus = state.focus;
    const target = focus && document.getElementById(focus.id);
    if (target && !target.hidden && !target.disabled && dialog.contains(target)) {
      target.focus({ preventScroll: true });
      if (typeof focus.start === 'number' && target.setSelectionRange) target.setSelectionRange(focus.start, focus.end);
      target.scrollTop = focus.scrollTop;
    } else $('#note-text').focus({ preventScroll: true });
  }
}
