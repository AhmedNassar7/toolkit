import { PDFDocument } from 'pdf-lib-with-encrypt';
import { createWorker } from 'tesseract.js';

/** Self-hosted Tesseract assets (see public/tesseract/). */
const TESS_BASE = `${import.meta.env.BASE_URL}tesseract/`;
/** Languages with their data vendored in public/tesseract/ — these run offline. */
const OFFLINE_LANGS = new Set(['eng', 'fra', 'deu', 'spa']);
/** Everything else downloads its data on first use. */
const TESSDATA_CDN = 'https://tessdata.projectnaptha.com/4.0.0_fast';
const MAX_PAGES = 50;
const RENDER_SCALE = 2;

/**
 * Tesseract language codes offered by the OCR tool. The first four are vendored
 * and run fully offline; the rest download their recognition data on first use.
 */
export const OCR_LANGUAGES: { code: string; label: string; offline: boolean }[] = [
  { code: 'eng', label: 'English', offline: true },
  { code: 'fra', label: 'French', offline: true },
  { code: 'deu', label: 'German', offline: true },
  { code: 'spa', label: 'Spanish', offline: true },
  { code: 'ita', label: 'Italian', offline: false },
  { code: 'por', label: 'Portuguese', offline: false },
  { code: 'nld', label: 'Dutch', offline: false },
  { code: 'rus', label: 'Russian', offline: false },
  { code: 'ara', label: 'Arabic', offline: false },
  { code: 'chi_sim', label: 'Chinese (Simplified)', offline: false },
  { code: 'jpn', label: 'Japanese', offline: false },
  { code: 'hin', label: 'Hindi', offline: false },
];

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
 * `lang` defaults to English, which is fully offline; any other language's data
 * is fetched from the Tesseract CDN the first time it is used.
 */
export async function ocrDocument(
  file: File | Blob,
  options?: { lang?: string; onProgress?: (percent: number) => void }
): Promise<OcrResult> {
  const lang = options?.lang || 'eng';
  const report = options?.onProgress ?? (() => {});
  const name = file instanceof File ? file.name : '';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);

  report(4);
  const canvases = isPdf ? await pdfToCanvases(file) : [await imageToCanvas(file)];

  // Rendering ends ~12%, OCR runs 12→92% across pages, merge finishes to 100%.
  const OCR_START = 12;
  const OCR_SPAN = 80;
  let pageIndex = 0;

  const worker = await createWorker(lang, undefined, {
    workerPath: `${TESS_BASE}worker.min.js`,
    corePath: `${TESS_BASE}tesseract-core-simd.wasm.js`,
    langPath: OFFLINE_LANGS.has(lang) ? TESS_BASE : TESSDATA_CDN,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        report(OCR_START + ((pageIndex + m.progress) / canvases.length) * OCR_SPAN);
      }
    },
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
      pageIndex += 1;
      report(OCR_START + (pageIndex / canvases.length) * OCR_SPAN);
    }
  } finally {
    await worker.terminate();
  }

  if (pagePdfBytes.length === 0) {
    throw new Error('OCR produced no output for this file.');
  }

  report(94);
  const merged = await PDFDocument.create();
  for (const bytes of pagePdfBytes) {
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const mergedBytes = await merged.save();
  report(100);

  return {
    pdf: new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' }),
    text: pageTexts.join('\n\n'),
    pages: canvases.length,
    words,
  };
}
