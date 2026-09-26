// ops/pipeline/pages.mjs — per-page text for a PDF: embedded text layer first, Tesseract OCR for pages without one.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function pageCount(pdfPath) {
  const { stdout } = await run("pdfinfo", [pdfPath]);
  return Number(stdout.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
}

async function layerText(pdfPath, page) {
  const { stdout } = await run("pdftotext", ["-enc", "UTF-8", "-layout", "-f", String(page), "-l", String(page), pdfPath, "-"], {
    maxBuffer: 16 << 20,
  }).catch(() => ({ stdout: "" }));
  return stdout.replace(/\f/g, "").trim();
}

async function ocrText(pdfPath, page, langs, dir) {
  const prefix = path.join(dir, `p${page}`);
  await run("pdftoppm", ["-r", "200", "-gray", "-png", "-singlefile", "-f", String(page), "-l", String(page), pdfPath, prefix], {
    timeout: 120_000,
  });
  const { stdout } = await run("tesseract", [`${prefix}.png`, "-", "-l", langs, "--psm", "3"], {
    env: { ...process.env, OMP_THREAD_LIMIT: "1" },
    maxBuffer: 16 << 20,
    timeout: 180_000,
  });
  return stdout.trim();
}

const letters = (t) => (t.match(/[\p{L}]/gu) ?? []).length;

/**
 * Returns [{ page, text, source }] for every page. `langs` is a Tesseract language string, e.g. "eng" or "eng+hin".
 * A page whose text layer has fewer than `minLetters` letters is OCR'd.
 */
export async function extractPages(pdfPath, { langs = "eng", minLetters = 80, concurrency = 4 } = {}) {
  const n = await pageCount(pdfPath);
  const dir = await mkdtemp(path.join(tmpdir(), "pages-"));
  const out = new Array(n);
  let next = 1;
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, n) }, async () => {
        while (next <= n) {
          const page = next++;
          let text = await layerText(pdfPath, page);
          let source = "pdf_text_layer";
          if (letters(text) < minLetters) {
            const ocr = await ocrText(pdfPath, page, langs, dir).catch(() => "");
            if (letters(ocr) > letters(text)) {
              text = ocr;
              source = "ocr_tesseract";
            }
          }
          out[page - 1] = { page, text, source };
        }
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return out;
}

export { readFile };
