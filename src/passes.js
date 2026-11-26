export const PASS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyanuYCJH_cSy_9_r0bLJLvzF0BG0jAUrpIlpycOXpDr_mtd64_9tVrTU122JWmQilV6Q/exec';
export const STUDENT_STORAGE_KEY = 'all-class-student-v1';
export const PASS_REFRESH_MS = 15000;

export function loadStudent(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(STUDENT_STORAGE_KEY));
    return Number.isSafeInteger(value?.studentId) && value.studentId > 0 && typeof value.className === 'string'
      ? { studentId: value.studentId, className: value.className } : null;
  } catch { return null; }
}
export function storeStudent(student, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (student) storage.setItem(STUDENT_STORAGE_KEY, JSON.stringify({ studentId: student.studentId, className: student.className }));
    else storage.removeItem(STUDENT_STORAGE_KEY);
    return true;
  } catch { return false; }
}
export async function passRequest(body, { signal, fetcher = globalThis.fetch } = {}) {
  const response = await fetcher(PASS_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body), credentials: 'omit', redirect: 'follow', cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error('Нет соединения с таблицей. Проверьте интернет и повторите.');
  let result;
  try { result = await response.json(); } catch { throw new Error('Обработчик вернул неверный ответ. Повторите позже.'); }
  if (result?.ok !== true) {
    if (body.action === 'studentPasses' && result?.error?.includes('Неизвестная операция')) {
      throw new Error('Обработчик пропусков ещё не обновлён. Попросите сотрудника школы обновить развёртывание Apps Script.');
    }
    throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось прочитать таблицу. Повторите позже.');
  }
  return result;
}
export function rosterForClass(students, className) {
  if (!Array.isArray(students)) throw new Error('Не удалось прочитать список учеников.');
  const seen = new Set();
  return students.filter(student => student?.className === className
    && Number.isSafeInteger(student.studentId) && student.studentId > 0
    && typeof student.studentName === 'string' && student.studentName.trim()
    && !seen.has(student.studentId) && seen.add(student.studentId))
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ru'));
}
export function studentPasses(records, student) {
  if (!Array.isArray(records)) throw new Error('Не удалось прочитать пропуски.');
  const seen = new Set();
  return records.filter(pass => {
    if (!student || pass?.studentId !== student.studentId || pass.className !== student.className) return false;
    let qr;
    try { qr = JSON.parse(pass.qrPayload); } catch { throw new Error('Повреждён QR-код пропуска. Обратитесь к учителю.'); }
    const fields = ['id', 'studentId', 'studentName', 'className', 'exitAt', 'timeZone', 'createdAt', 'type', 'version'];
    if (typeof pass.qrPayload !== 'string' || !qr || !fields.every(key => qr[key] === pass[key])
      || pass.version !== 1 || pass.type !== 'school-exit-pass' || pass.timeZone !== 'Europe/Moscow'
      || typeof pass.id !== 'string' || !pass.id || typeof pass.studentName !== 'string'
      || !Number.isFinite(Date.parse(pass.exitAt))) throw new Error('Данные пропуска не совпадают с QR-кодом. Обратитесь к учителю.');
    if (seen.has(pass.id)) return false;
    seen.add(pass.id); return true;
  }).sort((a, b) => Date.parse(b.exitAt) - Date.parse(a.exitAt) || a.id.localeCompare(b.id));
}
export function moscowExit(exitAt) {
  const date = new Date(exitAt);
  return {
    date: new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date),
  };
}
