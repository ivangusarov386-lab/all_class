import { utils, write } from '../../vendor/xlsx.js';

// Date and teaching fields from the reported Google row, without absence/payroll data.
export function missingReplacementWorkbook({ date1904 = false, fraction = 0 } = {}) {
  const book = utils.book_new();
  book.Workbook = { WBProps: { date1904 } };
  const sheet = utils.aoa_to_sheet([
    [],
    ['', 'Дата', 'Ф.И.О. учителя,пропустившего урок', 'Предмет', 'Класс', 'Урок', '', 'Кабинет', 'Ф.И.О. учителя,заменившего урок', 'Предмет'],
    ['', 46331 - (date1904 ? 1462 : 0) + fraction, 'Вакансия (математика,ПЮ)', 'Математика', '6м-з', '4', '', '2.24', 'Шурухина О.С.', 'Математика'],
  ]);
  sheet.B3.z = 'm/d/yy';
  utils.book_append_sheet(book, sheet, '1-30 ноября 2026');
  return write(book, { type: 'buffer', bookType: 'xlsx' });
}
