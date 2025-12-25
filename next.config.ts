import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/records/extracted-text": [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",

        "./node_modules/tesseract.js/dist/worker.min.js",
        "./node_modules/tesseract.js-core/**",
      ],
    },
  } as any,
};

export default nextConfig;
