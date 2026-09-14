export function normalizeMediaUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";

  const trimmed = rawUrl.trim();
  const markdownMatch = trimmed.match(/^\[[^\]]+\]\((.+)\)$/);
  return markdownMatch?.[1]?.trim() || trimmed;
}

export function extractGoogleDriveFileId(
  rawUrl: string | null | undefined,
): string | null {
  const url = normalizeMediaUrl(rawUrl);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname !== "drive.google.com" &&
      hostname !== "drive.usercontent.google.com" &&
      hostname !== "docs.google.com" &&
      !hostname.endsWith(".googleusercontent.com")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/i,
    /[?&]id=([a-zA-Z0-9_-]{10,})/i,
    /\/d\/([a-zA-Z0-9_-]{10,})/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && isSafeGoogleDriveFileId(match[1])) return match[1];
  }

  return null;
}

export function isSafeGoogleDriveFileId(value: string) {
  return /^[a-zA-Z0-9_-]{10,128}$/.test(value);
}

export function toDirectGoogleDriveDownloadUrl(
  rawUrl: string | null | undefined,
): string {
  const url = normalizeMediaUrl(rawUrl);
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
}

export function toPlayableMediaUrl(rawUrl: string | null | undefined): string {
  const url = normalizeMediaUrl(rawUrl);
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url;
  return `/api/media/video?src=${encodeURIComponent(url)}`;
}

export function isGoogleDriveUrl(rawUrl: string | null | undefined): boolean {
  const url = normalizeMediaUrl(rawUrl);
  return (
    /drive\.google\.com/i.test(url) ||
    /driveusercontent\.google\.com/i.test(url)
  );
}
