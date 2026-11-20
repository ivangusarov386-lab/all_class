export const DEMO_CLASS = '9Ц';
export const DEMO_DATE = '2026-11-20';

// These sample events belong only to the demo branch. School source files stay intact.
export function demoReplacements(schedule) {
  const slots = schedule.classes[DEMO_CLASS]?.['4'] || {};
  return [1, 2, 4, 5].map(lesson => ({
    className: DEMO_CLASS,
    date: DEMO_DATE,
    lesson,
    subject: lesson < 3 ? 'МЦКО · Русский язык' : 'СтатГрад · Математика',
    room: lesson < 3 ? '2.41' : '',
    teacher: '',
    originalSubject: '',
    originalTeacher: '',
    targetTeachers: [...new Set((slots[String(lesson)] || []).map(item => item.teacher))],
    demo: true,
    eventType: lesson < 3 ? 'mcko' : 'statgrad',
  }));
}

export function withDemoReplacements(entries, schedule) {
  const demo = demoReplacements(schedule);
  const lessons = new Set(demo.map(row => row.lesson));
  return [
    ...entries.filter(row => !(row.className === DEMO_CLASS && row.date === DEMO_DATE && lessons.has(row.lesson))),
    ...demo,
  ];
}

export function gtoBannerHTML(className) {
  if (className !== DEMO_CLASS) return '';
  return `<aside class="gto-banner" aria-labelledby="gto-title">
    <div class="gto-emblem" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 7 14 22L46 7M11 7h14l7 11 7-11h14L38 32H26Z"/><circle cx="32" cy="43" r="14"/><path d="m32 35 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z"/></svg></div>
    <div class="gto-copy"><span class="gto-eyebrow">Для 9Ц класса</span><h2 id="gto-title">Регистрация на ГТО</h2><p>Твой следующий шаг — к знаку отличия.</p></div>
    <a class="gto-link" href="https://www.gto.ru/" target="_blank" rel="noreferrer">На сайт ГТО <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg></a>
  </aside>`;
}

export function lessonEventType(className, changes) {
  if (className !== DEMO_CLASS || !changes.length) return '';
  const kinds = changes.map(row => row.eventType || (/мцко/i.test(row.subject) ? 'mcko' : /стат\s*град/i.test(row.subject) ? 'statgrad' : 'replacement'));
  // A mixed lesson retains the replacement colour; each event keeps its text label.
  return kinds.every(kind => kind === kinds[0]) ? kinds[0] : 'replacement';
}
