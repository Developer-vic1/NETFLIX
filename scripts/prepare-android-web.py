"""Prepare the Android web assets with Python alone, without Node or npm.

Only manifest-listed application assets are copied. Large videos, signing keys
and the private library stay outside the APK; Android reads the selected folder.
"""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat

ROOT = Path(__file__).resolve().parent.parent
ASSET_SUFFIXES = {'.css', '.html', '.jpg', '.js', '.json', '.png', '.svg', '.webp', '.woff2'}
ASSET_FOLDERS = {'assets', 'css', 'js', 'locales', 'vendor'}


def read_text(path):
    # Copied, unmodified files retain their original bytes. Adapter files follow
    # the original JavaScript adapter's deliberate CRLF normalization rules.
    with Path(path).open('r', encoding='utf-8', newline='') as handle:
        return handle.read()


def write_text(path, text):
    with Path(path).open('w', encoding='utf-8', newline='') as handle:
        handle.write(text)


def ensure_contained(path, parent):
    path, parent = Path(path), Path(parent).resolve()
    try:
        relative = path.absolute().relative_to(parent)
        resolved = path.resolve()
        resolved.relative_to(parent)
    except ValueError as error:
        raise ValueError(f'Asset path is outside its allowed directory: {path}') from error
    current = parent
    for part in relative.parts:
        current = current / part
        linked = current.is_symlink()
        if current.exists():
            attributes = getattr(current.lstat(), 'st_file_attributes', 0)
            linked = linked or bool(attributes & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))
        if linked:
            raise ValueError(f'Linked paths are not allowed in the Android bundle: {current}')
    return resolved


def validate_destination(root, destination):
    root = Path(root).resolve()
    destination = ensure_contained(destination, root)
    relative = destination.relative_to(root)
    # A mistyped destination must never overwrite desktop sources. Generated
    # folders only; nothing is deleted by this preparation tool.
    if not (len(relative.parts) >= 2 and relative.parts[0] == 'output'
            or len(relative.parts) >= 4 and relative.parts[:3] == ('android-local', 'build', 'assets')):
        raise ValueError('Android destination must be inside output/ or android-local/build/assets/.')
    return destination


def asset_plan(root, destination, assets):
    if not isinstance(assets, list):
        raise ValueError('The application asset manifest must be a list.')
    plan = []
    for asset in assets:
        if not isinstance(asset, str):
            raise ValueError('Application asset paths must be strings.')
        relative = asset[1:] if asset.startswith('/') else asset
        if not relative:
            continue
        if relative == 'sw.js' or relative.endswith('offline-manifest.json'):
            continue
        name = PurePosixPath(relative)
        if ('..' in relative or '\\' in relative or ':' in relative or name.is_absolute()
                or name.suffix.lower() not in ASSET_SUFFIXES
                or (relative != 'index.html' and name.parts[0] not in ASSET_FOLDERS)):
            raise ValueError(f'Unexpected application asset: {relative}')
        source = ensure_contained(Path(root) / relative, root)
        target = ensure_contained(Path(destination) / relative, destination)
        if not source.is_file():
            raise ValueError(f'Missing application asset: {relative}')
        plan.append((source, target))
    return plan


def patch(destination, relative, old, replacement):
    target = ensure_contained(Path(destination) / relative, destination)
    source = read_text(target).replace('\r\n', '\n')
    if old not in source:
        raise ValueError(f'Mobile adapter needs updating: {relative}')
    write_text(target, source.replace(old, replacement, 1))


