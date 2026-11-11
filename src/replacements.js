export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1vIOpBDYYJlVAnTNHKAvS8YBsIMK8wjV6HU3EACIqJSs/edit';
export const EXPORT_URL = SHEET_URL.replace('/edit', '/export?format=xlsx');
// V2 caches may contain dates shifted by the browser's historical timezone offset.
export const REPLACEMENT_DATA_VERSION = 3;
const clean = value => String(value ?? '').trim();
const folded = value => clean(value).toLowerCase().replace(/ё/g, 'е');
const headerKey = value => folded(value).replace(/[^а-яa-z0-9№]/g, '');
export const teacherKey = value => folded(value).replace(/[^а-яa-z]/g, '');

export function normalizeDate(value) {
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = clean(value);
  let parts = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const [, year, month, day] = parts;
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    return date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day ? text : null;
  }
  parts = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return parts ? normalizeDate(`${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`) : null;
}

export const normalizeClass = value => clean(value).toUpperCase().replace(/[\s«»"']/g, '').replace(/-З$/, '');
export function parseClasses(value) {
  const text = clean(value).toUpperCase().replace(/[–—]/g, '-').replace(/\(\s*\d+\s*УРОК[А-Я]*\s*\)/g, '').replace(/\s/g, '');
  let grade = '';
  const result = [];
  for (const part of text.split(/[,;]/)) {
    const token = part.replace(/-З$/, '');
    const full = token.match(/^(1[01]|[1-9])([А-ЯЁ])$/);
    if (full) { grade = full[1]; result.push(grade + full[2]); }
    else if (grade && /^[А-ЯЁ]$/.test(token)) result.push(grade + token);
    else return [];
  }
  return [...new Set(result)];
}

export function parseLessons(value) {
  if (!clean(value)) return [];
  const result = [];
  for (const token of clean(value).replace(/[–—]/g, '-').split(/[,;\s]+/)) {
    const range = token.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!range) throw Error('Номер урока не распознан');
    const from = +range[1], to = +(range[2] || from);
    if (from < 1 || to > 10 || from > to) throw Error('Номер урока должен быть от 1 до 10');
    for (let number = from; number <= to; number++) result.push(number);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

function subjectKey(value) {
  const key = headerKey(value);
  if (['русскийязык', 'литература', 'русскийязыкилитература'].includes(key)) return 'русскийилитература';
  if (['история', 'обществознание', 'историяиобществознание'].includes(key)) return 'историяиобществознание';
  if (['алгебра', 'геометрия', 'математика', 'вероятностьистатистика'].includes(key)) return 'математика';
  return key;
}

function findHeader(rows) {
  for (let index = 0; index < Math.min(30, rows.length); index++) {
    const columns = {}, subjects = [];
    rows[index].forEach((value, column) => {
      const key = headerKey(value);
      if (['дата', 'date'].includes(key)) columns.date = column;
      if (['класс', 'class'].includes(key)) columns.className = column;
      if (['урок', 'номерурока', '№урока', 'lesson'].includes(key)) columns.lesson = column;
      if (['предмет', 'замена', 'новыйпредмет'].includes(key)) subjects.push(column);
      if (['учитель', 'ктозаменяет', 'заменяющийучитель', 'заменяет', 'фиоучителязаменившегоурок'].includes(key)) columns.teacher = column;
      if (['когозаменяют', 'отсутствующийучитель', 'фиоучителяпропустившегоурок'].includes(key)) columns.originalTeacher = column;
      if (['кабинет', 'каб', 'где'].includes(key)) columns.room = column;
      if (['исходныйпредмет', 'старыйпредмет'].includes(key)) columns.originalSubject = column;
    });
    if (['date', 'className', 'lesson'].every(key => key in columns)) {
      if (subjects.length) columns.subject = subjects.at(-1);
      if (subjects.length > 1) columns.originalSubject = subjects[0];
      return { index, columns };
    }
  }
  throw Error('Не найдены столбцы «Дата», «Класс» и «Урок».');
}

export function declaredSheetMonth(name) {
  const found = folded(name).match(/(январ[ья]|феврал[ья]|марта?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|августа?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s+(\d{4})/);
  if (!found) return null;
  const stems = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  const month = stems.findIndex(stem => found[1].startsWith(stem)) + 1;
  return `${found[2]}-${String(month).padStart(2, '0')}`;
}

function recordsFromSheet({ name, rows }) {
  const { index, columns } = findHeader(rows);
  const records = [], issues = [];
  const dateCounts = new Map();
  let rowCount = 0;
  for (let offset = index + 1; offset < rows.length; offset++) {
    const row = rows[offset];
    const get = key => columns[key] === undefined ? '' : row[columns[key]];
    // Date-only template rows are not replacement records.
    if (!['className', 'teacher', 'originalTeacher', 'subject'].some(key => clean(get(key)))) continue;
    if (headerKey(get('date')) === 'дата') continue;
    rowCount++;
    const source = { sheet: name, row: offset + 1 };
    const record = {
      date: normalizeDate(get('date')),
      sourceClass: clean(get('className')),
      sourceLesson: clean(get('lesson')),
      subject: clean(get('subject')),
      teacher: clean(get('teacher')),
      cancelled: /^(отмена|урок отмен[её]н|нет урока)$/i.test(clean(get('teacher'))),
      room: clean(get('room')),
      originalTeacher: clean(get('originalTeacher')),
      originalSubject: clean(get('originalSubject')),
      expectedCount: Number(clean(get('className')).match(/\((\d+)\s*урок/i)?.[1] || 0),
      source,
    };
    if (record.date) dateCounts.set(record.date, (dateCounts.get(record.date) || 0) + 1);
    const classes = parseClasses(record.sourceClass);
    if (!record.date || !classes.length || (!record.teacher && !record.subject)) {
      issues.push({ ...record, className: classes[0] || '', reason: 'Не распознаны дата, класс или содержание замены.' });
      continue;
    }
    try { record.lessons = parseLessons(get('lesson')); }
    catch (error) { for (const className of classes) issues.push({ ...record, className, reason: error.message }); continue; }
    for (const className of classes) records.push({ ...record, className });
  }
  const dates = [...dateCounts.keys()].sort();
  const declaredMonth = declaredSheetMonth(name);
  const monthCounts = {};
  for (const [date, count] of dateCounts) monthCounts[date.slice(0, 7)] = (monthCounts[date.slice(0, 7)] || 0) + count;
  return { records, issues, rowCount, report: {
    name, declaredMonth, rowCount, monthCounts,
    firstDate: dates[0] || null, lastDate: dates.at(-1) || null,
    otherMonthRows: declaredMonth ? [...dateCounts].filter(([date]) => !date.startsWith(declaredMonth)).reduce((sum, [, count]) => sum + count, 0) : 0,
  } };

}

function daySlots(schedule, record) {
  const day = (new Date(`${record.date}T12:00:00`).getDay() + 6) % 7;
  return schedule.classes[record.className]?.[String(day)] || {};
}

function matchingTargets(record, items) {
  if (!record.originalTeacher) {
    // The simple CSV format explicitly replaces a whole lesson.
    return items.map(item => item.teacher);
  }
  const exact = items.filter(item => teacherKey(item.teacher) === teacherKey(record.originalTeacher));
  if (exact.length) return exact.map(item => item.teacher);
  if (record.originalSubject) {
    const subject = items.filter(item => subjectKey(item.subject) === subjectKey(record.originalSubject));
    if (subject.length === 1) return [subject[0].teacher];
  }
  return [];
}

function inferLessons(record, slots) {
  const candidates = Object.entries(slots).filter(([, items]) => items.some(item => {
    const teacherMatches = teacherKey(item.teacher) === teacherKey(record.originalTeacher);
    const subjectMatches = record.originalSubject && subjectKey(item.subject) === subjectKey(record.originalSubject);
    const canUseSubject = !record.originalTeacher || /ваканси/i.test(record.originalTeacher);
    return (teacherMatches && (!record.originalSubject || subjectMatches)) || (canUseSubject && subjectMatches);
  })).map(([number]) => +number);
  if (candidates.length === 1 && record.expectedCount <= 1) return candidates;
  if (record.expectedCount > 1 && candidates.length === record.expectedCount) return candidates;
  return [];
}

function identity(record) {
  return JSON.stringify([record.date, record.className, record.lessons, teacherKey(record.originalTeacher), subjectKey(record.originalSubject), teacherKey(record.teacher), subjectKey(record.subject), folded(record.room), record.expectedCount]);
}

export function connectReplacementSheets(sheets, schedule, { fetchedAt = new Date().toISOString() } = {}) {
  let entries = [], unresolved = [], sourceRows = 0, duplicateRows = 0, duplicateLessons = 0, outsideSchedule = 0;
  const unique = new Map(), coverage = new Set(), sheetReports = [];
  for (const sheet of sheets) {
    const parsed = recordsFromSheet(sheet);
    sourceRows += parsed.rowCount;
    sheetReports.push(parsed.report);
    for (const issue of parsed.issues) {
      if (issue.className && !schedule.classes[issue.className]) { outsideSchedule++; continue; }
      unresolved.push(issue);
    }
    for (const record of parsed.records) {
      coverage.add(record.date);
      if (!schedule.classes[record.className]) { outsideSchedule++; continue; }
      const key = identity(record);
      if (unique.has(key)) duplicateRows++;
      unique.set(key, record); // Identical records in monthly copies appear once.
    }
  }
  for (const record of unique.values()) {
    const slots = daySlots(schedule, record);
    const numbers = record.lessons.length ? record.lessons : inferLessons(record, slots);
    if (!numbers.length) {
      unresolved.push({ ...record, reason: 'Номер урока не указан; однозначно определить его по расписанию не удалось.' });
      continue;
    }
    for (const lesson of numbers) {
      const items = slots[String(lesson)] || [];
      const targetTeachers = matchingTargets(record, items);
      if (items.length && !targetTeachers.length) {
        unresolved.push({ ...record, lesson, reason: 'Учитель и предмет из таблицы замен не совпали с основным расписанием этого урока.' });
        continue;
      }
      entries.push({ ...record, lesson, targetTeachers, inferredLesson: record.lessons.length === 0, addedLesson: items.length === 0 });
    }
  }
  const expanded = new Map();
  for (const entry of entries) {
    const key = JSON.stringify([entry.date, entry.className, entry.lesson, entry.targetTeachers.slice().sort(), teacherKey(entry.teacher), subjectKey(entry.subject), folded(entry.room)]);
    if (expanded.has(key)) duplicateLessons++;
    expanded.set(key, entry);
  }
  entries = [...expanded.values()];
  // Two different replacements must not silently compete for one subgroup.
  const conflicts = new Set(), groups = new Map();
  entries.forEach((entry, index) => {
    const key = `${entry.date}|${entry.className}|${entry.lesson}`;
    for (const other of groups.get(key) || []) {
      const targetsOverlap = entry.targetTeachers.some(teacher => entries[other].targetTeachers.includes(teacher));
      const bothAdded = entry.addedLesson && entries[other].addedLesson;
      if (targetsOverlap || bothAdded) { conflicts.add(index); conflicts.add(other); }
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  entries = entries.filter((entry, index) => {
    if (!conflicts.has(index)) return true;
    unresolved.push({ ...entry, reason: 'В источнике несколько разных замен одного занятия. Нужно уточнить запись.' });
    return false;
  });
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className, 'ru') || a.lesson - b.lesson);
  return {
    version: REPLACEMENT_DATA_VERSION, sourceUrl: SHEET_URL, fetchedAt,
    sheets: sheets.map(sheet => sheet.name), sheetReports, coverage: [...coverage].sort(), entries, unresolved,
    stats: { sourceRows, duplicateRows, duplicateLessons, outsideSchedule, matchedLessons: entries.length, unresolved: unresolved.length },
  };
}

export async function readReplacementWorkbook(buffer, schedule, options = {}) {
  const XLSX = await import('../vendor/xlsx.js');
  const bytes = new Uint8Array(buffer);
  const binary = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  // Keep Excel serial dates as numbers. Converting them through JS Date can move
  // midnight to the previous day in browsers with historical offsets in seconds.
  const workbook = binary ? XLSX.read(buffer, { type: 'array', cellDates: false })
    : XLSX.read(new TextDecoder('utf-8', { fatal: true }).decode(buffer), { type: 'string', raw: true, cellDates: false });
  const date1904 = !!workbook.Workbook?.WBProps?.date1904;
  const sheets = workbook.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });
    const { index, columns } = findHeader(rows);
    for (let row = index + 1; row < rows.length; row++) {
      const value = rows[row][columns.date];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const parts = XLSX.SSF.parse_date_code(value, { date1904 });
      rows[row][columns.date] = parts
        ? `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`
        : '';
    }
    return { name, rows };
  });
  const result = connectReplacementSheets(sheets, schedule, options);
  if (!result.stats.sourceRows) throw Error('В файле нет записей замен. Сохранённые данные оставлены.');
  return result;
}
