import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

export type UploadFileKind = "pdf" | "jpeg" | "png" | "webp" | "heic" | "docx" | "xlsx" | "pptx" | "txt";

export type ValidatedUploadFile = {
  contentType: string;
  extension: string;
  kind: UploadFileKind;
  safeFileName: string;
  byteSize: number;
  sha256: string;
};

const KIND_CONTENT_TYPES: Record<UploadFileKind, string> = {
  pdf: "application/pdf", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};
const KIND_EXTENSIONS: Record<UploadFileKind, string> = { pdf: "pdf", jpeg: "jpg", png: "png", webp: "webp", heic: "heic", docx: "docx", xlsx: "xlsx", pptx: "pptx", txt: "txt" };
const VALID_EXTENSIONS: Record<UploadFileKind, readonly string[]> = { pdf: ["pdf"], jpeg: ["jpg", "jpeg"], png: ["png"], webp: ["webp"], heic: ["heic", "heif"], docx: ["docx"], xlsx: ["xlsx"], pptx: ["pptx"], txt: ["txt"] };
const VALID_MIMES: Record<UploadFileKind, readonly string[]> = {
  pdf: ["application/pdf"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"], heic: ["image/heic", "image/heif"],
  docx: [KIND_CONTENT_TYPES.docx], xlsx: [KIND_CONTENT_TYPES.xlsx], pptx: [KIND_CONTENT_TYPES.pptx], txt: ["text/plain"],
};
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"]);
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_ZIP_RATIO = 100;
const MAX_TXT_BYTES = 2 * 1024 * 1024;
const OOXML_CONFIG = {
  docx: { part: "word/document.xml", marker: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" },
  xlsx: { part: "xl/workbook.xml", marker: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" },
  pptx: { part: "ppt/presentation.xml", marker: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" },
} as const;
const BANNED_PART = /(^|\/)(vbaProject\.bin|activeX(?:\/|$)|embeddings(?:\/|$)|oleObject|embeddedPackage|package\.bin)/i;
const ARCHIVE_PART = /\.(zip|7z|rar|gz|bz2|xz|tar|jar|docm|xlsm|pptm)$/i;
const ACTIVE_PART = /\.(html?|mht|mhtml|xhtml|svg|js|mjs|cjs|ts|tsx|jsx|xsl|xslt|hta|shtml|php|asp|aspx|jsp|exe|dll|com|ps1|sh|bat|cmd|vbs|wsf)(?:$|[?#])/i;
const ALT_CHUNK_PART = /(^|\/)(?:altchunk|afchunk)[^/]*($|\/)/i;

export function sanitizeUploadFileName(value: string, fallback = "upload") {
  const trimmed = value.trim() || fallback;
  return trimmed.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || fallback;
}

export function getUploadContentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function isUploadContentLengthExceeded(headers: Headers, maxBytes: number) { const value = getUploadContentLength(headers); return value !== null && value > maxBytes; }
export function validateUploadContentLength(headers: Headers, maxBytes: number) {
  const raw = headers.get("content-length");
  if (raw === null) return { ok: false as const, status: 411, error: "Content-Length is required." };
  if (!/^\d+$/.test(raw.trim())) return { ok: false as const, status: 400, error: "Content-Length is invalid." };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return { ok: false as const, status: 400, error: "Content-Length is invalid." };
  if (value > maxBytes) return { ok: false as const, status: 413, error: "Upload request is too large." };
  return { ok: true as const, value };
}

function bytesMatch(bytes: Uint8Array, signature: number[]) { return signature.every((byte, index) => bytes[index] === byte); }
function ascii(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.slice(start, end)); }
function u16(bytes: Uint8Array, offset: number) { return bytes[offset] | (bytes[offset + 1] << 8); }
function u32(bytes: Uint8Array, offset: number) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }

function normalizeContainerText(value: string) {
  if (/[\u0000-\u001F\u007F]/.test(value)) throw new Error("OOXML path contains control characters.");
  let normalized = value.normalize("NFKC");
  for (let pass = 0; pass < 4 && normalized.includes("%"); pass += 1) {
    if (/%(?![0-9a-fA-F]{2})/.test(normalized)) throw new Error("OOXML path has invalid percent encoding.");
    let decoded: string;
    try { decoded = decodeURIComponent(normalized); } catch { throw new Error("OOXML path has invalid percent encoding."); }
    if (decoded === normalized) break;
    normalized = decoded.normalize("NFKC");
  }
  if (/%[0-9a-fA-F]{2}/.test(normalized) || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error("OOXML path encoding is unsafe.");
  return normalized;
}

function decodeXmlText(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
    const point = code.toLowerCase().startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
}

function normalizeXmlText(value: string) {
  const normalized = decodeXmlText(value).normalize("NFKC");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) throw new Error("OOXML XML contains unsafe controls.");
  return normalized;
}

function assertSafePartName(rawName: string) {
  const name = normalizeContainerText(rawName);
  if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").some((part) => part === ".." || part === ".")) throw new Error("Unsafe OOXML path.");
  if (BANNED_PART.test(name) || ARCHIVE_PART.test(name) || ACTIVE_PART.test(name) || ALT_CHUNK_PART.test(name)) throw new Error("Unsafe OOXML embedded content.");
  return name;
}

function assertSafeRelationships(xml: string) {
  const decodedXml = normalizeXmlText(xml);
  if (/data\s*:/i.test(decodedXml)) throw new Error("Embedded data URLs are not accepted.");
  for (const relationship of decodedXml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = relationship[0];
    const attribute = (name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "";
    const type = normalizeContainerText(attribute("Type"));
    const target = normalizeContainerText(attribute("Target"));
    const targetMode = normalizeContainerText(attribute("TargetMode"));
    if (/external/i.test(targetMode) || /(?:^|\/)(?:afchunk|altchunk)(?:$|\/)/i.test(type)) throw new Error("External or altChunk relationships are not accepted.");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || ACTIVE_PART.test(target) || ALT_CHUNK_PART.test(target)) throw new Error("Unsafe OOXML relationship target.");
  }
}

function inspectZip(bytes: Uint8Array) {
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Invalid OOXML container.");
  const count = u16(bytes, eocd + 10);
  const centralOffset = u32(bytes, eocd + 16);
  if (count <= 0 || count > MAX_ZIP_ENTRIES) throw new Error("OOXML archive has too many entries.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const names: string[] = [];
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) throw new Error("Invalid OOXML central directory.");
    const flags = u16(bytes, offset + 8);
    const compressed = u32(bytes, offset + 20);
    const uncompressed = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    if ((flags & 1) !== 0) throw new Error("Encrypted OOXML files are not accepted.");
    if (offset + 46 + nameLength + extraLength + commentLength > bytes.length) throw new Error("Invalid OOXML central directory bounds.");
    const name = assertSafePartName(decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)));
    if (uncompressed > 0 && compressed === 0) throw new Error("Unsafe OOXML compression ratio.");
    if (compressed > 0 && uncompressed / compressed > MAX_ZIP_RATIO) throw new Error("Unsafe OOXML compression ratio.");
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    names.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED || (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_ZIP_RATIO)) throw new Error("OOXML archive is too large after decompression.");
  return names;
}

function validateOoxml(bytes: Uint8Array, kind: keyof typeof OOXML_CONFIG) {
  const names = inspectZip(bytes);
  const required = OOXML_CONFIG[kind];
  if (!names.includes("[Content_Types].xml") || !names.includes("_rels/.rels") || !names.includes(required.part)) throw new Error("OOXML file is missing required parts.");
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error("OOXML file cannot be decoded."); }
  const contentTypes = files["[Content_Types].xml"];
  if (!contentTypes) throw new Error("OOXML content types are missing.");
  const xmlDecoder = new TextDecoder("utf-8", { fatal: true });
  const markerXml = xmlDecoder.decode(contentTypes);
  if (!markerXml.includes(required.marker) || /macroEnabled|vbaProject|application\/vnd\.ms-office/i.test(markerXml)) throw new Error("OOXML type or macro content is unsafe.");
  for (const [name, content] of Object.entries(files)) {
    assertSafePartName(name);
    if (content.length >= 4 && u32(content, 0) === 0x04034b50) throw new Error("Nested archives are not accepted.");
    if (name.endsWith(".rels")) assertSafeRelationships(xmlDecoder.decode(content));
    if (name.endsWith(".xml")) {
      const xml = normalizeXmlText(xmlDecoder.decode(content));
      if (/data\s*:/i.test(xml) || /<\s*(?:script|svg|html|iframe|object|embed)\b/i.test(xml)) throw new Error("Active OOXML XML content is not accepted.");
    }
  }
}

