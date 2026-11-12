import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connectReplacementSheets, readReplacementWorkbook, normalizeDate, parseClasses, parseLessons, isReplacementDatasetForSchedule } from '../src/replacements.js';
import * as XLSX from '../vendor/xlsx.js';

const schedule = JSON.parse(fs.readFileSync('data/schedule.json'));
const header = ['', 'Дата', 'Ф.И.О. учителя,пропустившего урок', 'Предмет', 'Класс', 'Урок', 'Причина пропуска урока', 'Кабинет', 'Ф.И.О. учителя,заменившего урок', 'Предмет', 'Оплата'];
const row = (patch = {}) => {
  const r = { date: '11.11.2026', original: 'Шаповаленко Т.Г.', originalSubject: 'Физика', className: '9ц', lesson: '3', room: '2.40', teacher: 'Тестовый учитель', subject: 'Математика', ...patch };
  return ['', r.date, r.original, r.originalSubject, r.className, r.lesson, 'PRIVATE_REASON', r.room, r.teacher, r.subject, 'PRIVATE_PAY'];
};
const sheet = (rows, name = '1-30 ноября 2026') => ({ name, rows: [[], header, ...rows] });
const connect = rows => connectReplacementSheets([sheet(rows)], schedule, { fetchedAt: '2026-11-11T12:00:00Z' });

test('school workbook headers distinguish original subject from replacement subject and omit private fields', () => {
  const data = connect([row()]);
  assert.equal(data.entries.length, 1);
  assert.equal(data.entries[0].subject, 'Математика');
  assert.equal(data.entries[0].originalSubject, 'Физика');
  assert.deepEqual(data.entries[0].targetTeachers, ['Шаповаленко Т.Г.']);
  assert(!JSON.stringify(data).includes('PRIVATE_'));
});

test('class suffixes, grouped classes, ranges and invalid dates are handled explicitly', () => {
  assert.deepEqual(parseClasses('5з-з'), ['5З']);
  assert.deepEqual(parseClasses('11 ш,э (2 урока)'), ['11Ш', '11Э']);
  assert.deepEqual(parseClasses('9 а,б'), ['9А', '9Б']);
  assert.deepEqual(parseClasses('7 кл'), []);
  assert.deepEqual(parseLessons('3–4, 6'), [3, 4, 6]);
  assert.throws(() => parseLessons('4-3'));
  assert.throws(() => parseLessons('11'));
  assert.equal(normalizeDate('31.02.2026'), null);
  assert.equal(normalizeDate('2026-02-31'), null);
});

test('ranges expand to two real lessons and preserve actual row dates despite the sheet name', () => {
  const data = connect([row({ date: '25.09.2026', original: 'Путилкина Н.П.', originalSubject: 'Информатика', lesson: '3-4', subject: 'Информатика' })]);
  assert.deepEqual(data.entries.map(r => r.lesson), [3, 4]);
  assert(data.entries.every(r => r.date === '2026-09-25'));
});

test('one subgroup is replaced while the second subgroup remains intact', () => {
  const data = connect([row({ original: 'Саакян М.А.', originalSubject: 'Английский язык', subject: 'Английский язык', lesson: '6' })]);
  assert.deepEqual(data.entries[0].targetTeachers, ['Саакян М.А.']);
  assert(!data.entries[0].targetTeachers.includes('Вереина О.К.'));
});

test('missing lesson is inferred only for a unique match or an explicit count of matching lessons', () => {
  const unique = connect([row({ original: 'Саакян М.А.', originalSubject: 'Английский язык', subject: 'Английский язык', lesson: '' })]);
  assert.equal(unique.entries[0].lesson, 6);
  assert.equal(unique.entries[0].inferredLesson, true);
  const ambiguous = connect([row({ original: 'Удалов А.П.', originalSubject: 'Математика', lesson: '' })]);
  assert.equal(ambiguous.entries.length, 0);
  assert.match(ambiguous.unresolved[0].reason, /однозначно/);
  const double = connect([row({ original: 'Шаповаленко Т.Г.', originalSubject: 'Физика', className: '9ц (2 урока)', lesson: '' })]);
  assert.deepEqual(double.entries.map(r => r.lesson), [3, 4]);
});

