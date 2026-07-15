import { PDFDocument, degrees, rgb } from 'pdf-lib-with-encrypt';
import { saveAs } from 'file-saver';

// Sanitize text for WinAnsi compatibility
function sanitizeText(text: string): string {
  const replacements: Record<string, string> = {
    '\u2192': '->',      // →
    '\u2190': '<-',      // ←
    '\u2022': '*',       // •
    '\u2013': '-',       // –
    '\u2014': '-',       // —
    '\u201C': '"',       // "
    '\u201D': '"',       // "
    '\u2018': "'",       // '
    '\u2019': "'",       // '
    '\u2026': '...',     // …
    '\u00A9': '(c)',     // ©
    '\u00AE': '(R)',     // ®
    '\u2122': '(TM)',    // ™
    '\u20AC': 'EUR',     // €
  };

  let result = text;
  for (const [char, replacement] of Object.entries(replacements)) {
    result = result.split(char).join(replacement);
  }
  // Replace remaining non-ASCII with ?
  result = result.replace(/[^\x20-\x7E\n\r\t]/g, '?');
  return result;
}

export async function compressPdf(file: File | Blob): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Remove metadata to reduce size
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function repairPdf(file: File | Blob): Promise<Blob> {
  // Leniently re-parse the document (tolerating malformed objects/xref tables)
  // and re-save it with a freshly rebuilt structure. This is the same technique
  // most "PDF repair" tools use for recovering non-corrupt-at-the-byte-level PDFs.
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: true,
  });
  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function cropPdf(
  file: File | Blob,
  margins: { top: number; bottom: number; left: number; right: number }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { x, y, width, height } = page.getCropBox();
    const newX = x + margins.left;
    const newY = y + margins.bottom;
    const newWidth = Math.max(1, width - margins.left - margins.right);
    const newHeight = Math.max(1, height - margins.top - margins.bottom);
    page.setCropBox(newX, newY, newWidth, newHeight);
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function organizePdf(
  file: File | Blob,
  pageOrder: number[]
): Promise<Blob> {
  // pageOrder is a 0-indexed list of source page indices in the desired output
  // order; omitting an index deletes that page, and an index may not repeat
  // in a way that would duplicate content beyond what the caller intends.
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const copiedPages = await newDoc.copyPages(srcDoc, pageOrder);
  copiedPages.forEach((page) => newDoc.addPage(page));

  const bytes = await newDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function mergePdfs(files: (File | Blob)[]): Promise<Blob> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }

  const bytes = await mergedPdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function splitPdf(file: File | Blob): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const blobs: Blob[] = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(page);
    const bytes = await newPdf.save();
    blobs.push(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  }

  return blobs;
}

export async function rotatePdf(file: File | Blob, rotationDegrees: number): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    page.setRotation(degrees((page.getRotation().angle + rotationDegrees) % 360));
  });
  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function watermarkPdf(
  file: File | Blob,
  text: string,
  options?: { opacity?: number; fontSize?: number; color?: string }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont('Helvetica');
  const opacity = options?.opacity ?? 0.3;
  const fontSize = options?.fontSize ?? 50;
  const color = parseHexColor(options?.color);
  const sanitizedText = sanitizeText(text);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(sanitizedText, fontSize);

    page.drawText(sanitizedText, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      opacity,
      color,
      rotate: degrees(-45),
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function parseHexColor(color?: string) {
  if (!color) {
    return undefined;
  }

  const normalized = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return undefined;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  return rgb(red, green, blue);
}

export async function addPageNumbers(file: File | Blob): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont('Helvetica');
  const totalPages = pages.length;

  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = `${i + 1} / ${totalPages}`;
    const textWidth = font.widthOfTextAtSize(text, 12);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: 30,
      size: 12,
      font,
    });
  });

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function protectPdf(file: File | Blob, password: string): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  await pdfDoc.encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: { printing: 'highResolution' },
  });
  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function unlockPdf(file: File | Blob, password: string): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(arrayBuffer, { password });
  } catch {
    throw new Error('Incorrect password, or the file is not a supported encrypted PDF.');
  }
  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export type ImageFormat = 'jpeg' | 'png' | 'webp';

const IMAGE_FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function pdfToImages(
  file: File | Blob,
  options?: { format?: ImageFormat; quality?: number }
): Promise<Blob[]> {
  const format = options?.format ?? 'jpeg';
  const quality = options?.quality ?? 0.92;
  const mime = IMAGE_FORMAT_MIME[format];

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');

  // Configure pdfjs worker when running in the browser. Must be prefixed
  // with the app's base path (import.meta.env.BASE_URL), not an absolute
  // root path - this app is deployed under /toolkit/, not domain root.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    // JPEG has no alpha channel; paint white first so pages with
    // transparent regions don't render as black.
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx, viewport } as never).promise;

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), mime, format === 'png' ? undefined : quality);
    });
    blobs.push(blob);
  }

  return blobs;
}

export async function imagesToPdf(files: File[]): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    let image;

    if (file.type === 'image/png') {
      image = await pdfDoc.embedPng(arrayBuffer);
    } else {
      image = await pdfDoc.embedJpg(arrayBuffer);
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function getPdfInfo(file: File | Blob): Promise<{
  pages: number;
  size: string;
  title?: string;
  author?: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const size = file.size;
  const sizeStr =
    size < 1024 * 1024
      ? (size / 1024).toFixed(1) + ' KB'
      : (size / (1024 * 1024)).toFixed(1) + ' MB';

  return {
    pages: pdfDoc.getPageCount(),
    size: sizeStr,
    title: pdfDoc.getTitle() || undefined,
    author: pdfDoc.getAuthor() || undefined,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}

export function downloadBlobsAsZip(blobs: { blob: Blob; name: string }[], zipName: string) {
  import('jszip').then(async (JSZip) => {
    const zip = new JSZip.default();
    for (const { blob, name } of blobs) {
      zip.file(name, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, zipName);
  });
}
