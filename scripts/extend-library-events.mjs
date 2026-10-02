import fs from 'node:fs';
for(const [lang,value] of Object.entries({es:'Biblioteca de películas actualizada',en:'Film library updated',it:'Biblioteca di film aggiornata',ar:'تم تحديث مكتبة الأفلام'})){const p=`locales/${lang}.js`;let s=fs.readFileSync(p,'utf8');s=s.replace(/\n};\s*$/,`\n  "activity.LIBRARY_UPDATED": ${JSON.stringify(value)},\n};\n`);fs.writeFileSync(p,s);}
