import { writeFile } from "node:fs/promises";
const rows = [
  [
    "ops.startup",
    "Inicio del video",
    "Video startup",
    "Avvio del video",
    "بدء الفيديو",
  ],
  [
    "ops.startupP95",
    "Inicio del video · P95",
    "Video startup · P95",
    "Avvio del video · P95",
    "بدء الفيديو · P95",
  ],
  [
    "ops.controlRoom",
    "CONTROL OPERATIVO",
    "CONTROL ROOM",
    "SALA DI CONTROLLO",
    "غرفة التحكم",
  ],
  [
    "ops.health.catalog",
    "{count} títulos · HTTP {status}",
    "{count} titles · HTTP {status}",
    "{count} titoli · HTTP {status}",
    "{count} عناوين · HTTP {status}",
  ],
  [
    "ops.health.storage",
    "Lectura y escritura verificadas",
    "Read and write verified",
    "Lettura e scrittura verificate",
    "تم التحقق من القراءة والكتابة",
  ],
  [
    "ops.health.offline",
    "{count} descargas · almacenamiento activo",
    "{count} downloads · storage active",
    "{count} download · archiviazione attiva",
    "{count} تنزيلات · التخزين نشط",
  ],
  [
    "ops.health.inactive",
    "Almacenamiento offline sin activar",
    "Offline storage not activated",
    "Archiviazione offline non attivata",
    "لم يُفعّل التخزين دون اتصال",
  ],
  [
    "ops.health.empty",
    "El catálogo no contiene títulos",
    "The catalog contains no titles",
    "Il catalogo non contiene titoli",
    "الكتالوج لا يحتوي على عناوين",
  ],
  [
    "ops.health.blocked",
    "El navegador no permite guardar preferencias",
    "The browser does not allow preferences to be saved",
    "Il browser non consente di salvare le preferenze",
    "المتصفح لا يسمح بحفظ التفضيلات",
  ],
];
for (const [column, code] of ["es", "en", "it", "ar"].entries()) {
  const dictionary = (await import(`../locales/${code}.js`)).default;
  for (const [key, ...values] of rows) dictionary[key] = values[column];
  await writeFile(
    `locales/${code}.js`,
    `export default ${JSON.stringify(dictionary, null, 2)};\n`,
  );
}
