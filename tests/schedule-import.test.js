import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixture = fs.readFileSync('tests/fixtures/asc-schedule.xml', 'utf8');
const runImport = (input, output) => spawnSync('python3', ['scripts/import_schedule.py', input, '--output', output], { encoding: 'utf8' });
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-xml-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'timetable.xml'), output = path.join(dir, 'schedule.json');
  fs.writeFileSync(input, fixture);
  return { dir, input, output };
}

test('aSc cards keep their actual room, weekday, duration, joint classes, teachers and own subgroup', t => {
  const { input, output } = workspace(t);
  const imported = runImport(input, output);
  assert.equal(imported.status, 0, imported.stderr);
  const data = JSON.parse(fs.readFileSync(output));
  assert.deepEqual(data.stats, { classes: 2, lessonDefinitions: 3, sourceCards: 2, scheduledLessons: 2, entries: 17, slots: 9, unscheduledLessons: 1 });
  for (const day of ['0', '2']) for (const slot of ['1', '2']) {
    assert.equal(data.classes['6М'][day][slot].length, 2);
    assert.deepEqual(data.classes['6М'][day][slot].map(item => item.teacher), ['Иванова И.И.', 'Петров П.П.']);
    assert(data.classes['6М'][day][slot].every(item => item.room === '2.02' && item.subject === 'Русский язык' && item.shared));
    assert(data.classes['6М'][day][slot].every(item => item.groups.join() === '1'));
    assert(data.classes['5А'][day][slot].every(item => item.groups.length === 0));
  }
  assert.equal(data.classes['6М']['3']['3'][0].subject, 'Литература');
  assert.equal(data.classes['6М']['3']['3'][0].room, ''); // R1 is allowed, not assigned.
  assert.deepEqual(data.unscheduled, [{ className: '6М', subject: 'История', teacher: 'Иванова И.И.', room: '', groups: [], shared: false }]);
  assert(!JSON.stringify(data).includes('PRIVATE_'));
  assert.match(data.revision, /^[a-f0-9]{64}$/);
});

test('Windows-1251 exports preserve Russian class and subject names', t => {
  const { dir, input, output } = workspace(t);
  const encoded = path.join(dir, 'windows.xml');
  const conversion = spawnSync('python3', ['-c', 'from pathlib import Path; import sys; text=Path(sys.argv[1]).read_text(encoding="utf-8").replace("utf-8", "windows-1251"); Path(sys.argv[2]).write_bytes(text.encode("cp1251"))', input, encoded], { encoding: 'utf8' });
  assert.equal(conversion.status, 0, conversion.stderr);
  const imported = runImport(encoded, output);
  assert.equal(imported.status, 0, imported.stderr);
  const data = JSON.parse(fs.readFileSync(output));
  assert.equal(data.classes['6М']['3']['3'][0].subject, 'Литература');
  assert.equal(data.classes['6М']['0']['1'][0].teacher, 'Иванова И.И.');
});

test('invalid references, out-of-range cards and alternating weeks cannot overwrite an existing timetable', t => {
  const { input, output } = workspace(t);
  const badInputs = [
    fixture.replace('classroomids="R2"/>', 'classroomids="UNKNOWN"/>'),
    fixture.replace('lessonid="L1" period="1"', 'lessonid="L1" period="3"'),
    fixture.replace('<weeksdef weeks="1"/>', '<weeksdef weeks="10"/><weeksdef weeks="01"/>'),
    fixture.replace('<card lessonid="L2"', '<card lessonid="UNKNOWN"'),
  ];
  for (const xml of badInputs) {
    fs.writeFileSync(input, xml);
    fs.writeFileSync(output, 'keep existing timetable');
    const result = runImport(input, output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Ошибка импорта/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'keep existing timetable');
  }
});

test('the published timetable retains the corrected XML subjects, classrooms and explicitly unplaced lesson', () => {
  const data = JSON.parse(fs.readFileSync('data/schedule.json'));
  assert.equal(data.source, 'от 031126_1212.xml');
  assert.equal(data.format, 'aSc Timetables XML');
  assert.equal(data.stats.sourceCards, 3504);
  assert.equal(data.stats.entries, 4234);
  const thursday = data.classes['6М']['3'];
  assert.equal(thursday['1'][0].subject, 'Русский язык');
  assert.equal(thursday['2'][0].subject, 'Литература');
  assert.deepEqual(thursday['3'][0], { subject: 'Изобразительное искусство', teacher: 'Машицына Е.А.', room: '4.15', groups: [], shared: false });
  assert.deepEqual(thursday['5'].map(item => item.groups), [['1'], ['2']]);
  assert.equal(data.classes['5А']['0']['1'][0].subject, 'Разговоры о важном (ВД)');
  assert.deepEqual(data.unscheduled, [{ className: '6Е', subject: 'Разговоры о важном (ВД)', teacher: 'Попова Ю.Н.', room: '', groups: [], shared: false }]);
});
