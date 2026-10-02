import { readdir, readFile, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const errors = [];
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesIn(join(dir, entry.name))
        : join(dir, entry.name),
    ),
  );
  return groups.flat();
}
const files = [...(await filesIn("js")), ...(await filesIn("locales"))];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) errors.push(checked.stderr);
  if (/\beval\s*\(|new\s+Function\b|\.innerHTML\s*=/.test(source))
    errors.push(`Unsafe code pattern: ${file}`);
  for (const match of source.matchAll(
    /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g,
  )) {
    try {
      await access(resolve(dirname(file), match[1]));
    } catch {
      errors.push(`Broken import: ${file} → ${match[1]}`);
    }
  }
}
for (const file of await filesIn("css")) {
  if (file.endsWith("tokens.css")) continue;
  if (
    /#[\da-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(
      await readFile(file, "utf8"),
    )
  )
    errors.push(`Color outside tokens: ${file}`);
}
const html = await readFile("index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) errors.push("Duplicate static HTML IDs");
if (!html.includes("width=device-width, initial-scale=1.0"))
  errors.push("Missing viewport");
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^(https?:|data:)/.test(match[1])) continue;
  try {
    await access(match[1]);
  } catch {
    errors.push(`Missing HTML asset: ${match[1]}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: syntax and imports (${files.length} JS modules), local HTML assets, static IDs, viewport, native-code security and centralized CSS colors.`,
  );
