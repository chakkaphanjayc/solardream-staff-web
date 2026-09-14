"use client";

export type CsvRow = Record<string, string>;

const DEFAULT_MAX_CSV_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CSV_ROWS = 5000;
const FORMULA_PREFIX_PATTERN = /^[\s\t\r\n]*[=+\-@]/;

function serializeCsvValue(value: unknown) {
  const rawText = value === null || value === undefined ? "" : String(value);
  const text = FORMULA_PREFIX_PATTERN.test(rawText) ? `'${rawText}` : rawText;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.map(serializeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => serializeCsvValue(row[header])).join(",")),
  ];
  return lines.join("\r\n");
}

export function parseCsv(text: string, maxRows = DEFAULT_MAX_CSV_ROWS): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      if (rows.length > maxRows + 1) {
        throw new Error(`CSV files are limited to ${maxRows.toLocaleString("en-US")} rows.`);
      }
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  if (rows.length > maxRows + 1) {
    throw new Error(`CSV files are limited to ${maxRows.toLocaleString("en-US")} rows.`);
  }

  const nonEmptyRows = rows.filter((cells) => cells.some((cell) => cell.trim()));
  const [headers = [], ...body] = nonEmptyRows;
  return body.map((cells) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      const key = header.trim();
      if (key) record[key] = cells[index] ?? "";
    });
    return record;
  });
}

export async function readCsvRows(file: File, options?: {
  maxBytes?: number;
  maxRows?: number;
}): Promise<CsvRow[]> {
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    throw new Error("Only CSV import files are supported.");
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_CSV_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`CSV files must be smaller than ${Math.floor(maxBytes / 1024 / 1024)}MB.`);
  }

  return parseCsv(await file.text(), options?.maxRows ?? DEFAULT_MAX_CSV_ROWS);
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
