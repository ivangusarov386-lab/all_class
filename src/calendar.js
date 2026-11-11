export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const monthKey = date => dateKey(date).slice(0, 7);

export function dateInMonth(date, key) {
  const parts = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!parts) throw Error('Месяц не распознан');
  const year = +parts[1], month = +parts[2] - 1;
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay), 12);
}

export function shiftMonth(date, delta) {
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
  return dateInMonth(date, monthKey(target));
}

export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const cell = new Date(first); cell.setDate(index - offset + 1);
    return { date: cell, key: dateKey(cell), outside: cell.getMonth() !== date.getMonth() };
  });
}

export function monthOptions(current, selected, sourceMonths = []) {
  const years = new Set([current.getFullYear() - 1, current.getFullYear(), current.getFullYear() + 1, selected.getFullYear()]);
  for (const key of sourceMonths) if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) years.add(+key.slice(0, 4));
  return [...years].sort((a, b) => a - b).flatMap(year => Array.from({ length: 12 }, (_, month) => `${year}-${String(month + 1).padStart(2, '0')}`));
}
