"""Import placed lessons from an aSc Timetables XML export.

Usage: python3 scripts/import_schedule.py timetable.xml [--output data/schedule.json]
Only Python's standard library is required. XML references are data, not commands.
"""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


def identifiers(value):
    return [part.strip() for part in value.split(',') if part.strip()]


def section_index(root, name):
    section = root.find(name)
    if section is None:
        raise ValueError(f'В XML нет раздела {name}.')
    result = {}
    for element in section:
        key = element.get('id')
        if not key or key in result:
            raise ValueError(f'Пустой или повторяющийся id в разделе {name}.')
        result[key] = element.attrib
    return result


def resolve(index, key, kind):
    if key not in index:
        raise ValueError(f'В XML не найден {kind}: {key}.')
    return index[key]


def class_name(value):
    name = re.sub(r'-З$', '', re.sub(r'\s+', '', value.upper()))
    if not re.fullmatch(r'(?:1[01]|[1-9])[А-ЯЁ]', name):
        raise ValueError(f'Не распознано название класса: {value}.')
    return name


def import_schedule(path):
    raw = path.read_bytes()
    root = ET.fromstring(raw)  # Honors the XML encoding, including Windows-1251.
    if root.tag != 'timetable':
        raise ValueError('Ожидается XML-экспорт aSc Timetables с корнем timetable.')
    classes, teachers, subjects, rooms, groups, lessons = (
        section_index(root, name)
        for name in ('classes', 'teachers', 'subjects', 'classrooms', 'groups', 'lessons')
    )
    names = {key: class_name(item['name']) for key, item in classes.items()}
    if len(set(names.values())) != len(names):
        raise ValueError('Разные классы XML имеют одинаковое обозначение после нормализации.')

    # Map the export's day-mask positions to Monday-first application weekdays.
    short_days = {'ПН': 0, 'ВТ': 1, 'СР': 2, 'ЧТ': 3, 'ПТ': 4, 'СБ': 5, 'ВС': 6}
    day_map = {}
    mask_length = None
    for day in root.findall('./daysdefs/daysdef'):
        mask = day.get('days', '')
        short = day.get('short', '').upper()
        if short in short_days and re.fullmatch(r'0*10*', mask):
            if mask_length is not None and len(mask) != mask_length:
                raise ValueError('Несогласованные маски дней в XML.')
            mask_length = len(mask)
            day_map[mask.index('1')] = short_days[short]
    if not mask_length or len(day_map) != mask_length or len(set(day_map.values())) != mask_length:
        raise ValueError('Не удалось однозначно определить дни недели XML.')

    # Alternating-week/term cards must never be merged into one weekly timetable.
    for section, attribute in [('weeksdefs', 'weeks'), ('termsdefs', 'terms')]:
        definitions = root.find(section)
        if definitions is None or len(definitions) != 1 or definitions[0].get(attribute) != '1':
            raise ValueError('Для разных учебных недель или периодов требуется отдельное расписание.')

    bells = sorted(({
        'number': int(period.get('period')),
        'start': period.get('starttime'), 'end': period.get('endtime'),
    } for period in root.findall('./periods/period')), key=lambda period: period['number'])
    if not bells or [bell['number'] for bell in bells] != list(range(1, len(bells) + 1)) or len(bells) > 10:
        raise ValueError('Ожидаются последовательные номера уроков от 1 до 10.')
    if any(not re.fullmatch(r'(?:[01]?\d|2[0-3]):[0-5]\d', str(bell[field])) for bell in bells for field in ('start', 'end')):
        raise ValueError('В XML не указано корректное время звонков.')

    ordered_names = sorted(names.values(), key=lambda name: (int(re.match(r'\d+', name)[0]), name))
    days = sorted(day_map.values())
    timetable = {name: {str(day): {} for day in days} for name in ordered_names}

    def lesson_items(lesson, assigned_rooms):
        class_ids = identifiers(lesson.get('classids', ''))
        teacher_ids = identifiers(lesson.get('teacherids', ''))
        if not class_ids or not teacher_ids:
            raise ValueError('У занятия XML нет класса или учителя.')
        subject = resolve(subjects, lesson.get('subjectid'), 'предмет')['name'].strip()
        room = ', '.join(resolve(rooms, key, 'кабинет')['name'].strip() for key in identifiers(assigned_rooms))
        for key in class_ids:
            name = resolve(names, key, 'класс')
            assigned_groups = [resolve(groups, group, 'подгруппа') for group in identifiers(lesson.get('groupids', ''))]
            own_groups = [group for group in assigned_groups if group.get('classid') == key]
            if not own_groups:
                raise ValueError(f'Для занятия {name} не указана подгруппа или весь класс.')
            labels = [] if any(group.get('entireclass') == '1' for group in own_groups) else list(dict.fromkeys(group['name'].strip() for group in own_groups))
            for teacher_id in teacher_ids:
                teacher = resolve(teachers, teacher_id, 'учитель')
                display_teacher = (teacher.get('short') or teacher.get('name') or '').strip()
                if not subject or not display_teacher:
                    raise ValueError('У занятия XML пустой предмет или имя учителя.')
                yield name, {
                    'subject': subject, 'teacher': display_teacher, 'room': room,
                    'groups': labels, 'shared': len(class_ids) > 1,
                }

    placed = set()
    card_count = 0
    entries = 0
    for card in root.findall('./cards/card'):
        card_count += 1
        lesson_id = card.get('lessonid')
        lesson = resolve(lessons, lesson_id, 'занятие')
        if card.get('weeks') != '1' or card.get('terms') != '1':
            raise ValueError('Карточка относится к отдельной неделе или учебному периоду.')
        mask = card.get('days', '')
        if len(mask) != mask_length or not re.fullmatch(r'[01]+', mask) or '1' not in mask:
            raise ValueError('Не назначен день занятия или неверна маска дней XML.')
        period = int(card.get('period', '0'))
        duration = int(lesson.get('periodspercard', '1'))
        if duration < 1 or period < 1 or period + duration - 1 > len(bells):
            raise ValueError('Занятие выходит за диапазон номеров уроков XML.')
        placed.add(lesson_id)
        # Card classrooms are assigned rooms; lesson classrooms are only allowed options.
        items = list(lesson_items(lesson, card.get('classroomids', '')))
        for position, bit in enumerate(mask):
            if bit != '1':
                continue
            for number in range(period, period + duration):
                for name, item in items:
                    slot = timetable[name][str(day_map[position])].setdefault(str(number), [])
                    if item in slot:
                        raise ValueError(f'Повтор занятия {name}, день {day_map[position] + 1}, урок {number}.')
                    slot.append(item)
                    entries += 1
    if not card_count:
        raise ValueError('В XML нет назначенных карточек расписания.')
    for class_days in timetable.values():
        for day, slots in class_days.items():
            class_days[day] = dict(sorted(slots.items(), key=lambda pair: int(pair[0])))

    unscheduled = [
        {'className': name, **item}
        for key, lesson in lessons.items() if key not in placed
        for name, item in lesson_items(lesson, '')
    ]
    source_revision = hashlib.sha256(raw).hexdigest()
    applied = []
    correction_path = Path(__file__).resolve().parent.parent / 'data' / 'schedule-corrections.json'
    if correction_path.exists():
        corrections = json.loads(correction_path.read_text(encoding='utf-8'))
        if corrections.get('sourceRevision') == source_revision:
            for correction in corrections.get('ignoreUnscheduled', []):
                matches = [item for item in unscheduled if all(item[key] == correction[key] for key in ('className', 'subject', 'teacher'))]
                confirmed = timetable.get(correction['className'], {}).get(str(correction['confirmedDay']), {}).get(str(correction['confirmedLesson']), [])
                if len(matches) != 1 or not any(item['subject'] == correction['subject'] and item['teacher'] == correction['confirmedTeacher'] for item in confirmed):
                    raise ValueError('Подтверждённое уточнение не совпадает с XML. Нужна проверка исходных данных.')
                unscheduled.remove(matches[0])
                applied.append(correction)
    revision = source_revision if not applied else hashlib.sha256((source_revision + json.dumps(applied, ensure_ascii=False, sort_keys=True)).encode('utf-8')).hexdigest()
    result = {
        'source': path.name, 'format': 'aSc Timetables XML',
        'sourceRevision': source_revision, 'revision': revision,
        'classes': timetable, 'bells': bells,
        'notes': [
            'Предметы, учителя и подгруппы перенесены напрямую из XML aSc Timetables.',
            'Кабинет взят из конкретного занятия. Если в XML он не назначен, список допустимых кабинетов не используется вместо него.',
            'Совместные занятия и несколько учителей сохранены. Названия подгрупп соответствуют исходному файлу.',
            'Занятия без назначенных дня и номера урока перечислены отдельно и не добавляются в произвольный день.',
        ],
        'unparsed': [], 'unscheduled': unscheduled,
        'stats': {
            'classes': len(timetable), 'lessonDefinitions': len(lessons),
            'sourceCards': card_count, 'scheduledLessons': len(placed),
            'entries': entries, 'slots': sum(len(slots) for class_days in timetable.values() for slots in class_days.values()),
            'unscheduledLessons': len(lessons) - len(placed) - len(applied),
        },
    }
    if applied:
        result['corrections'] = applied
        result['stats']['ignoredUnscheduledLessons'] = len(applied)
        result['notes'].append('Подтверждено пользователем: у 6Е «Разговоры о важном» ведёт Котнов К.В. по понедельникам первым уроком, кабинет 3.39. Лишняя неназначенная запись с Поповой Ю.Н. исключена.')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xml', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data/schedule.json'))
    args = parser.parse_args()
    try:
        result = import_schedule(args.xml)
    except (ValueError, KeyError, ET.ParseError) as error:
        parser.exit(1, f'Ошибка импорта: {error}\n')
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result['stats'], ensure_ascii=False))