test('monthly duplicate rows and overlapping ranges do not duplicate or invalidate matching lessons', () => {
  const input = row();
  const data = connectReplacementSheets([sheet([input]), sheet([input], 'Октябрь')], schedule);
  assert.equal(data.entries.length, 1);
  assert.equal(data.stats.duplicateRows, 1);
  const overlap = connect([row({ lesson: '3-4' }), row()]);
  assert.deepEqual(overlap.entries.map(r => r.lesson), [3, 4]);
  assert.equal(overlap.unresolved.length, 0);
});

test('conflicts and mismatched teachers stay visible without striking an unrelated lesson', () => {
  const conflicts = connect([row(), row({ teacher: 'Другой учитель' })]);
  assert.equal(conflicts.entries.length, 0);
  assert.equal(conflicts.unresolved.length, 2);
  assert.match(conflicts.unresolved[0].reason, /несколько/);
  const mismatch = connect([row({ original: 'Неизвестный А.А.', originalSubject: 'Химия' })]);
  assert.equal(mismatch.entries.length, 0);
  assert.equal(mismatch.unresolved[0].lesson, 3);
});

test('outside classes and date-only template rows do not block valid school replacements', () => {
  const data = connect([row(), row({ className: '2а-з' }), ['', '11.11.2026']]);
  assert.equal(data.entries.length, 1);
  assert.equal(data.stats.outsideSchedule, 1);
  assert.equal(data.unresolved.length, 0);
});

test('real cancellation markers are parsed as cancelled lessons', () => {
  const data = connect([row({ teacher: 'отмена' })]);
  assert.equal(data.entries[0].cancelled, true);
});

test('actual XLSX cell dates and UTF-8 CSV retain Russian dates and simple manual imports', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, row({ date: new Date(2026, 10, 11) })]), 'Ноябрь');
  const actual = await readReplacementWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), schedule);
  assert.equal(actual.entries[0].date, '2026-11-11');
  const csv = Buffer.from('Дата;Класс;Урок;Предмет;Учитель;Кабинет\n05.11.2026;9Ц;3;Проверка;Тестовый учитель;\n');
  const simple = await readReplacementWorkbook(csv, schedule);
  assert.equal(simple.entries[0].date, '2026-11-05');
  assert.equal(simple.entries[0].room, '');
  await assert.rejects(readReplacementWorkbook(Buffer.from('a;b\n1;2'), schedule), /столбцы/);
});

test('the saved real snapshot only changes existing target subgroups and contains no false November dates', () => {
  const result = JSON.parse(fs.readFileSync('data/replacements.json'));
  assert(result.entries.length > 500);
  assert(result.stats.duplicateRows > 0);
  assert.equal(result.coverage.at(-1), '2026-11-05');
  assert(!result.coverage.includes('2026-11-11'));
  for (const r of result.entries) {
    const day = (new Date(r.date + 'T12:00:00').getDay() + 6) % 7;
    const slot = schedule.classes[r.className][String(day)]?.[String(r.lesson)] || [];
    assert(r.lesson >= 1 && r.lesson <= 10);
    for (const teacher of r.targetTeachers) assert(slot.some(item => item.teacher === teacher));
    if (!r.addedLesson) assert(r.targetTeachers.length > 0);
  }
});

test('all imported timetable entries refer to real lesson slots and contain teachers', () => {
  assert.equal(Object.keys(schedule.classes).length, 70);
  assert.equal(schedule.unparsed.length, 0);
  assert.equal(schedule.bells.length, 10);
  let count = 0;
  for (const days of Object.values(schedule.classes)) for (const [day, lessons] of Object.entries(days)) {
    assert(+day >= 0 && +day <= 5);
    for (const [slot, items] of Object.entries(lessons)) {
      assert(+slot >= 1 && +slot <= 10);
      for (const item of items) { assert(item.teacher); assert(item.subject); count++; }
    }
  }
  assert.equal(count, 4234);
});

