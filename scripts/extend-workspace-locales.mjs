import {readFile,writeFile} from 'node:fs/promises';
const messages={
 'profiles.amber':['Ámbar','Amber','Ambra','كهرماني'],
 'profiles.pink':['Rosa','Pink','Rosa','وردي'],
 'profiles.cyan':['Cian','Cyan','Ciano','سماوي'],
 'profiles.slate':['Gris','Slate','Grigio','رمادي'],
 'profiles.preview':['Vista previa del avatar','Avatar preview',"Anteprima dell’avatar",'معاينة الصورة'],
 'profiles.uniqueColors':['Cada perfil utiliza un color diferente.','Each profile uses a different color.','Ogni profilo usa un colore diverso.','يستخدم كل ملف شخصي لونًا مختلفًا.'],
 'workspace.title':['Espacio de trabajo operativo','Operations workspace','Area operativa','مساحة العمل التشغيلية'],
 'workspace.scope':['Registros guardados en este dispositivo. Importa datos o ingrésalos para actualizar resultados.','Records stored on this device. Import or enter data to update results.','Dati salvati su questo dispositivo. Importa o inserisci dati per aggiornare i risultati.','سجلات محفوظة على هذا الجهاز. استورد البيانات أو أدخلها لتحديث النتائج.'],
 'workspace.invalid':['Revisa los valores, referencias y formato del archivo.','Check values, references and file format.','Controlla valori, riferimenti e formato del file.','تحقق من القيم والمراجع وتنسيق الملف.'],
 'workspace.curation':['Selección regional','Regional selection','Selezione regionale','الاختيار الإقليمي'],
 'workspace.curationHelp':['Define prioridades editoriales por región. Los títulos guardados aparecen en Inicio.','Set editorial priorities by region. Saved titles appear on Home.','Imposta le priorità editoriali per regione. I titoli salvati appaiono nella pagina iniziale.','حدد الأولويات التحريرية حسب المنطقة. تظهر العناوين المحفوظة في الصفحة الرئيسية.'],
 'workspace.titleChoice':['Título','Title','Titolo','العنوان'],
 'workspace.priority':['Prioridad (0–100)','Priority (0–100)','Priorità (0–100)','الأولوية (0–100)'],
 'workspace.customers':['Clientes y facturación','Customers and billing','Clienti e fatturazione','العملاء والفوترة'],
 'workspace.customer':['Nombre del cliente','Customer name','Nome del cliente','اسم العميل'],
 'workspace.clients':['Clientes registrados','Registered customers','Clienti registrati','العملاء المسجلون'],
 'workspace.pending':['Saldo pendiente','Outstanding balance','Saldo da pagare','الرصيد المستحق'],
 'workspace.settled':['Abonos registrados','Recorded payments','Pagamenti registrati','الدفعات المسجلة'],
 'workspace.invoices':['Facturas','Invoices','Fatture','الفواتير'],
 'workspace.newInvoice':['Registrar factura','Record invoice','Registra fattura','تسجيل فاتورة'],
 'workspace.billingHelp':['Registra importes y abonos; esta acción no realiza un cobro bancario.','Record amounts and payments; this action does not charge a bank account.','Registra importi e pagamenti; questa azione non effettua addebiti bancari.','سجل المبالغ والدفعات؛ لا تُجري هذه العملية خصمًا بنكيًا.'],
 'workspace.amount':['Importe (USD)','Amount (USD)','Importo (USD)','المبلغ (دولار أمريكي)'],
 'workspace.dueDate':['Vencimiento','Due date','Scadenza','تاريخ الاستحقاق'],
 'workspace.recordPayment':['Registrar abono','Record payment','Registra pagamento','تسجيل دفعة'],
 'workspace.capacity':['Capacidad regional','Regional capacity','Capacità regionale','السعة الإقليمية'],
 'workspace.capacityHelp':['Estimación de planificación con los valores ingresados; no es medición de infraestructura desplegada.','Planning estimate based on entered values; not a measurement of deployed infrastructure.','Stima di pianificazione basata sui valori inseriti; non misura infrastrutture operative.','تقدير تخطيطي بناءً على القيم المدخلة، وليس قياسًا للبنية التحتية الفعلية.'],
 'workspace.users':['Reproducciones concurrentes','Concurrent streams','Riproduzioni simultanee','عمليات البث المتزامنة'],
 'workspace.mbps':['Mbps por reproducción','Mbps per stream','Mbps per riproduzione','ميغابت/ثانية لكل بث'],
 'workspace.cachePercent':['Contenido servido desde caché (%)','Content served from cache (%)','Contenuti serviti dalla cache (%)','المحتوى المقدم من ذاكرة التخزين المؤقت (%)'],
 'workspace.nodes':['Nodos','Nodes','Nodi','العقد'],
 'workspace.nodeHourly':['USD por nodo/h','USD per node/hour','USD per nodo/ora','دولار لكل عقدة/ساعة'],
 'workspace.egressPerGb':['USD por GB de salida','USD per outbound GB','USD per GB in uscita','دولار لكل غيغابايت صادر'],
 'workspace.originTraffic':['Tráfico desde origen','Origin traffic','Traffico dall’origine','حركة البيانات من المصدر'],
 'workspace.hourlyCost':['Costo estimado','Estimated cost','Costo stimato','التكلفة المقدرة'],
 'workspace.empty':['Aún no hay registros. Agrega valores para empezar.','No records yet. Add values to get started.','Nessun dato registrato. Aggiungi valori per iniziare.','لا توجد سجلات بعد. أضف القيم للبدء.'],
 'workspace.import':['Incorporar archivo JSON','Import JSON file','Importa file JSON','استيراد ملف JSON'],
 'workspace.export':['Exportar registros','Export records','Esporta dati','تصدير السجلات'],
};
for(const [index,locale]of ['es','en','it','ar'].entries()) {
 let source=await readFile(`locales/${locale}.js`,'utf8');
 const entries=Object.entries(messages).filter(([key])=>!source.includes(JSON.stringify(key)+':')).map(([key,values])=>`  ${JSON.stringify(key)}: ${JSON.stringify(values[index])},`).join('\n');
 source=source.replace(/\n};\s*$/,`\n${entries}\n};\n`);
 await writeFile(`locales/${locale}.js`,source);
}
