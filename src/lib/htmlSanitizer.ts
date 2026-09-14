const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const GLOBAL_ATTRIBUTES = new Set(["class", "title", "aria-label"]);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const URI_ATTRIBUTES = new Set(["href", "src"]);
const REQUIRED_EXTERNAL_LINK_REL = ["noopener", "noreferrer"] as const;
const MAX_HTML_INPUT_LENGTH = 500_000;
const MAX_ATTRIBUTE_VALUE_LENGTH = 16_000;
const MAX_DATA_IMAGE_LENGTH = 160_000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value: string, attribute: string) {
  const trimmed = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!trimmed) return false;

  if (attribute === "src" && trimmed.startsWith("data:image/")) {
    return (
      trimmed.length <= MAX_DATA_IMAGE_LENGTH &&
      /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(trimmed)
    );
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;

  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeRelValue(value: string, requiresExternalProtection: boolean) {
  const tokens = new Set(
    value
      .split(/\s+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .filter((token) => !(requiresExternalProtection && token === "opener"))
      .filter((token) => /^[a-z0-9_-]+$/.test(token)),
  );

  if (requiresExternalProtection) {
    REQUIRED_EXTERNAL_LINK_REL.forEach((token) => tokens.add(token));
  }

  return Array.from(tokens).join(" ");
}

function sanitizeAttributes(tagName: string, rawAttributes: string) {
  const allowedForTag = TAG_ATTRIBUTES[tagName] || new Set<string>();
  const attributes: string[] = [];
  const anchorRelValues: string[] = [];
  let anchorHasTargetBlank = false;
  const attributeRegex = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributeRegex.exec(rawAttributes)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (value.length > MAX_ATTRIBUTE_VALUE_LENGTH) continue;

    if (name.startsWith("on") || name === "style") continue;
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowedForTag.has(name)) continue;
    if (URI_ATTRIBUTES.has(name) && !isSafeUrl(value, name)) continue;

    if (tagName === "a" && name === "target") {
      if (value.trim().toLowerCase() !== "_blank") continue;
      anchorHasTargetBlank = true;
      attributes.push('target="_blank"');
      continue;
    }
    if (tagName === "a" && name === "rel") {
      anchorRelValues.push(value);
      continue;
    }
    if (tagName === "img" && name === "loading" && value !== "lazy" && value !== "eager") continue;

    attributes.push(`${name}="${escapeHtml(value)}"`);
  }

  if (tagName === "a") {
    const rel = sanitizeRelValue(anchorRelValues.join(" "), anchorHasTargetBlank);
    if (rel) {
      attributes.push(`rel="${escapeHtml(rel)}"`);
    }
  }

  if (tagName === "img" && !attributes.some((attribute) => attribute.startsWith("loading="))) {
    attributes.push('loading="lazy"');
  }

  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

export function sanitizeHtml(input: string) {
  if (!input) return "";

  const boundedInput = input.length > MAX_HTML_INPUT_LENGTH
    ? input.slice(0, MAX_HTML_INPUT_LENGTH)
    : input;

  const withoutUnsafeBlocks = boundedInput
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*\/?\s*>/gi, "");

  return withoutUnsafeBlocks.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g, (fullTag, rawTagName: string, rawAttributes: string) => {
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return "";
    if (fullTag.startsWith("</")) return `</${tagName}>`;

    const selfClosing = /\/\s*>$/.test(fullTag) || tagName === "br" || tagName === "hr" || tagName === "img";
    return `<${tagName}${sanitizeAttributes(tagName, rawAttributes)}${selfClosing ? " />" : ">"}`
  });
}
