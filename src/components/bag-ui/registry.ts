export const BAG_UI_REGISTRY = {
  source: "https://github.com/anelkabag/bag-ui",
  website: "https://bagui.pro",
  primitives: [
    "button",
    "card",
    "badge",
    "input",
    "label",
    "separator",
    "skeleton",
    "dialog",
    "sheet",
    "popover",
    "tooltip",
    "tabs",
    "accordion",
  ],
  adaptedBlocks: [
    "navbar",
    "hero",
    "feature",
    "dashboard",
    "cta",
    "footer",
    "auth",
    "form",
    "sidebar",
    "faq",
    "pricing",
  ],
} as const;

export type BagUiPrimitive = (typeof BAG_UI_REGISTRY.primitives)[number];
export type BagUiBlock = (typeof BAG_UI_REGISTRY.adaptedBlocks)[number];
export type BagUiRegistry = typeof BAG_UI_REGISTRY;
