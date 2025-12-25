import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    outputFileTracingIncludes: {
      // ✅ use the ROUTE path (not "pages/api/...")
      "/api/records/extracted-text": [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",

        // include tesseract worker + all core assets (wasm/js)
        "./node_modules/tesseract.js/dist/worker.min.js",
        "./node_modules/tesseract.js-core/**",
      ],
    },
  } as any, // TS types for your Next version don’t include this key yet
};

export default nextConfig;
