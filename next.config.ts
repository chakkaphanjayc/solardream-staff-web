import { resolve as resolvePath } from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const isDevelopment = process.env.NODE_ENV === "development";
const isCloudflareBuild = process.env.SOLARDREAM_CLOUDFLARE_BUILD === "1";
const projectRoot = process.cwd();
const cloudflareAotManifestPath = "./.cloudflare/elysia-compiled.mjs";
const configuredDeploymentId = process.env.NEXT_DEPLOYMENT_ID?.trim();
const deploymentId = configuredDeploymentId || (isDevelopment ? `staff-local-${process.pid}` : undefined);

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self' https://*.clarity.ms https://c.bing.com",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://challenges.cloudflare.com https://liff.line.me https://unpkg.com https://cdnjs.cloudflare.com https://umami.solar-dream.org https://www.clarity.ms https://*.clarity.ms",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "worker-src 'self' blob: https://unpkg.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https://images.unsplash.com https://placehold.co https://*.supabase.co https://lh3.googleusercontent.com https://drive.google.com https://*.googleusercontent.com https://*.line-scdn.net https://*.clarity.ms https://c.bing.com",
      "connect-src 'self' https://admin.solar-dream.org https://solar-dream.org https://*.supabase.co https://api.line.me https://access.line.me https://liff.line.me https://static.cloudflareinsights.com https://challenges.cloudflare.com wss://*.pusher.com https://*.pusher.com https://unpkg.com https://cdnjs.cloudflare.com https://umami.solar-dream.org https://*.clarity.ms https://c.bing.com",
      "frame-src 'self' https://liff.line.me https://access.line.me https://challenges.cloudflare.com",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), clipboard-write=(self), geolocation=(self), microphone=(), payment=(self), usb=()" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-Accel-Buffering", value: "no" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.93", "192.168.1.119"],
  devIndicators: false,
  productionBrowserSourceMaps: false,
  output: "standalone",
  cacheComponents: true,
  outputFileTracingRoot: projectRoot,
  turbopack:
    isDevelopment
      ? { root: projectRoot }
      : isCloudflareBuild
        ? { resolveAlias: { "elysia/compiled": cloudflareAotManifestPath } }
        : undefined,
  webpack(config) {
    if (isCloudflareBuild) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "elysia/compiled": resolvePath(projectRoot, cloudflareAotManifestPath),
      };
    }
    return config;
  },
  deploymentId,
  outputFileTracingIncludes: {
    "/*": [
      "certificates/**/*.p12",
      "certificates/**/*.pfx",
      "./node_modules/@opentelemetry/api/build/**/*",
    ],
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "pdfjs-dist",
    "googleapis",
    "drizzle-orm",
    "postgres",
    "pdf-lib",
    "bcryptjs",
    "qrcode",
    "sharp",
    "@signpdf/placeholder-pdf-lib",
    "@signpdf/signpdf",
    "@signpdf/signer-p12",
    "node-forge",
    "@qlever-llc/verify-pdf",
  ],
  async headers() {
    return [
      {
        source: "/tech-portal-sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  experimental: {
    webpackBuildWorker: true,
    preloadEntriesOnStart: false,
    turbopackFileSystemCacheForDev: isDevelopment ? false : undefined,
    turbopackSourceMaps: isDevelopment ? false : undefined,
    turbopackInputSourceMaps: isDevelopment ? false : undefined,
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    qualities: [75, 82, 84],
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "delwqrwqkgcrnjypcrlc.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
    ],
  },
};

export default withNextIntl(nextConfig);
