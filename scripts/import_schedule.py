"""Convert the school's teacher workbook to a class timetable. Usage: python scripts/import_schedule.py workbook.xlsx"""
import sys, re, json
from pathlib import Path
import openpyxl
sheet=openpyxl.load_workbook(sys.argv[1],data_only=True).active
classes={}; subject=None; unknown=set(); entries=0
for row in list(sheet.values)[2:]:
    teacher,specialty,homeroom,room=row[:4]
    if not teacher: continue
    if all(v is None for v in row[1:]):
        subject=str(teacher); continue
    current=subject if specialty else 'Предмет не указан'
    for col, value in enumerate(row[4:64]):
        if value is None: continue
        found=re.findall(r'(?<!\d)(1[01]|[1-9])\s*([А-ЯЁ])(?![А-ЯЁа-яё])',str(value))
        if not found: unknown.add(str(value)); continue
        day,lesson=divmod(col,10)
        for grade,letter in found:
            name=grade+letter
            days=classes.setdefault(name,{str(d):{} for d in range(6)})
            slot=days[str(day)].setdefault(str(lesson+1),[])
            item={'subject':current,'teacher':str(teacher),'room':str(room or ''),'specialty':str(specialty or ''),'shared':len(found)>1}
            if item not in slot: slot.append(item); entries+=1
bells=[]
for cell in list(sheet.values)[1][4:14]:
    n,start,end=str(cell).split('\n'); bells.append({'number':int(n),'start':start.replace('.',':'),'end':end.replace('.',':')})
data={'source':'schedule_teachers_readable.xlsx','classes':classes,'bells':bells,'notes':['Названия предметов взяты из разделов исходной таблицы. Русский язык и литература, история и обществознание не разделены в источнике.','Кабинет указан из строки учителя; отдельного кабинета для каждого занятия в источнике нет.','Несколько учителей в одном уроке показаны вместе: деление на подгруппы в источнике не обозначено.'],'unparsed':sorted(unknown)}
Path('data/schedule.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(f'{len(classes)} classes, {entries} entries, unparsed: {sorted(unknown)}')
