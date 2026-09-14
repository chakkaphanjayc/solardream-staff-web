import { z } from "zod";

export const LINE_CONTENT_TYPES = [
  "TEXT",
  "IMAGE",
  "RICH_FLEX",
  "CAROUSEL",
  "QUICK_REPLY",
] as const;

export type LineContentType = (typeof LINE_CONTENT_TYPES)[number];

const variableNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/i, "Use letters, numbers, and underscores only.");
const lineHttpUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use an HTTP(S) URL.");
const lineUriActionSchema = z.string().url().max(2048).refine((value) => {
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use a supported LINE URI.");

export const lineVariableSchema = z.object({
  name: variableNameSchema,
  fallback: z.string().max(500),
  description: z.string().max(240).optional(),
});

const lineActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("uri"), uri: lineUriActionSchema }),
  z.object({ type: z.literal("postback"), data: z.string().trim().min(1).max(300), displayText: z.string().trim().max(300).optional() }),
]);

const baseComponentSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
});

const textComponentSchema = baseComponentSchema.extend({
  type: z.literal("text"),
  text: z.string().max(5000),
  weight: z.enum(["regular", "bold"]).default("regular"),
});

const imageComponentSchema = baseComponentSchema.extend({
  type: z.literal("image"),
  url: lineHttpUrlSchema,
  altText: z.string().trim().min(1).max(400),
});

const buttonComponentSchema = baseComponentSchema.extend({
  type: z.literal("button"),
  label: z.string().trim().min(1).max(40),
  action: lineActionSchema,
});

const quickReplyComponentSchema = baseComponentSchema.extend({
  type: z.literal("quickReplies"),
  items: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
    label: z.string().trim().min(1).max(20),
    action: lineActionSchema,
  })).min(1).max(13),
});

const carouselComponentSchema = baseComponentSchema.extend({
  type: z.literal("carousel"),
  columns: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
    title: z.string().trim().min(1).max(60),
    text: z.string().trim().min(1).max(500),
  imageUrl: lineHttpUrlSchema.optional(),
    button: z.object({
      label: z.string().trim().min(1).max(20),
      action: lineActionSchema,
    }).optional(),
  })).min(1).max(12),
});

export const lineContentComponentSchema = z.discriminatedUnion("type", [
  textComponentSchema,
  imageComponentSchema,
  buttonComponentSchema,
  quickReplyComponentSchema,
  carouselComponentSchema,
]);

export const lineContentDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  altText: z.string().trim().max(400).optional(),
  variables: z.array(lineVariableSchema).max(20).default([]),
  components: z.array(lineContentComponentSchema).min(1).max(40),
}).superRefine((document, ctx) => {
  const ids = new Set<string>();
  for (const component of document.components) {
    if (ids.has(component.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["components"], message: `Duplicate component id: ${component.id}` });
    }
    ids.add(component.id);
  }

  const variables = new Set(document.variables.map((variable) => variable.name.toLowerCase()));
  const unresolved = new Set<string>();
  const serialized = JSON.stringify(document.components);
  for (const match of serialized.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)) {
    const name = match[1]?.toLowerCase();
    if (name && !variables.has(name)) unresolved.add(name);
  }
  for (const name of unresolved) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables"], message: `Declare variable ${name} before using it.` });
  }
});

export type LineContentDocument = z.infer<typeof lineContentDocumentSchema>;
export type LineContentComponent = LineContentDocument["components"][number];
export type LineAction = z.infer<typeof lineActionSchema>;

export type LineMessagePayload = {
  type: "text" | "image" | "flex";
  text?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
  altText?: string;
  contents?: Record<string, unknown>;
  quickReply?: { items: Array<Record<string, unknown>> };
};

function interpolate(value: string, variables: Readonly<Record<string, string>>) {
  return value.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_match, name: string) => variables[name.toLowerCase()] ?? "");
}

function compileAction(action: LineAction, variables: Readonly<Record<string, string>>) {
  if (action.type === "message") {
    return { type: "message", text: interpolate(action.text, variables) };
  }
  if (action.type === "uri") return { type: "uri", uri: interpolate(action.uri, variables) };
  return {
    type: "postback",
    data: interpolate(action.data, variables),
    ...(action.displayText ? { displayText: interpolate(action.displayText, variables) } : {}),
  };
}

