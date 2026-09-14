import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const roots = [join(root, "src/app"), join(root, "src/components")];
const ignored = new Set(["node_modules", ".next", "ui"]);
const textPattern = />\s*([A-Za-z][^<{\n]{2,})\s*</g;

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : files(path);
    return /\.(tsx|jsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const candidates = (await Promise.all(roots.map(files))).flat();
const findings = new Map();

for (const file of candidates) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(textPattern)) {
    const line = source.slice(0, match.index).split("\n").length;
    const filePath = relative(root, file);
    const entries = findings.get(filePath) ?? [];
    entries.push({ line, text: match[1].trim() });
    findings.set(filePath, entries);
  }
}

if (findings.size === 0) {
  console.log("No obvious untranslated JSX text found in components without next-intl.");
} else {
  const groups = [...findings.entries()].sort(([, left], [, right]) => right.length - left.length);
  console.log(`Found ${groups.reduce((count, [, entries]) => count + entries.length, 0)} candidate strings in ${groups.length} files.\n`);
  for (const [file, entries] of groups) {
    console.log(`${file} (${entries.length})`);
    for (const entry of entries) console.log(`  ${entry.line}: ${entry.text}`);
  }
  process.exitCode = 1;
}
