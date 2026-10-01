/**
 * Bakes a subtle, professional SolarDream watermark directly onto an image buffer
 * using Sharp before saving/uploading.
 */
export async function applySolarDreamWatermark(fileBuffer: Buffer): Promise<Buffer> {
  try {
    // Keep Sharp out of the module initialization path. This module is also
    // imported by CRM lead actions, while Sharp is only needed for uploads and
    // is not supported by the Cloudflare Workers runtime.
    const { default: sharp } = await import("sharp");
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 800;

    const fontSizeBottom = Math.max(14, Math.round(width * 0.03));
    const fontSizeDiagonal = Math.max(20, Math.round(width * 0.045));

    const watermarkSvg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .wm-shadow {
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: ${fontSizeBottom}px;
            fill: rgba(0, 0, 0, 0.4);
            letter-spacing: 3px;
            text-anchor: end;
          }
          .wm-text {
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: ${fontSizeBottom}px;
            fill: rgba(255, 255, 255, 0.65);
            letter-spacing: 3px;
            text-anchor: end;
          }
          .wm-diagonal {
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: ${fontSizeDiagonal}px;
            fill: rgba(255, 255, 255, 0.2);
            letter-spacing: 6px;
            text-anchor: middle;
          }
        </style>
        <!-- Center Diagonal Watermark -->
        <g transform="translate(${width / 2}, ${height / 2}) rotate(-25)">
          <text x="0" y="0" class="wm-diagonal">SOLARDREAM OFFICIAL</text>
        </g>
        <!-- Bottom-Right Watermark -->
        <g transform="translate(${width - 20}, ${height - 20})">
          <text x="2" y="2" class="wm-shadow">SOLARDREAM</text>
          <text x="0" y="0" class="wm-text">SOLARDREAM</text>
        </g>
      </svg>
    `;

    return await image
      .composite([
        {
          input: Buffer.from(watermarkSvg),
          top: 0,
          left: 0,
        },
      ])
      .toBuffer();
  } catch (error) {
    console.warn("[Watermark] Failed to apply sharp watermark, proceeding with original buffer:", error);
    return fileBuffer;
  }
}