function toFlexContents(document: LineContentDocument, variables: Readonly<Record<string, string>>) {
  const body: Array<Record<string, unknown>> = [];
  for (const component of document.components) {
    if (component.type === "text") {
      body.push({ type: "text", text: interpolate(component.text, variables), weight: component.weight, wrap: true, size: "sm" });
    } else if (component.type === "image") {
      body.push({ type: "image", url: component.url, size: "full", aspectMode: "cover", aspectRatio: "20:13", action: { type: "uri", uri: component.url } });
    } else if (component.type === "button") {
      body.push({ type: "button", style: "link", action: compileAction(component.action, variables), height: "sm", label: interpolate(component.label, variables) });
    } else if (component.type === "carousel") {
      const columns = component.columns.map((column) => ({
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            ...(column.imageUrl ? [{ type: "image", url: column.imageUrl, size: "full", aspectMode: "cover", aspectRatio: "20:13" }] : []),
            { type: "text", text: interpolate(column.title, variables), weight: "bold", wrap: true, margin: "md" },
            { type: "text", text: interpolate(column.text, variables), wrap: true, size: "sm", margin: "sm" },
          ],
        },
        ...(column.button ? {
          footer: {
            type: "box",
            layout: "vertical",
            contents: [{ type: "button", style: "primary", action: compileAction(column.button.action, variables), label: interpolate(column.button.label, variables) }],
          },
        } : {}),
      }));
      return { type: "carousel", contents: columns };
    }
  }
  return { type: "bubble", body: { type: "box", layout: "vertical", contents: body } };
}

export function resolveLineContentVariables(
  document: LineContentDocument,
  values: Readonly<Record<string, string>> = {},
) {
  const resolved: Record<string, string> = {};
  for (const variable of document.variables) {
    const supplied = values[variable.name] ?? values[variable.name.toLowerCase()];
    resolved[variable.name.toLowerCase()] = supplied?.trim() || variable.fallback;
  }
  return resolved;
}

export function compileLineContentDocument(
  input: LineContentDocument,
  values: Readonly<Record<string, string>> = {},
): LineMessagePayload[] {
  const parsed = lineContentDocumentSchema.parse(input);
  const variables = resolveLineContentVariables(parsed, values);
  const quickReplyComponent = parsed.components.find((component) => component.type === "quickReplies");
  const quickReply = quickReplyComponent && quickReplyComponent.type === "quickReplies"
    ? { items: quickReplyComponent.items.map((item) => ({ action: compileAction(item.action, variables), label: interpolate(item.label, variables) })) }
    : undefined;

  const hasOnlyText = parsed.components.every((component) => component.type === "text" || component.type === "quickReplies");
  if (hasOnlyText) {
    const text = parsed.components
      .filter((component): component is Extract<LineContentComponent, { type: "text" }> => component.type === "text")
      .map((component) => interpolate(component.text, variables))
      .join("\n");
    return [{ type: "text", text: text || " ", ...(quickReply ? { quickReply } : {}) }];
  }

  const image = parsed.components.find((component) => component.type === "image");
  if (image?.type === "image" && parsed.components.length === 1) {
    return [{ type: "image", originalContentUrl: image.url, previewImageUrl: image.url }];
  }

  const flexContents = toFlexContents(parsed, variables);
  return [{ type: "flex", altText: interpolate(parsed.altText || "SolarDream message", variables), contents: flexContents, ...(quickReply ? { quickReply } : {}) }];
}

export const DEFAULT_LINE_CONTENT_DOCUMENT: LineContentDocument = {
  schemaVersion: 1,
  altText: "SolarDream update",
  variables: [{ name: "customer_name", fallback: "there", description: "The recipient name when available." }],
  components: [
    { id: "welcome", type: "text", text: "Hello {{customer_name}}", weight: "bold" },
    { id: "next-step", type: "text", text: "This is an example message. Replace it with approved customer content before publishing.", weight: "regular" },
  ],
};
