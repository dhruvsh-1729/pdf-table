import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    // TS in some Next versions doesn’t have this typed yet, but Vercel/Next will use it.
    outputFileTracingIncludes: {
      // 👇 change this to your real API file path (no extension)
      "pages/api/records/extracted-text": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    },
  } as any,
};

export default nextConfig;
