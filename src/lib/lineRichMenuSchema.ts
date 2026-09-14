import { z } from "zod";

export const RICH_MENU_CANVAS = { width: 2500, height: 1686 } as const;

const boundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const lineUriActionSchema = z.string().url().max(2048).refine((value) => {
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use a supported LINE URI.");

const richMenuActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("uri"), uri: lineUriActionSchema }),
  z.object({ type: z.literal("postback"), data: z.string().trim().min(1).max(300), displayText: z.string().trim().max(300).optional() }),
  z.object({ type: z.literal("richmenu"), richMenuAliasId: z.string().trim().min(1).max(200) }),
]);

export const lineRichMenuAreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
  label: z.string().trim().max(80).optional(),
  bounds: boundsSchema,
  action: richMenuActionSchema,
});

export const lineRichMenuDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(300),
  chatBarText: z.string().trim().min(1).max(14),
  selected: z.boolean().default(true),
  size: z.object({ width: z.literal(RICH_MENU_CANVAS.width), height: z.literal(RICH_MENU_CANVAS.height) }),
  areas: z.array(lineRichMenuAreaSchema).min(1).max(20),
}).superRefine((document, ctx) => {
  const ids = new Set<string>();
  for (const area of document.areas) {
    if (ids.has(area.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["areas"], message: `Duplicate area id: ${area.id}` });
    ids.add(area.id);
    const { x, y, width, height } = area.bounds;
    if (x + width > document.size.width || y + height > document.size.height) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["areas"], message: `Area ${area.id} is outside the LINE canvas.` });
    }
  }
  for (let index = 0; index < document.areas.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < document.areas.length; nextIndex += 1) {
      const left = document.areas[index];
      const right = document.areas[nextIndex];
      if (!left || !right) continue;
      const overlaps = left.bounds.x < right.bounds.x + right.bounds.width && left.bounds.x + left.bounds.width > right.bounds.x && left.bounds.y < right.bounds.y + right.bounds.height && left.bounds.y + left.bounds.height > right.bounds.y;
      if (overlaps) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["areas"], message: `Areas ${left.id} and ${right.id} overlap.` });
    }
  }
});

export type LineRichMenuDocument = z.infer<typeof lineRichMenuDocumentSchema>;
export type LineRichMenuArea = LineRichMenuDocument["areas"][number];
export type LineRichMenuAction = LineRichMenuArea["action"];

export function compileLineRichMenuPayload(document: LineRichMenuDocument) {
  const parsed = lineRichMenuDocumentSchema.parse(document);
  return {
    size: parsed.size,
    selected: parsed.selected,
    name: parsed.name,
    chatBarText: parsed.chatBarText,
    areas: parsed.areas.map(({ bounds, action }) => ({ bounds, action })),
  };
}

export const DEFAULT_LINE_RICH_MENU_DOCUMENT: LineRichMenuDocument = {
  schemaVersion: 1,
  name: "New Rich Menu draft",
  chatBarText: "Menu",
  selected: true,
  size: RICH_MENU_CANVAS,
  areas: [{ id: "area-1", label: "Example", bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: "message", text: "Example action" } }],
};