def prepare_web(root, destination):
    root = Path(root).resolve()
    destination = validate_destination(root, destination)
    assets = json.loads(read_text(root / 'assets/offline-manifest.json'))
    plan = asset_plan(root, destination, assets)
    for source, target in plan:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)

    changes = [
        ('js/app.js', 'await loadLibrary().catch', 'titles.splice(0, titles.length);\nawait loadLibrary().catch'),
        ('js/app.js', 'if ("serviceWorker" in navigator) {', 'if (false) { // The APK and selected folder already contain offline files.'),
        ('js/services/library.service.js', 'Promise.allSettled([cachedLibrary(), readDiskLibrary()])', 'Promise.allSettled([Promise.resolve([]), readDiskLibrary()])'),
        ('js/services/library.service.js', 'try { await cacheRecord(record); }', 'try { /* The selected Android folder is the single catalog source. */ }'),
        ('js/data/profiles.js', '  { id: "administrator", name: "Administrador", role: "admin", color: "red" },', '  // Library editing remains in the desktop application.'),
        ('js/services/profile.service.js', 'valid.some((item) => item.role === "admin")', 'valid.length > 0'),
        ('js/services/download.service.js', 'if (!("caches" in window)) return [];', 'return titles.filter(title => title.uploaded);\n  if (!("caches" in window)) return [];'),
        ('js/services/download.service.js', 'export async function downloadTitle(title) {', 'export async function downloadTitle(title) {\n  return; // Already on the device; do not duplicate large files.'),
        ('js/pages/player.js', 't(title.uploaded && title.localAsset?.startsWith("blob:") ? "library.offline" : "downloads.save")', 't("library.offline")'),
        ('js/pages/player.js', 'if (preferences.autoplay && navigator.onLine)', 'if (preferences.autoplay)'),
        ('js/pages/player.js', '''          el("a", {
            class: "text-link",
            href: title.watchSource,
            target: "_blank",
            rel: "noopener noreferrer",
            text: t("player.openSource"),
          }),''', '          null, // The Android player reads the selected file directly.'),
        ('js/components/media-player.js', '  const floatingPlayer = pictureInPicture(video, {', '  pip.hidden = true; // Native floating video is not part of this Android build.\n  const floatingPlayer = pictureInPicture(video, {'),
        ('js/components/media-player.js', '      text: t("player.openSource"),', '      text: t("player.openSource"), hidden: true,'),
    ]
    for relative, old, replacement in changes:
        patch(destination, relative, old, replacement)
    write_text(destination / 'js/components/download-button.js', '''import { button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
export function downloadButton(title, navigate) {
  return button(icon("check"), () => navigate("downloads"), "icon-button", {"aria-label": t("library.offline")});
}
''')
    downloads_path = destination / 'js/pages/downloads.js'
    downloads = read_text(downloads_path)
    write_text(downloads_path, downloads.replace('title.uploaded && title.localAsset?.startsWith("blob:")', 'title.uploaded'))
    patch(destination, 'js/pages/downloads.js', 'const estimate = await navigator.storage?.estimate?.();', 'const estimate = null;\n    storage.textContent = t("library.offline");')
    mobile_copy = {
        'es': ['Tus películas y capítulos guardados en el teléfono.', 'Los videos se leen desde la carpeta seleccionada, sin crear otra copia ni necesitar la computadora.'],
        'en': ['Your films and episodes saved on this phone.', 'Videos are read from the selected folder without another copy or a computer.'],
        'it': ['I tuoi film ed episodi salvati sul telefono.', "I video vengono letti dalla cartella selezionata, senza creare un'altra copia e senza bisogno del computer."],
        'ar': ['أفلامك وحلقاتك المحفوظة على هذا الهاتف.', 'تُقرأ الفيديوهات من المجلد المحدد دون إنشاء نسخة إضافية أو الحاجة إلى الكمبيوتر.'],
    }
    for language, texts in mobile_copy.items():
        file = destination / f'locales/{language}.js'
        text = read_text(file)
        for index, key in enumerate(['downloads.subtitle', 'downloads.device']):
            pattern = re.compile(r'"' + re.escape(key) + r'"\s*:\s*"(?:[^"\\]|\\.)*"')
            if not pattern.search(text):
                raise ValueError(f'Mobile copy adapter needs updating: {language}/{key}')
            replacement = json.dumps(key, ensure_ascii=False) + ': ' + json.dumps(texts[index], ensure_ascii=False)
            text = pattern.sub(lambda _match: replacement, text, count=1)
        write_text(file, text)
    home_path = destination / 'js/pages/home.js'
    home = read_text(home_path).replace('\r\n', '\n')
    hero_start = home.find('  if (route === "home") {')
    hero_end = home.find('  const page = el("div", {', max(hero_start, 0))
    if hero_start < 0 or hero_end < hero_start:
        raise ValueError('Mobile hero adapter needs updating')
    write_text(home_path, 'import { mobileHero } from "../components/mobile-hero.js";\n'
               + home[:hero_start] + '  if (route === "home") mobileHero(root, catalog[0], navigate);\n' + home[hero_end:])
    shutil.copyfile(root / 'android-local/web/mobile-hero.js', destination / 'js/components/mobile-hero.js')
    shutil.copyfile(root / 'android-local/web/mobile-connections.js', destination / 'js/pages/connections.js')
    return len(plan)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?', default=str(ROOT / 'android-local/build/assets/www'))
    args = parser.parse_args()
    destination = Path(args.destination).absolute()
    count = prepare_web(ROOT, destination)
    print(f'Android web bundle: {destination}; {count} assets; catalog/videos stay in the selected folder.')


if __name__ == '__main__':
    main()
