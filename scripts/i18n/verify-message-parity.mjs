import { readFile } from "node:fs/promises";

const files = ["messages/en.json", "messages/th.json"];
const [en, th] = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8"))));

function collectKeys(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => collectKeys(child, prefix ? `${prefix}.${key}` : key));
}

const enKeys = new Set(collectKeys(en));
const thKeys = new Set(collectKeys(th));
const missingInThai = [...enKeys].filter((key) => !thKeys.has(key));
const missingInEnglish = [...thKeys].filter((key) => !enKeys.has(key));

if (missingInThai.length || missingInEnglish.length) {
  if (missingInThai.length) console.error(`Missing Thai keys:\n${missingInThai.join("\n")}`);
  if (missingInEnglish.length) console.error(`Missing English keys:\n${missingInEnglish.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Message catalogs are aligned (${enKeys.size} leaf keys).`);
}
