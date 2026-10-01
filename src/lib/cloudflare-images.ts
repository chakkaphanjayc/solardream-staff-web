import { getCloudflareContext } from "@opennextjs/cloudflare";

type ImageInfo = { format?: string; width?: number; height?: number };
type ImageHandle = {
  transform(options: Record<string, unknown>): ImageHandle;
  draw(overlay: ImageHandle, options: Record<string, unknown>): ImageHandle;
  output(options: Record<string, unknown>): Promise<{ response(): Response | Promise<Response> }>;
  info(): Promise<ImageInfo>;
};
type ImagesBinding = { input(source: Uint8Array): ImageHandle; text(content: string, options: Record<string, unknown>): ImageHandle };

function getImagesBinding(): ImagesBinding | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { IMAGES?: ImagesBinding }).IMAGES || null;
  } catch {
    return null;
  }
}

async function responseBytes(response: Response | Promise<Response>) {
  return Buffer.from(await (await response).arrayBuffer());
}

export async function getImageInfo(bytes: Uint8Array): Promise<ImageInfo> {
  const images = getImagesBinding();
  if (images) return images.input(bytes).info();
  const { default: sharp } = await import("sharp");
  return sharp(bytes).metadata();
}

export async function transformImage(
  bytes: Uint8Array,
  options: { width?: number; height?: number; fit?: "cover" | "contain" | "scale-down"; format: "jpeg" | "png" | "webp"; quality?: number },
) {
  const images = getImagesBinding();
  if (images) {
    let image = images.input(bytes);
    if (options.width || options.height || options.fit) {
      image = image.transform({
        ...(options.width ? { width: options.width } : {}),
        ...(options.height ? { height: options.height } : {}),
        ...(options.fit ? { fit: options.fit } : {}),
      });
    }
    const result = await image.output({ format: `image/${options.format}`, quality: options.quality });
    return responseBytes(result.response());
  }

  const { default: sharp } = await import("sharp");
  let image = sharp(bytes);
  if (options.width || options.height || options.fit) image = image.resize(options.width, options.height, { fit: options.fit === "scale-down" ? "inside" : options.fit });
  if (options.format === "jpeg") return image.jpeg({ quality: options.quality ?? 90, progressive: true }).toBuffer();
  if (options.format === "png") return image.png({ compressionLevel: 9 }).toBuffer();
  return image.webp({ quality: options.quality ?? 90 }).toBuffer();
}

export type ImageTextOverlay = { text: string; left: number; top: number; size: number };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function transformImageWithTextOverlays(
  bytes: Uint8Array,
  options: { width: number; height: number; quality?: number; overlays: ImageTextOverlay[] },
) {
  const images = getImagesBinding();
  if (images) {
    let image = images.input(bytes).transform({ width: options.width, height: options.height, fit: "cover" });
    for (const overlay of options.overlays) {
      image = image.draw(images.text(overlay.text, { color: "#ffffff", size: overlay.size }), { left: overlay.left, top: overlay.top });
    }
    const result = await image.output({ format: "image/jpeg", quality: options.quality ?? 90 });
    return responseBytes(result.response());
  }

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">${options.overlays.map((overlay) => `<text x="${overlay.left}" y="${overlay.top + overlay.size}" fill="white" font-family="Arial, sans-serif" font-size="${overlay.size}" font-weight="700">${escapeXml(overlay.text)}</text>`).join("")}</svg>`);
  const { default: sharp } = await import("sharp");
  return sharp(bytes).resize(options.width, options.height, { fit: "cover" }).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: options.quality ?? 90, progressive: true }).toBuffer();
}
