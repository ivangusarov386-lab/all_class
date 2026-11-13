import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTES_STORAGE_KEY, MAX_NOTE_LENGTH, loadSubjectNotes, getSubjectNote, saveSubjectNotes, uniqueNoteSubjects } from '../src/notes.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('subject notes persist independently of lesson, teacher, weekday or month and stay within their class', () => {
  const target = storage();
  saveSubjectNotes('6М', [{ subject: 'Математика', text: 'Взять тетрадь\nПовторить дроби' }], target);
  const restored = loadSubjectNotes(target);
  assert.equal(getSubjectNote(restored, '6м', '  МАТЕМАТИКА '), 'Взять тетрадь\nПовторить дроби');
  assert.equal(getSubjectNote(restored, '5А', 'Математика'), '');
  assert.equal(getSubjectNote(restored, '6М', 'Алгебра'), '');
  assert.equal(getSubjectNote(restored, '6М', 'Основы математической грамотности (ВД)'), '');
});

test('foreign-language groups and equivalent replacement subject names share one note', () => {
  const target = storage();
  saveSubjectNotes('6М', [{ subject: 'Иностранный (английский) язык', text: 'Словарь' }], target);
  assert.equal(getSubjectNote(loadSubjectNotes(target), '6М', 'Английский язык'), 'Словарь');
  assert.deepEqual(uniqueNoteSubjects(['Иностранный (английский) язык', 'Английский язык', 'Литература', 'Русский язык', 'Литература']), ['Иностранный (английский) язык', 'Литература', 'Русский язык']);
});

test('saving several subjects and deleting one preserves notes from other subjects, classes and tabs', () => {
  const target = storage();
  saveSubjectNotes('6М', [{ subject: 'Математика', text: 'Дроби' }, { subject: 'Русский язык', text: 'Словарь' }], target);
  saveSubjectNotes('5А', [{ subject: 'Математика', text: 'Задачи' }], target);
  saveSubjectNotes('6М', [{ subject: 'Литература', text: 'Прочитать рассказ' }], target);
  const notes = saveSubjectNotes('6М', [{ subject: 'Математика', text: '' }], target);
  assert.equal(getSubjectNote(notes, '6М', 'Математика'), '');
  assert.equal(getSubjectNote(notes, '6М', 'Русский язык'), 'Словарь');
  assert.equal(getSubjectNote(notes, '6М', 'Литература'), 'Прочитать рассказ');
  assert.equal(getSubjectNote(notes, '5А', 'Математика'), 'Задачи');
  assert.deepEqual(loadSubjectNotes(target), notes);
});

test('invalid or blocked browser storage cannot crash timetable loading or silently replace a saved note', () => {
  assert.deepEqual(loadSubjectNotes({ getItem() { throw Error('denied'); } }), {});
  assert.deepEqual(loadSubjectNotes({ getItem: () => 'invalid json' }), {});
  const target = storage();
  saveSubjectNotes('6М', [{ subject: 'Математика', text: 'Сохранённый текст' }], target);
  const previous = target.getItem(NOTES_STORAGE_KEY);
  assert.throws(() => saveSubjectNotes('6М', [{ subject: 'Русский язык', text: 'Новый текст' }, { subject: 'Математика', text: 'x'.repeat(MAX_NOTE_LENGTH + 1) }], target));
  assert.equal(target.getItem(NOTES_STORAGE_KEY), previous);
  target.setItem = () => { throw Error('quota'); };
  assert.throws(() => saveSubjectNotes('6М', [{ subject: 'Математика', text: '' }], target));
  assert.equal(target.getItem(NOTES_STORAGE_KEY), previous);
});
