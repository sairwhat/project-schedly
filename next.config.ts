import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";

// Load .env.secret so secrets stay out of .env.local and git.
loadDotenv({ path: ".env.secret", quiet: true });

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.gstatic.com"
    : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${appUrl} https: http://localhost:3000 https://*.vercel.app https://*.blob.vercel-storage.com https://blob.vercel-storage.com https://openweathermap.org https://*.openweathermap.org`,
  `media-src 'self' data: blob: ${appUrl} https://*.vercel.app https://*.blob.vercel-storage.com https://blob.vercel-storage.com`,
  "font-src 'self'",
  `connect-src 'self' ${appUrl} https://*.vercel.app https://*.blob.vercel-storage.com https://blob.vercel-storage.com https://challenges.cloudflare.com https://*.googleapis.com https://*.gstatic.com https://fcm.googleapis.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' https://www.gstatic.com",
  "manifest-src 'self'",
  ...(isDev ? [] : ["report-uri /api/csp-report"]),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), usb=(), serial=(), bluetooth=(), midi=(), sync-xhr=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  // Turbopack must watch this exact directory — without an explicit root,
  // Next can infer the wrong workspace root and dev mode stops picking up
  // file changes (stale SSR HTML → hydration mismatches after edits).
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        // Service workers must never be cached — otherwise Chrome keeps the
        // old push-handling SW and FCM pushes silently stop rendering.
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    },
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
    {
      source: "/(dashboard)/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex" }],
    },
  ],
};

export default nextConfig;
