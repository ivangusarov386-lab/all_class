export const SHEET_URL='https://docs.google.com/spreadsheets/d/1vIOpBDYYJlVAnTNHKAvS8YBsIMK8wjV6HU3EACIqJSs/edit';
export const EXPORT_URL=SHEET_URL.replace('/edit','/export?format=xlsx');
const clean=v=>String(v??'').trim();
export const normalizeClass=v=>clean(v).toUpperCase().replace(/[\s«»"']/g,'');
export function normalizeDate(v){
 if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
 const s=clean(v);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?s:null;}
 m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
 if(!m)return null;
 const date=new Date(+m[3],+m[2]-1,+m[1]);
 return date.getDate()===+m[1]&&date.getMonth()===+m[2]-1?normalizeDate(date):null;
}
const aliases={date:['дата','date'],className:['класс','class'],lesson:['урок','номер урока','№ урока','lesson'],subject:['замена','предмет','новый предмет'],teacher:['кто заменяет','заменяющий учитель','учитель','заменяет'],room:['кабинет','каб.','каб','где'],originalTeacher:['кого заменяют','отсутствующий учитель']};
export function parseReplacementRows(rows){
 let header=-1,columns={};
 for(let i=0;i<Math.min(rows.length,30);i++){
  const c={}; rows[i].forEach((v,j)=>{const s=clean(v).toLowerCase();for(const [key,names]of Object.entries(aliases))if(names.includes(s))c[key]=j;});
  if(['date','className','lesson'].every(k=>k in c)){header=i;columns=c;break;}
 }
 if(header<0)throw Error('Не найдены столбцы «Дата», «Класс» и «Урок». Используйте шаблон CSV. Формат исходной Google-таблицы пока не подтверждён.');
 const entries=[],errors=[];
 rows.slice(header+1).forEach((row,index)=>{
  if(row.every(v=>!clean(v)))return;
  const get=k=>columns[k]===undefined?'':row[columns[k]];
  const date=normalizeDate(get('date')),className=normalizeClass(get('className')),lesson=Number(get('lesson'));
  if(!date||!/^([1-9]|1[01])[А-ЯЁ]$/.test(className)||!Number.isInteger(lesson)||lesson<1||lesson>10||(!clean(get('subject'))&&!clean(get('teacher')))) {errors.push(index+header+2);return;}
  entries.push({date,className,lesson,subject:clean(get('subject')),teacher:clean(get('teacher')),room:clean(get('room')),originalTeacher:clean(get('originalTeacher'))});
 });
 if(errors.length)throw Error(`Проверьте строки ${errors.slice(0,10).join(', ')}: нужны дата с годом, класс, урок и предмет или учитель. Файл не применён.`);
 if(!entries.length)throw Error('В файле нет записей замен. Файл не применён.');
 return entries;
}
