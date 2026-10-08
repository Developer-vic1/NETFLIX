import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const root = resolve(import.meta.dirname, "..");
const destination = resolve(process.argv[2] || "android-local/build/assets/www");
const assets = JSON.parse(await readFile(resolve(root, "assets/offline-manifest.json"), "utf8"));
for (const asset of assets) {
  const relative = asset.replace(/^\//, "");
  if (!relative) continue;
  if (relative === "sw.js" || relative.endsWith("offline-manifest.json")) continue;
  if (relative.includes("..") || /\.(mp4|mkv)$/i.test(relative)) throw new Error(`Unexpected application asset: ${relative}`);
  const target = resolve(destination, relative);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, relative), target);
}
async function patch(relative, old, replacement) {
  const target = resolve(destination, relative);
  const source = (await readFile(target, "utf8")).replaceAll("\r\n", "\n");
  if (!source.includes(old)) throw new Error(`Mobile adapter needs updating: ${relative}`);
  await writeFile(target, source.replace(old, replacement));
}
await patch("js/app.js", 'await loadLibrary().catch', 'titles.splice(0, titles.length);\nawait loadLibrary().catch');
await patch("js/app.js", 'if ("serviceWorker" in navigator) {', 'if (false) { // The APK and selected folder already contain offline files.');
await patch("js/services/library.service.js", 'Promise.allSettled([cachedLibrary(), readDiskLibrary()])', 'Promise.allSettled([Promise.resolve([]), readDiskLibrary()])');
await patch("js/services/library.service.js", 'try { await cacheRecord(record); }', 'try { /* The selected Android folder is the single catalog source. */ }');
await patch("js/data/profiles.js", '  { id: "administrator", name: "Administrador", role: "admin", color: "red" },', '  // Library editing remains in the desktop application.');
await patch("js/services/profile.service.js", 'valid.some((item) => item.role === "admin")', 'valid.length > 0');
await patch("js/services/download.service.js", 'if (!("caches" in window)) return [];', 'return titles.filter(title => title.uploaded);\n  if (!("caches" in window)) return [];');
await patch("js/services/download.service.js", 'export async function downloadTitle(title) {', 'export async function downloadTitle(title) {\n  return; // Already on the device; do not duplicate large files.');
const downloadButton = `import { button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
export function downloadButton(title, navigate) {
  return button(icon("check"), () => navigate("downloads"), "icon-button", {"aria-label": t("library.offline")});
}\n`;
await writeFile(resolve(destination, "js/components/download-button.js"), downloadButton);
await patch("js/pages/player.js", 't(title.uploaded && title.localAsset?.startsWith("blob:") ? "library.offline" : "downloads.save")', 't("library.offline")');
await patch("js/pages/player.js", 'if (preferences.autoplay && navigator.onLine)', 'if (preferences.autoplay)');
await patch("js/pages/player.js", `          el("a", {
            class: "text-link",
            href: title.watchSource,
            target: "_blank",
            rel: "noopener noreferrer",
            text: t("player.openSource"),
          }),`, '          null, // The Android player reads the selected file directly.');
await patch("js/components/media-player.js", '  const floatingPlayer = pictureInPicture(video, {', '  pip.hidden = true; // Native floating video is not part of this Android build.\n  const floatingPlayer = pictureInPicture(video, {');
await patch("js/components/media-player.js", '      text: t("player.openSource"),', '      text: t("player.openSource"), hidden: true,');
const downloadsPath = resolve(destination, "js/pages/downloads.js");
const downloads = await readFile(downloadsPath, "utf8");
await writeFile(downloadsPath, downloads.replaceAll('title.uploaded && title.localAsset?.startsWith("blob:")', 'title.uploaded'));
await patch("js/pages/downloads.js", 'const estimate = await navigator.storage?.estimate?.();', 'const estimate = null;\n    storage.textContent = t("library.offline");');
const mobileCopy = {
  es: ["Tus películas y capítulos guardados en el teléfono.", "Los videos se leen desde la carpeta seleccionada, sin crear otra copia ni necesitar la computadora."],
  en: ["Your films and episodes saved on this phone.", "Videos are read from the selected folder without another copy or a computer."],
  it: ["I tuoi film ed episodi salvati sul telefono.", "I video vengono letti dalla cartella selezionata, senza creare un'altra copia e senza bisogno del computer."],
  ar: ["أفلامك وحلقاتك المحفوظة على هذا الهاتف.", "تُقرأ الفيديوهات من المجلد المحدد دون إنشاء نسخة إضافية أو الحاجة إلى الكمبيوتر."],
};
for (const [language, texts] of Object.entries(mobileCopy)) {
  const file = resolve(destination, `locales/${language}.js`);
  let text = await readFile(file, "utf8");
  for (const [index, key] of ["downloads.subtitle", "downloads.device"].entries()) {
    const pattern = new RegExp(`"${key.replaceAll(".", "\\.")}"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`);
    if (!pattern.test(text)) throw new Error(`Mobile copy adapter needs updating: ${language}/${key}`);
    text = text.replace(pattern, `${JSON.stringify(key)}: ${JSON.stringify(texts[index])}`);
  }
  await writeFile(file, text);
}
const homePath = resolve(destination, "js/pages/home.js");
const home = (await readFile(homePath, "utf8")).replaceAll("\r\n", "\n");
const heroStart = home.indexOf('  if (route === "home") {');
const heroEnd = home.indexOf('  const page = el("div", {', heroStart);
if (heroStart < 0 || heroEnd < heroStart) throw new Error("Mobile hero adapter needs updating");
await writeFile(homePath, 'import { mobileHero } from "../components/mobile-hero.js";\n' + home.slice(0, heroStart) + '  if (route === "home") mobileHero(root, catalog[0], navigate);\n' + home.slice(heroEnd));
await mkdir(resolve(destination, "js/components"), { recursive: true });
await copyFile(resolve(root, "android-local/web/mobile-hero.js"), resolve(destination, "js/components/mobile-hero.js"));
console.log(`Android web bundle: ${destination}; catalog/videos stay in the selected folder.`);
