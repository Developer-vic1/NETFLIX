import { readdir, readFile, writeFile } from "node:fs/promises";
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((item) =>
        item.isDirectory()
          ? filesIn(`${directory}/${item.name}`)
          : `${directory}/${item.name}`,
      ),
    )
  ).flat();
}
const files = [
  ...(await Promise.all(["js", "css", "locales"].map(filesIn)))
    .flat()
    .filter((file) => /\.(js|css)$/.test(file)),
  "index.html",
  "sw.js",
];
const counts = await Promise.all(
  files.map(async (file) => {
    const text = await readFile(file, "utf8");
    const lines = text.trimEnd().split(/\r?\n/);
    return {
      file,
      lines: lines.length,
      nonblankLines: lines.filter((line) => line.trim()).length,
    };
  }),
);
const report = {
  definition:
    "Authored application JS, CSS, locale modules, HTML and Service Worker. Excludes vendor libraries, tooling, tests, documentation, generated manifests and media.",
  files: counts.length,
  lines: counts.reduce((sum, item) => sum + item.lines, 0),
  nonblankLines: counts.reduce((sum, item) => sum + item.nonblankLines, 0),
  counts,
};
await writeFile(
  "docs/source-metrics.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    files: report.files,
    lines: report.lines,
    nonblankLines: report.nonblankLines,
  }),
);
