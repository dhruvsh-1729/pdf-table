import fs from "fs";
import { PDFDocument } from "pdf-lib";
import PDFKit from "pdfkit";
import puppeteer from "puppeteer";

async function renderPDFPageToImage(pdfPath, pageNum, quality = 0.6) {
  // Use Puppeteer to render the specific PDF page as an image using PDF.js
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const pdfData = fs.readFileSync(pdfPath);

  // Serve a minimal HTML that loads PDF.js and renders the desired page
  const html = `
    <html>
      <body style="margin:0">
        <canvas id="pdf-canvas"></canvas>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
        <script>
          const pdfData = atob("${pdfData.toString("base64")}");
          const uint8Array = new Uint8Array(pdfData.length);
          for (let i = 0; i < pdfData.length; i++) {
            uint8Array[i] = pdfData.charCodeAt(i);
          }
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          pdfjsLib.getDocument(uint8Array).promise.then(function(pdf) {
            pdf.getPage(${pageNum}).then(function(page) {
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.getElementById('pdf-canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(() => {
                window.renderDone = true;
              });
            });
          });
        </script>
      </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: "domcontentloaded" });
  // Wait for PDF.js to finish rendering
  await page.waitForFunction("window.renderDone === true");

  // Get canvas size for screenshot
  const clip = await page.evaluate(() => {
    const canvas = document.getElementById("pdf-canvas");
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  });

  // Screenshot the canvas region
  const screenshot = await page.screenshot({
    clip,
    type: "jpeg",
    quality: Math.round(quality * 100),
  });

  await browser.close();
  return screenshot;
}

async function compressPDF(inputPath, outputPath, quality = 0.6) {
  // Read original PDF
  const originalBytes = fs.readFileSync(inputPath);
  const originalSizeMB = originalBytes.length / (1024 * 1024);
  console.log(`Original PDF size: ${originalSizeMB.toFixed(2)} MB`);

  // Extract page count using pdf-lib
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPages().length;

  // Create a new PDF using PDFKit
  const doc = new PDFKit({ autoFirstPage: false });
  const output = fs.createWriteStream(outputPath);
  doc.pipe(output);

  // For each page, render as image and insert into new PDF
  for (let i = 0; i < pageCount; i++) {
    const imgBuffer = await renderPDFPageToImage(inputPath, i + 1, quality);

    // Use PDFKit to add a page with the image
    const image = doc.openImage(imgBuffer);
    doc.addPage({ size: [image.width, image.height] });
    doc.image(imgBuffer, 0, 0, { width: image.width, height: image.height });
    console.log(`Processed page ${i + 1} of ${pageCount}`);
  }

  doc.end();

  await new Promise((res) => output.on("finish", res));
  const newSize = fs.statSync(outputPath).size;
  console.log(`Compressed PDF size: ${(newSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Compressed file saved to: ${outputPath}`);
}

// Usage example
(async () => {
  const inputFile = "input.pdf"; // <-- your input file
  const outputFile = "compressed.pdf"; // <-- your output file
  await compressPDF(inputFile, outputFile, 0.9); // quality: 0.1~1.0 (lower = more compression)
})();