test('sheet audit identifies mixed months while retaining the actual dates of every record', () => {
  const data = connect([
    row({ date: '25.09.2026', original: 'Путилкина Н.П.', originalSubject: 'Информатика', lesson: '3', subject: 'Информатика' }),
    row({ date: '05.11.2026' }),
  ]);
  assert.equal(data.sheetReports[0].declaredMonth, '2026-11');
  assert.equal(data.sheetReports[0].otherMonthRows, 1);
  assert.deepEqual(data.sheetReports[0].monthCounts, { '2026-09': 1, '2026-11': 1 });
  assert.equal(data.sheetReports[0].firstDate, '2026-09-25');
  assert.equal(data.sheetReports[0].lastDate, '2026-11-05');
  assert(data.entries.some(row => row.date === '2026-09-25'));
  assert(!data.entries.some(row => row.date === '2026-11-25'));
});

test('real workbook inventory includes September, October and November with copied October dates reported', () => {
  const data = JSON.parse(fs.readFileSync('data/replacements.json'));
  assert.deepEqual(data.sheetReports.map(report => report.declaredMonth), ['2026-09', '2026-10', '2026-11']);
  assert(data.sheetReports[2].monthCounts['2026-10'] > 0);
  assert(data.sheetReports[2].monthCounts['2026-11'] > 0);
  assert(data.sheetReports[2].otherMonthRows > 0);
});

test('the reported 6М replacement keeps November 5 for numeric Excel dates in both date systems', async () => {
  const { missingReplacementWorkbook } = await import('./fixtures/missing-replacement.js');
  for (const options of [{}, { date1904: true }, { fraction: 0.75 }]) {
    const data = await readReplacementWorkbook(missingReplacementWorkbook(options), schedule);
    assert.equal(data.version, 4);
    assert.equal(data.unresolved.length, 0);
    assert.equal(data.entries.length, 1);
    const [entry] = data.entries;
    assert.equal(entry.date, '2026-11-05');
    assert.equal(entry.className, '6М');
    assert.equal(entry.lesson, 4);
    assert.equal(entry.teacher, 'Шурухина О.С.');
    assert.equal(entry.room, '2.24');
    assert.deepEqual(entry.targetTeachers, ['Попова Ю.Н.']);
    assert.deepEqual(data.coverage, ['2026-11-05']);
  }
});

test('resolved replacements belong to the exact base timetable and old caches cannot be reused', () => {
  const data = connect([row()]);
  assert.equal(data.scheduleRevision, schedule.revision);
  assert.equal(isReplacementDatasetForSchedule(data, schedule), true);
  assert.equal(isReplacementDatasetForSchedule({ ...data, scheduleRevision: 'previous-timetable', fetchedAt: '2099-01-01T00:00:00Z', origin: 'file' }, schedule), false);
  assert.equal(isReplacementDatasetForSchedule({ ...data, version: 3 }, schedule), false);
  assert.equal(isReplacementDatasetForSchedule({ ...data, scheduleRevision: undefined }, schedule), false);
});

test('XML subjects stay distinct when a replacement cannot match its original teacher', () => {
  const cases = [
    { date: '05.11.2026', className: '6М', lesson: '2', originalSubject: 'Русский язык' }, // XML: literature.
    { date: '11.11.2026', className: '9Ц', lesson: '1', originalSubject: 'Геометрия' }, // XML: algebra.
    { date: '09.11.2026', className: '5А', lesson: '5', originalSubject: 'Обществознание' }, // XML: history.
  ];
  for (const fields of cases) {
    const data = connect([row({ ...fields, original: 'Вакансия', subject: fields.originalSubject })]);
    assert.equal(data.entries.length, 0);
    assert.equal(data.unresolved.length, 1);
    assert.match(data.unresolved[0].reason, /не совпали/);
  }
});
