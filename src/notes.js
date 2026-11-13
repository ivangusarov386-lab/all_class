export const NOTES_STORAGE_KEY = 'school-subject-notes-v1';
export const MAX_NOTE_LENGTH = 5000;

function subjectIdentity(subject) {
  const key = String(subject).normalize('NFC').toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
  return ({ иностранныйанглийскийязык: 'английскийязык', второйиностранныйкитайскийязык: 'китайскийязык', трудтехнология: 'технология' })[key] || key;
}

export const subjectNoteKey = (className, subject) => JSON.stringify([String(className).trim().toUpperCase(), subjectIdentity(subject)]);

export function uniqueNoteSubjects(subjects) {
  const seen = new Set();
  return subjects.filter(subject => {
    const key = subjectIdentity(subject || '');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function loadSubjectNotes(storage) {
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(NOTES_STORAGE_KEY));
    if (data?.version !== 1 || !data.notes || typeof data.notes !== 'object' || Array.isArray(data.notes)) return {};
    return Object.fromEntries(Object.entries(data.notes).filter(([, text]) => typeof text === 'string' && text.trim()));
  } catch { return {}; }
}

export const getSubjectNote = (notes, className, subject) => notes[subjectNoteKey(className, subject)] || '';

export function saveSubjectNotes(className, updates, storage) {
  const target = storage ?? globalThis.localStorage;
  // Read just before writing so changes to other subjects in another tab survive.
  const next = loadSubjectNotes(target);
  for (const { subject, text } of updates) {
    if (!String(className).trim() || !subjectIdentity(subject) || typeof text !== 'string') throw Error('Не указан класс или предмет заметки.');
    if (text.length > MAX_NOTE_LENGTH) throw Error('Заметка слишком длинная. Максимум — 5 000 символов.');
    const key = subjectNoteKey(className, subject);
    if (text.trim()) next[key] = text;
    else delete next[key];
  }
  // localStorage has no expiry. Only return new state after a successful write.
  target.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: 1, notes: next }));
  return next;
}
