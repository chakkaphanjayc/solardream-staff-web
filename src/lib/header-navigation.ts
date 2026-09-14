export type HeaderNavigationChild = Readonly<{
  id: string;
  label: string;
  url: string;
}>;

export type HeaderNavigationItem = Readonly<{
  id: string;
  label: string;
  url: string;
  children?: readonly HeaderNavigationChild[];
}>;

function isSpecialUrl(value: string) {
  return value.startsWith("#") || /^(https?:|mailto:|tel:)/i.test(value);
}

export function resolveHeaderNavigationUrl(
  value: string,
  locale: string,
  forumUrl?: string,
) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "#") return `/${locale}`;
  if (trimmed === "forum" && forumUrl) return forumUrl;
  if (isSpecialUrl(trimmed)) return trimmed;
  if (trimmed === `/${locale}` || trimmed.startsWith(`/${locale}/`)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) return `/${locale}${trimmed}`;

  return `/${locale}/${trimmed.replace(/^\/+/, "")}`;
}

export function flattenHeaderNavigationItems(
  items: readonly HeaderNavigationItem[],
  locale: string,
  forumUrl?: string,
) {
  return items.flatMap((item) => {
    const entries = item.children?.length ? item.children : [item];

    return entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      url:
        entry.id === "forum"
          ? forumUrl || resolveHeaderNavigationUrl(entry.url, locale, forumUrl)
          : resolveHeaderNavigationUrl(entry.url, locale, forumUrl),
    }));
  });
}
