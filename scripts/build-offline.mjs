import { readdir, writeFile } from "node:fs/promises";
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(`${path}/${entry.name}`)
          : `${path}/${entry.name}`,
      ),
    )
  ).flat();
}
const assets = ["/index.html", "/", "/assets/catalog-sources.json"];
for (const dir of [
  "js",
  "locales",
  "css",
  "vendor",
  "assets/posters",
  "assets/icons",
  "assets/fonts",
  "assets/backgrounds",
  "assets/title-art",
]) {
  const files = await walk(dir);
  assets.push(
    ...files
      .filter(
        (path) =>
          /\.(js|css|woff2|webp|png|jpe?g|svg)$/.test(path) &&
          path !== "assets/backgrounds/sintel.png",
      )
      .map((path) => `/${path}`),
  );
}
await writeFile(
  "assets/offline-manifest.json",
  JSON.stringify(assets, null, 2) + "\n",
);
console.log(
  `Offline manifest: ${assets.length} application assets; videos download only on request.`,
);
