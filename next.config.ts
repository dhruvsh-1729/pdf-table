import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    outputFileTracingIncludes: {
      // key must match your API file path under /pages (no extension)
      "pages/api/records/extracted-text": [
        // pdf.js worker
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",

        // tesseract worker + core (WASM + JS)
        "./node_modules/tesseract.js/dist/worker.min.js",
        "./node_modules/tesseract.js-core/**/*",
      ],
    },
  } as any,
};

export default nextConfig;
