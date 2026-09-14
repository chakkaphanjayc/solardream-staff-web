import { strToU8, zipSync } from "fflate";

import { validateUploadFile, type UploadFileKind } from "../../src/lib/fileValidation";

const OFFICE = {
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", part: "word/document.xml", marker: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", part: "xl/workbook.xml", marker: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", part: "ppt/presentation.xml", marker: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" },
} as const;
type OfficeKind = keyof typeof OFFICE;

function minimalOffice(kind: OfficeKind, extra: Record<string, Uint8Array> = {}) {
  const config = OFFICE[kind];
  return zipSync({
    "[Content_Types].xml": strToU8(`<Types><Override PartName="/${config.part}" ContentType="${config.marker}"/></Types>`),
    "_rels/.rels": strToU8("<Relationships></Relationships>"),
    [config.part]: strToU8("<root></root>"),
    ...extra,
  }, { level: 1 });
}

function uploadFile(bytes: Uint8Array, name: string, type: string) {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new File([copy.buffer], name, { type });
}
function u32(bytes: Uint8Array, offset: number) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }
function setU16(bytes: Uint8Array, offset: number, value: number) { bytes[offset] = value & 255; bytes[offset + 1] = (value >>> 8) & 255; }
function setU32(bytes: Uint8Array, offset: number, value: number) { bytes[offset] = value & 255; bytes[offset + 1] = (value >>> 8) & 255; bytes[offset + 2] = (value >>> 16) & 255; bytes[offset + 3] = (value >>> 24) & 255; }
function findSignature(bytes: Uint8Array, signature: number) { for (let index = 0; index <= bytes.length - 4; index += 1) if (u32(bytes, index) === signature) return index; throw new Error("ZIP fixture signature missing."); }

async function expectRejected(label: string, file: File, allowedKinds: readonly UploadFileKind[]) {
  try { await validateUploadFile({ file, allowedKinds, maxBytes: 30 * 1024 * 1024 }); } catch { return; }
  throw new Error(`Unsafe fixture was accepted: ${label}`);
}

async function main() {
  for (const kind of Object.keys(OFFICE) as OfficeKind[]) {
    const result = await validateUploadFile({ file: uploadFile(minimalOffice(kind), `valid.${kind}`, OFFICE[kind].mime), allowedKinds: [kind], maxBytes: 30 * 1024 * 1024 });
    if (result.kind !== kind || result.sha256.length !== 64) throw new Error(`Valid ${kind} fixture failed.`);
  }
  const mime = OFFICE.docx.mime;
  const malicious: Array<[string, Uint8Array]> = [
    ["embedded HTML", minimalOffice("docx", { "word/evil%2Ehtml": strToU8("<html></html>") })],
    ["MHT altChunk", minimalOffice("docx", { "word/afChunk1.mht": strToU8("MIME-Version: 1.0") })],
    ["SVG media", minimalOffice("docx", { "word/media/image.svg": strToU8("<svg></svg>") })],
    ["JavaScript", minimalOffice("docx", { "word/media/run.js": strToU8("alert(1)") })],
    ["macro", minimalOffice("docx", { "word/vbaProject.bin": strToU8("macro") })],
    ["external relationship", minimalOffice("docx", { "word/_rels/document.xml.rels": strToU8("<Relationships><Relationship TargetMode=\"External\" Target=\"https://example.com\"/></Relationships>") })],
    ["encoded altChunk relationship", minimalOffice("docx", { "word/_rels/document.xml.rels": strToU8("<Relationships><Relationship Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/%61FChunk\" Target=\"chunk%2Emht\"/></Relationships>") })],
    ["data URL", minimalOffice("docx", { "word/_rels/document.xml.rels": strToU8("<Relationships><Relationship Target=\"data:text/html,evil\"/></Relationships>") })],
    ["nested archive", minimalOffice("docx", { "word/nested.zip": zipSync({ file: strToU8("x") }) })],
    ["traversal", minimalOffice("docx", { "../evil.xml": strToU8("x") })],
  ];
  for (const [label, bytes] of malicious) await expectRejected(label, uploadFile(bytes, "unsafe.docx", mime), ["docx"]);

  const encrypted = minimalOffice("docx");
  const encryptedCentral = findSignature(encrypted, 0x02014b50);
  setU16(encrypted, encryptedCentral + 8, 1);
  await expectRejected("encrypted flag", uploadFile(encrypted, "encrypted.docx", mime), ["docx"]);

  const tooMany = minimalOffice("docx");
  const tooManyEocd = findSignature(tooMany, 0x06054b50);
  setU16(tooMany, tooManyEocd + 10, 2_001);
  await expectRejected("entry count metadata", uploadFile(tooMany, "entries.docx", mime), ["docx"]);

  const expanded = minimalOffice("docx");
  const expandedCentral = findSignature(expanded, 0x02014b50);
  setU32(expanded, expandedCentral + 24, 101 * 1024 * 1024);
  await expectRejected("expanded size metadata", uploadFile(expanded, "expanded.docx", mime), ["docx"]);

  const ratio = minimalOffice("docx");
  const ratioCentral = findSignature(ratio, 0x02014b50);
  setU32(ratio, ratioCentral + 20, 1);
  setU32(ratio, ratioCentral + 24, 1_000);
  await expectRejected("compression ratio metadata", uploadFile(ratio, "ratio.docx", mime), ["docx"]);

  await expectRejected("MIME spoof", uploadFile(strToU8("%PDF-1.7\n"), "spoof.docx", mime), ["docx", "pdf"]);
  await expectRejected("extension spoof", uploadFile(minimalOffice("docx"), "spoof.pdf", "application/pdf"), ["docx", "pdf"]);
  await expectRejected("TXT NUL", uploadFile(new Uint8Array([65, 0, 66]), "nul.txt", "text/plain"), ["txt"]);
  await expectRejected("TXT script", uploadFile(strToU8("<script>alert(1)</script>"), "script.txt", "text/plain"), ["txt"]);
  const text = await validateUploadFile({ file: uploadFile(strToU8("Safe UTF-8 ไทย"), "safe.txt", "text/plain"), allowedKinds: ["txt"], maxBytes: 2 * 1024 * 1024 });
  if (text.kind !== "txt") throw new Error("Valid TXT fixture failed.");
  process.stdout.write("Strict upload validation fixtures passed.\n");
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Upload validation fixture failure."}\n`); process.exitCode = 1; });
