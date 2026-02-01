import type { NextConfig } from "next";

const pdfjsTracingFiles = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.js",
  "./node_modules/pdfjs-dist/legacy/build/pdf.min.js",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.js",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js",
  "./node_modules/pdfjs-dist/build/pdf.js",
  "./node_modules/pdfjs-dist/build/pdf.min.js",
  "./node_modules/pdfjs-dist/build/pdf.worker.js",
  "./node_modules/pdfjs-dist/build/pdf.worker.min.js",
];

const tesseractTracingFiles = [
  "./node_modules/tesseract.js/dist/worker.min.js",
  "./node_modules/tesseract.js/src/worker-script/node/index.js",
  "./node_modules/tesseract.js-core/**",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/records/extracted-text": [...pdfjsTracingFiles, ...tesseractTracingFiles],
      "/api/records/ocr": [...pdfjsTracingFiles, ...tesseractTracingFiles],
    },
  } as any,
};

export default nextConfig;