function validateText(bytes: Uint8Array) {
  if (bytes.length > MAX_TXT_BYTES || bytes.includes(0)) throw new Error("Unsafe text file.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("Text file must be valid UTF-8."); }
  if (/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new Error("Text file contains unsafe control characters.");
  if (/<!doctype\s+html|<html\b|<script\b|<svg\b/i.test(text)) throw new Error("Script, HTML, and SVG content is not accepted.");
}

function detectBinaryKind(bytes: Uint8Array): Exclude<UploadFileKind, "docx" | "xlsx" | "pptx" | "txt"> | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "pdf";
  if (bytes.length >= 3 && bytesMatch(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (bytes.length >= 8 && bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12))) return "heic";
  return null;
}

export async function validateUploadFile(params: { file: File; allowedKinds: readonly UploadFileKind[]; fallbackName?: string; maxBytes: number }): Promise<ValidatedUploadFile> {
  const { file, allowedKinds, fallbackName = "upload", maxBytes } = params;
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "" : "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  let kind: UploadFileKind | null = detectBinaryKind(bytes);
  if (!kind && u32(bytes, 0) === 0x04034b50) {
    const candidate = (["docx", "xlsx", "pptx"] as const).find((item) => VALID_EXTENSIONS[item].includes(extension));
    if (candidate) { validateOoxml(bytes, candidate); kind = candidate; }
  }
  if (!kind && extension === "txt" && file.type.toLowerCase() === "text/plain") { validateText(bytes); kind = "txt"; }
  if (!kind || !allowedKinds.includes(kind) || !VALID_EXTENSIONS[kind].includes(extension) || !VALID_MIMES[kind].includes(file.type.toLowerCase())) throw new Error("ประเภทไฟล์ นามสกุล หรือ MIME ไม่ตรงกับเนื้อหาไฟล์");
  if (kind === "txt") validateText(bytes);
  const canonicalExtension = KIND_EXTENSIONS[kind];
  const baseName = sanitizeUploadFileName(file.name.replace(/\.[^.]+$/, ""), fallbackName);
  return { contentType: KIND_CONTENT_TYPES[kind], extension: canonicalExtension, kind, safeFileName: `${baseName}.${canonicalExtension}`, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
