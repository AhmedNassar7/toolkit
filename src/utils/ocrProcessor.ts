import { PDFDocument } from 'pdf-lib-with-encrypt';
import { createWorker } from 'tesseract.js';

/** Self-hosted Tesseract assets (see public/tesseract/, vendored at ~11 MB). */
const TESS_BASE = `${import.meta.env.BASE_URL}tesseract/`;
const MAX_PAGES = 50;
const RENDER_SCALE = 2;

export interface OcrResult {
  /** Searchable PDF: the rasterised page image with an invisible text layer. */
  pdf: Blob;
  /** Plain extracted text, pages separated by blank lines. */
  text: string;
  pages: number;
  words: number;
}

async function pdfToCanvases(file: File | Blob): Promise<HTMLCanvasElement[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  if (doc.numPages > MAX_PAGES) {
    throw new Error(
      `This PDF has ${doc.numPages} pages. Split it into files of ${MAX_PAGES} pages or fewer before running OCR.`
    );
  }

  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not render the PDF for OCR.');
    await page.render({ canvasContext: ctx, viewport } as never).promise;
    canvases.push(canvas);
  }
  return canvases;
}

async function imageToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read the image for OCR.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/**
 * Run OCR on a scanned PDF or an image entirely in the browser (Tesseract via
 * WebAssembly), returning both a searchable PDF and the extracted plain text.
 */
export async function ocrDocument(file: File): Promise<OcrResult> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const canvases = isPdf ? await pdfToCanvases(file) : [await imageToCanvas(file)];

  const worker = await createWorker('eng', undefined, {
    workerPath: `${TESS_BASE}worker.min.js`,
    corePath: `${TESS_BASE}tesseract-core-simd.wasm.js`,
    langPath: TESS_BASE,
  });

  const pagePdfBytes: Uint8Array[] = [];
  const pageTexts: string[] = [];
  let words = 0;

  try {
    for (const canvas of canvases) {
      const { data } = await worker.recognize(canvas, {}, { text: true, pdf: true });
      const text = (data.text ?? '').trim();
      pageTexts.push(text);
      words += text.split(/\s+/).filter(Boolean).length;
      if (data.pdf) pagePdfBytes.push(Uint8Array.from(data.pdf));
      // Release the (large) render canvas before moving to the next page.
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }

  if (pagePdfBytes.length === 0) {
    throw new Error('OCR produced no output for this file.');
  }

  const merged = await PDFDocument.create();
  for (const bytes of pagePdfBytes) {
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const mergedBytes = await merged.save();

  return {
    pdf: new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' }),
    text: pageTexts.join('\n\n'),
    pages: canvases.length,
    words,
  };
}
