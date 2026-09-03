import {
  PDFDocument,
  LineCapStyle,
  degrees,
  rgb,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from 'pdf-lib-with-encrypt';
import { saveAs } from 'file-saver';
import type { PDFDocumentProxy } from 'pdfjs-dist';

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

export type SignatureAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type SignatureTarget = 'first' | 'last' | 'all';

/**
 * Exact signature placement produced by the interactive page preview. All
 * ratios are 0..1 with a top-left origin (matching an on-screen page render);
 * `signPdf` converts to PDF's bottom-left origin internally.
 */
export interface SignaturePlacement {
  /** 0-based page index the signature is dropped on (ignored when `allPages`). */
  pageIndex: number;
  /** Left edge of the signature as a fraction of page width. */
  xRatio: number;
  /** Top edge of the signature as a fraction of page height. */
  yRatio: number;
  /** Signature width as a fraction of page width. */
  widthRatio: number;
  /** Stamp the same spot on every page (e.g. repeated initials). */
  allPages?: boolean;
}

export async function signPdf(
  file: File | Blob,
  signatureDataUrl: string,
  options?: {
    target?: SignatureTarget;
    anchor?: SignatureAnchor;
    widthPercent?: number;
    placement?: SignaturePlacement;
  }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const imageBytes = dataUrlToBytes(signatureDataUrl);
  const image = signatureDataUrl.startsWith('data:image/png')
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  // Interactive placement path: precise per-page position from the preview.
  if (options?.placement) {
    const { pageIndex, xRatio, yRatio, widthRatio, allPages } = options.placement;
    const aspect = image.height / image.width;
    const placementPages = allPages
      ? pages
      : [pages[pageIndex] ?? pages[pages.length - 1]];

    for (const page of placementPages) {
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const drawWidth = pageWidth * widthRatio;
      const drawHeight = drawWidth * aspect;
      const x = xRatio * pageWidth;
      // Flip from a top-left origin (preview) to PDF's bottom-left origin.
      const y = pageHeight - yRatio * pageHeight - drawHeight;
      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
    }

    const placedBytes = await pdfDoc.save();
    return new Blob([new Uint8Array(placedBytes)], { type: 'application/pdf' });
  }

  const target = options?.target ?? 'last';
  const anchor = options?.anchor ?? 'bottom-right';
  const widthPercent = options?.widthPercent ?? 25;
  const margin = 36; // 0.5in

  const targetPages =
    target === 'all' ? pages : target === 'first' ? [pages[0]] : [pages[pages.length - 1]];

  for (const page of targetPages) {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const drawWidth = pageWidth * (widthPercent / 100);
    const drawHeight = drawWidth * (image.height / image.width);
    const x = anchor.endsWith('right') ? pageWidth - drawWidth - margin : margin;
    const y = anchor.startsWith('bottom') ? margin : pageHeight - drawHeight - margin;

    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export type EditFontFamily = 'Helvetica' | 'HelveticaBold' | 'TimesRoman' | 'Courier';

interface EditElementBase {
  id: string;
  pageIndex: number;
  /** Point coordinates, top-left origin, y increases downward (matches an on-screen page render). */
  x: number;
  y: number;
}

export interface EditTextElement extends EditElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontFamily: EditFontFamily;
}

export interface EditImageElement extends EditElementBase {
  type: 'image';
  dataUrl: string;
  width: number;
  height: number;
}

export interface EditShapeElement extends EditElementBase {
  type: 'rect' | 'ellipse';
  width: number;
  height: number;
  fillColor?: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
}

export interface EditFreehandElement extends EditElementBase {
  type: 'freehand';
  /** Offsets from (x, y), in points, y increases downward. */
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export type EditElement = EditTextElement | EditImageElement | EditShapeElement | EditFreehandElement;

const STANDARD_FONT_NAMES: Record<EditFontFamily, string> = {
  Helvetica: 'Helvetica',
  HelveticaBold: 'Helvetica-Bold',
  TimesRoman: 'Times-Roman',
  Courier: 'Courier',
};

export async function editPdf(file: File | Blob, elements: EditElement[]): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const fonts = new Map<EditFontFamily, Awaited<ReturnType<typeof pdfDoc.embedFont>>>();
  const getFont = async (family: EditFontFamily) => {
    let font = fonts.get(family);
    if (!font) {
      font = await pdfDoc.embedFont(STANDARD_FONT_NAMES[family]);
      fonts.set(family, font);
    }
    return font;
  };

  const images = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();
  const getImage = async (dataUrl: string) => {
    let image = images.get(dataUrl);
    if (!image) {
      const bytes = dataUrlToBytes(dataUrl);
      image = dataUrl.startsWith('data:image/png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      images.set(dataUrl, image);
    }
    return image;
  };

  for (const el of elements) {
    const page = pages[el.pageIndex];
    if (!page) continue;
    const { height: pageHeight } = page.getSize();

    if (el.type === 'text') {
      if (!el.text.trim()) continue;
      const font = await getFont(el.fontFamily);
      page.drawText(sanitizeText(el.text), {
        x: el.x,
        y: pageHeight - el.y - el.fontSize * 0.8,
        size: el.fontSize,
        font,
        lineHeight: el.fontSize * 1.2,
        color: parseHexColor(el.color) ?? rgb(0, 0, 0),
      });
    } else if (el.type === 'image') {
      const image = await getImage(el.dataUrl);
      page.drawImage(image, {
        x: el.x,
        y: pageHeight - el.y - el.height,
        width: el.width,
        height: el.height,
      });
    } else if (el.type === 'rect') {
      page.drawRectangle({
        x: el.x,
        y: pageHeight - el.y - el.height,
        width: el.width,
        height: el.height,
        color: el.fillColor ? parseHexColor(el.fillColor) : undefined,
        borderColor: parseHexColor(el.strokeColor),
        borderWidth: el.strokeWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
    } else if (el.type === 'ellipse') {
      page.drawEllipse({
        x: el.x + el.width / 2,
        y: pageHeight - el.y - el.height / 2,
        xScale: el.width / 2,
        yScale: el.height / 2,
        color: el.fillColor ? parseHexColor(el.fillColor) : undefined,
        borderColor: parseHexColor(el.strokeColor),
        borderWidth: el.strokeWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
    } else if (el.type === 'freehand') {
      if (el.points.length < 2) continue;
      const path = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
      page.drawSvgPath(path, {
        x: el.x,
        y: pageHeight - el.y,
        borderColor: parseHexColor(el.color) ?? rgb(0, 0, 0),
        borderWidth: el.strokeWidth,
        borderLineCap: LineCapStyle.Round,
      });
    }
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

export type ScanPageSize = 'fit' | 'a4' | 'letter';
export type ScanFilter = 'none' | 'grayscale' | 'bw';

const SCAN_PAGE_DIMENSIONS: Record<Exclude<ScanPageSize, 'fit'>, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

/** Small grayscale copy of a canvas for cheap geometry analysis. */
function toAnalysisGray(src: HTMLCanvasElement, maxW = 400): { gray: Float32Array; w: number; h: number } {
  const scale = Math.min(1, maxW / src.width);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }
  return { gray, w, h };
}

/**
 * Estimate page skew (degrees, positive = rotate clockwise to correct) by finding
 * the rotation that packs "ink" pixels into the fewest horizontal rows — the classic
 * projection-profile deskew. Searches a narrow ±8° range on a downscaled image.
 *
 * Exported for unit testing; `gray` is a row-major grayscale buffer (0–255).
 */
export function estimateSkew(gray: Float32Array, w: number, h: number): number {
  let mean = 0;
  for (let i = 0; i < gray.length; i++) mean += gray[i];
  mean /= gray.length;
  const threshold = mean * 0.88;

  const inkX: number[] = [];
  const inkY: number[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (gray[y * w + x] < threshold) {
        inkX.push(x - w / 2);
        inkY.push(y - h / 2);
      }
    }
  }
  if (inkX.length < 50) return 0;

  let bestAngle = 0;
  let bestScore = -1;
  for (let deg = -8; deg <= 8; deg += 0.4) {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const rows = new Float32Array(h + 2);
    for (let i = 0; i < inkX.length; i++) {
      const ry = inkX[i] * sin + inkY[i] * cos + h / 2;
      const r = ry | 0;
      if (r >= 0 && r < h) rows[r]++;
    }
    let score = 0;
    for (let r = 0; r < h; r++) score += rows[r] * rows[r];
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  return Math.abs(bestAngle) < 0.5 ? 0 : bestAngle;
}

/** Rotate a canvas by `deg` (clockwise), fitting the result and filling white. */
function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const out = document.createElement('canvas');
  out.width = Math.ceil(src.width * cos + src.height * sin);
  out.height = Math.ceil(src.width * sin + src.height * cos);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Bounding box of non-white content, computed on a downscaled copy then scaled up. */
function contentBox(src: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const { gray, w, h } = toAnalysisGray(src, 500);
  const colHit = new Uint32Array(w);
  const rowHit = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < 238) {
        colHit[x]++;
        rowHit[y]++;
      }
    }
  }
  const minRun = Math.max(2, Math.round(w * 0.01));
  const minColRun = Math.max(2, Math.round(h * 0.01));
  let x0 = 0;
  while (x0 < w && colHit[x0] < minRun) x0++;
  let x1 = w - 1;
  while (x1 > x0 && colHit[x1] < minRun) x1--;
  let y0 = 0;
  while (y0 < h && rowHit[y0] < minColRun) y0++;
  let y1 = h - 1;
  while (y1 > y0 && rowHit[y1] < minColRun) y1--;

  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: src.width, h: src.height };

  const sx = src.width / w;
  const sy = src.height / h;
  const pad = 0.012;
  const bx = Math.max(0, (x0 - w * pad) * sx);
  const by = Math.max(0, (y0 - h * pad) * sy);
  const bw = Math.min(src.width - bx, (x1 - x0 + 1 + w * pad * 2) * sx);
  const bh = Math.min(src.height - by, (y1 - y0 + 1 + h * pad * 2) * sy);
  return { x: bx, y: by, w: bw, h: bh };
}

export interface Pt {
  x: number;
  y: number;
}

/** Otsu's method: the grayscale (0–255) level that best splits the histogram. */
export function otsuThreshold(gray: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const polyArea = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(a) / 2;
};

/**
 * Best-effort document corner detection: threshold the page, flood-fill the blob
 * under the image centre, and take its extreme points as the quad. Returns the
 * corners [tl, tr, br, bl] in the given (downscaled) coordinate space, or null
 * when it isn't confident enough to be worth a perspective correction.
 */
export function documentQuad(gray: Float32Array, w: number, h: number): [Pt, Pt, Pt, Pt] | null {
  const t = otsuThreshold(gray);
  const centreIdx = ((h >> 1) * w + (w >> 1)) | 0;
  const centreDark = gray[centreIdx] <= t;

  const visited = new Uint8Array(w * h);
  const stack = [centreIdx];
  visited[centreIdx] = 1;
  let count = 0;
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let tl!: Pt;
  let tr!: Pt;
  let br!: Pt;
  let bl!: Pt;

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    count++;
    const s = x + y;
    const d = x - y;
    if (s < minSum) {
      minSum = s;
      tl = { x, y };
    }
    if (s > maxSum) {
      maxSum = s;
      br = { x, y };
    }
    if (d > maxDiff) {
      maxDiff = d;
      tr = { x, y };
    }
    if (d < minDiff) {
      minDiff = d;
      bl = { x, y };
    }
    const nb = [idx - 1, idx + 1, idx - w, idx + w];
    for (let k = 0; k < 4; k++) {
      const n = nb[k];
      if (n < 0 || n >= w * h || visited[n]) continue;
      if (k === 0 && idx % w === 0) continue; // no left neighbour on column 0
      if (k === 1 && n % w === 0) continue; // no right neighbour on the last column
      visited[n] = 1;
      if ((gray[n] <= t) === centreDark) stack.push(n);
    }
  }

  const frac = count / (w * h);
  if (frac < 0.12 || frac > 0.99) return null;

  const quad: [Pt, Pt, Pt, Pt] = [tl, tr, br, bl];
  const area = polyArea(quad);
  if (area / (w * h) < 0.12 || area / (w * h) > 0.985) return null;
  const minEdge = Math.min(dist(tl, tr), dist(tr, br), dist(br, bl), dist(bl, tl));
  if (minEdge < 0.15 * Math.min(w, h)) return null;

  // If every corner already sits in the image corner, there's nothing to correct.
  const near = (p: Pt, cx: number, cy: number) => Math.hypot(p.x - cx, p.y - cy) < 0.03 * (w + h);
  if (near(tl, 0, 0) && near(tr, w, 0) && near(br, w, h) && near(bl, 0, h)) return null;

  return quad;
}

/** Target size for a de-warped quad: the average of its opposite side lengths. */
export function warpTargetSize(quad: [Pt, Pt, Pt, Pt]): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  return {
    width: Math.round((dist(tl, tr) + dist(bl, br)) / 2),
    height: Math.round((dist(tl, bl) + dist(tr, br)) / 2),
  };
}

const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  s: [Pt, Pt, Pt],
  d: [Pt, Pt, Pt]
) {
  const [s0, s1, s2] = s;
  const [d0, d1, d2] = d;
  const denom = (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y);
  if (Math.abs(denom) < 1e-6) return;
  const a = ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) / denom;
  const b = ((s0.x - s2.x) * (d1.x - d2.x) - (s1.x - s2.x) * (d0.x - d2.x)) / denom;
  const c = ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) / denom;
  const e = ((s0.x - s2.x) * (d1.y - d2.y) - (s1.x - s2.x) * (d0.y - d2.y)) / denom;
  const tx = d2.x - a * s2.x - b * s2.y;
  const ty = d2.y - c * s2.x - e * s2.y;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, c, b, e, tx, ty);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Warp the source quad onto a flat `outW`×`outH` rectangle via a triangle mesh. */
function warpQuadToRect(
  src: HTMLCanvasElement,
  quad: [Pt, Pt, Pt, Pt],
  outW: number,
  outH: number
): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad;
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  const G = 24;
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const u0 = i / G;
      const u1 = (i + 1) / G;
      const v0 = j / G;
      const v1 = (j + 1) / G;
      const src00 = lerp(lerp(tl, tr, u0), lerp(bl, br, u0), v0);
      const src10 = lerp(lerp(tl, tr, u1), lerp(bl, br, u1), v0);
      const src01 = lerp(lerp(tl, tr, u0), lerp(bl, br, u0), v1);
      const src11 = lerp(lerp(tl, tr, u1), lerp(bl, br, u1), v1);
      // Nudge dest cells outward ~0.5px so triangle seams don't show.
      const dx0 = u0 * outW - 0.5;
      const dx1 = u1 * outW + 0.5;
      const dy0 = v0 * outH - 0.5;
      const dy1 = v1 * outH + 0.5;
      const d00 = { x: dx0, y: dy0 };
      const d10 = { x: dx1, y: dy0 };
      const d01 = { x: dx0, y: dy1 };
      const d11 = { x: dx1, y: dy1 };
      drawTriangle(ctx, src, [src00, src10, src11], [d00, d10, d11]);
      drawTriangle(ctx, src, [src00, src11, src01], [d00, d11, d01]);
    }
  }
  return out;
}

/** Straighten a captured page: perspective de-warp if a document quad is found,
 *  otherwise a projection-profile deskew, then crop to the content. */
function autoEnhanceCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const ANALYSIS_W = 500;
  const { gray, w, h } = toAnalysisGray(src, ANALYSIS_W);

  const quad = documentQuad(gray, w, h);
  if (quad) {
    const sx = src.width / w;
    const sy = src.height / h;
    const scaled = quad.map((p) => ({ x: p.x * sx, y: p.y * sy })) as [Pt, Pt, Pt, Pt];
    const { width, height } = warpTargetSize(scaled);
    const cap = 2400;
    const k = Math.min(1, cap / Math.max(width, height));
    if (width > 20 && height > 20) {
      return warpQuadToRect(
        src,
        scaled,
        Math.max(1, Math.round(width * k)),
        Math.max(1, Math.round(height * k))
      );
    }
  }

  const skew = estimateSkew(gray, w, h);
  const straight = skew !== 0 ? rotateCanvas(src, -skew) : src;

  const box = contentBox(straight);
  const area = (box.w * box.h) / (straight.width * straight.height);
  if (area > 0.98 || area < 0.15) return straight;

  const out = document.createElement('canvas');
  out.width = Math.round(box.w);
  out.height = Math.round(box.h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(straight, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out;
}

/** Re-encode one captured photo as a JPEG, optionally as a cleaned-up document scan. */
async function normalizeScanImage(
  source: Blob,
  filter: ScanFilter,
  enhance: boolean
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  const bitmap = await createImageBitmap(source);
  let canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the captured image.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  if (enhance) {
    canvas = autoEnhanceCanvas(canvas);
    ctx = canvas.getContext('2d')!;
  }

  if (filter === 'grayscale' || filter === 'bw') {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d')!;
    tctx.filter = 'grayscale(1) contrast(1.15) brightness(1.05)';
    tctx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0);
  }

  if (filter === 'bw') {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] < 135 ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the scanned page.'))),
      'image/jpeg',
      0.9
    )
  );
  return { bytes: await blob.arrayBuffer(), width: canvas.width, height: canvas.height };
}

export interface ScanPageLayout {
  pageWidth: number;
  pageHeight: number;
  drawWidth: number;
  drawHeight: number;
  x: number;
  y: number;
}

/**
 * Work out the page box and where a photo of `imgWidth`×`imgHeight` sits on it.
 * `'fit'` → the page *is* the photo; `'a4'`/`'letter'` → the photo is scaled to
 * fit inside `margin` and centred, and the page turns landscape when the photo is
 * wider than tall. Pure geometry, exported for unit testing.
 */
export function scanPageLayout(
  imgWidth: number,
  imgHeight: number,
  pageSize: ScanPageSize,
  margin = 24
): ScanPageLayout {
  if (pageSize === 'fit') {
    return {
      pageWidth: imgWidth,
      pageHeight: imgHeight,
      drawWidth: imgWidth,
      drawHeight: imgHeight,
      x: 0,
      y: 0,
    };
  }

  const base = SCAN_PAGE_DIMENSIONS[pageSize];
  const landscape = imgWidth > imgHeight;
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;
  const scale = Math.min(
    (pageWidth - margin * 2) / imgWidth,
    (pageHeight - margin * 2) / imgHeight
  );
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  return {
    pageWidth,
    pageHeight,
    drawWidth,
    drawHeight,
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
  };
}

/**
 * Build a PDF from photos captured with the device camera (or picked from disk).
 * `pageSize: 'fit'` makes each page match its photo; 'a4'/'letter' place the photo
 * centred on a fixed page, switching to landscape when the photo is wider than tall.
 * `autoEnhance` straightens each page and crops it to the document before embedding.
 */
export async function scanToPdf(
  images: Blob[],
  options?: { pageSize?: ScanPageSize; filter?: ScanFilter; autoEnhance?: boolean }
): Promise<Blob> {
  if (images.length === 0) {
    throw new Error('Capture or add at least one page before creating a PDF.');
  }

  const pageSize = options?.pageSize ?? 'fit';
  const filter = options?.filter ?? 'none';
  const autoEnhance = options?.autoEnhance ?? true;
  const pdfDoc = await PDFDocument.create();

  for (const source of images) {
    const { bytes, width: imgWidth, height: imgHeight } = await normalizeScanImage(
      source,
      filter,
      autoEnhance
    );
    const image = await pdfDoc.embedJpg(bytes);

    const layout = scanPageLayout(imgWidth, imgHeight, pageSize);
    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(image, {
      x: layout.x,
      y: layout.y,
      width: layout.drawWidth,
      height: layout.drawHeight,
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export interface RedactBox {
  pageIndex: number;
  /** Point coordinates, top-left origin, y increases downward (matches an on-screen page render at scale 1). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Redacts by rasterizing each affected page (rendering it to a canvas, painting
 * solid black over each box, then re-embedding as a flattened image) rather than
 * drawing a box on top of the existing content stream - this actually removes the
 * underlying text/graphics instead of merely covering it, so it can't be recovered
 * by copy-paste or by inspecting the PDF's objects. Pages with no boxes are copied
 * through unchanged, keeping their original vector text and file size.
 */
export async function redactPdf(file: File | Blob, boxes: RedactBox[]): Promise<Blob> {
  if (boxes.length === 0) {
    throw new Error('Add at least one redaction box before saving.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const boxesByPage = new Map<number, RedactBox[]>();
  for (const box of boxes) {
    const list = boxesByPage.get(box.pageIndex) ?? [];
    list.push(box);
    boxesByPage.set(box.pageIndex, list);
  }

  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const pageCount = srcDoc.getPageCount();
  const RENDER_SCALE = 3;

  for (let i = 0; i < pageCount; i++) {
    const pageBoxes = boxesByPage.get(i);
    if (!pageBoxes || pageBoxes.length === 0) {
      const [copied] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(copied);
      continue;
    }

    const pdfjsPage = await pdfjsDoc.getPage(i + 1);
    const unscaled = pdfjsPage.getViewport({ scale: 1 });
    const viewport = pdfjsPage.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfjsPage.render({ canvasContext: ctx, viewport } as never).promise;

    ctx.fillStyle = '#000000';
    for (const box of pageBoxes) {
      ctx.fillRect(box.x * RENDER_SCALE, box.y * RENDER_SCALE, box.width * RENDER_SCALE, box.height * RENDER_SCALE);
    }

    const pngBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const image = await newDoc.embedPng(pngBytes);

    const page = newDoc.addPage([unscaled.width, unscaled.height]);
    page.drawImage(image, { x: 0, y: 0, width: unscaled.width, height: unscaled.height });
  }

  const bytes = await newDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export interface DetectedFormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'unsupported';
  currentValue?: string | boolean;
  options?: string[];
  multiline?: boolean;
}

/** Reads the AcroForm (if any) already embedded in a PDF, for a "fill this form" flow. */
export async function detectPdfFormFields(file: File | Blob): Promise<DetectedFormField[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  return form.getFields().map((field): DetectedFormField => {
    const name = field.getName();
    if (field instanceof PDFTextField) {
      return { name, type: 'text', currentValue: field.getText() ?? '', multiline: field.isMultiline() };
    }
    if (field instanceof PDFCheckBox) {
      return { name, type: 'checkbox', currentValue: field.isChecked() };
    }
    if (field instanceof PDFRadioGroup) {
      return { name, type: 'radio', currentValue: field.getSelected(), options: field.getOptions() };
    }
    if (field instanceof PDFDropdown) {
      return { name, type: 'dropdown', currentValue: field.getSelected()[0], options: field.getOptions() };
    }
    if (field instanceof PDFOptionList) {
      return { name, type: 'optionlist', currentValue: field.getSelected()[0], options: field.getOptions() };
    }
    return { name, type: 'unsupported' };
  });
}

export interface FormFieldValue {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist';
  value: string | boolean;
}

export interface NewFormField {
  pageIndex: number;
  type: 'text' | 'checkbox';
  name: string;
  /** Point coordinates, top-left origin, y increases downward (matches an on-screen page render at scale 1). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fills values into a PDF's existing AcroForm fields and/or adds brand new fields
 * (drawn by the user) to create a fillable PDF. Flattening bakes filled values into
 * the page content and removes the interactive fields, so it's skipped whenever new
 * fields are being added - those need to stay interactive for whoever fills them in.
 */
export async function processPdfForm(
  file: File | Blob,
  options: { fieldValues?: FormFieldValue[]; newFields?: NewFormField[]; flatten?: boolean }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const fv of options.fieldValues ?? []) {
    try {
      if (fv.type === 'text') {
        form.getTextField(fv.name).setText(fv.value ? String(fv.value) : undefined);
      } else if (fv.type === 'checkbox') {
        const checkBox = form.getCheckBox(fv.name);
        if (fv.value) checkBox.check();
        else checkBox.uncheck();
      } else if (fv.type === 'radio') {
        form.getRadioGroup(fv.name).select(String(fv.value));
      } else if (fv.type === 'dropdown') {
        form.getDropdown(fv.name).select(String(fv.value));
      } else if (fv.type === 'optionlist') {
        form.getOptionList(fv.name).select(String(fv.value));
      }
    } catch {
      // Field missing or the wrong type for this document - skip it rather than fail the whole save.
    }
  }

  const newFields = options.newFields ?? [];
  if (newFields.length > 0) {
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont('Helvetica');
    const usedNames = new Set(form.getFields().map((f) => f.getName()));

    for (const nf of newFields) {
      const page = pages[nf.pageIndex];
      if (!page) continue;

      const baseName = nf.name.trim() || 'Field';
      let name = baseName;
      let suffix = 1;
      while (usedNames.has(name)) {
        name = `${baseName}_${suffix++}`;
      }
      usedNames.add(name);

      const { height: pageHeight } = page.getSize();
      const y = pageHeight - nf.y - nf.height;

      if (nf.type === 'checkbox') {
        const checkBox = form.createCheckBox(name);
        checkBox.addToPage(page, { x: nf.x, y, width: nf.width, height: nf.height });
      } else {
        const textField = form.createTextField(name);
        textField.addToPage(page, { x: nf.x, y, width: nf.width, height: nf.height, font });
      }
    }
  }

  if (options.flatten && newFields.length === 0) {
    form.flatten();
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

const COMPARE_THUMB_WIDTH = 220;
const COMPARE_THUMB_HEIGHT = 300;
/** Sum of per-channel RGB deltas (0-765) above which a pixel counts as "different" - tolerates minor anti-aliasing noise. */
const COMPARE_PIXEL_TOLERANCE = 40;
/** Percentage of differing pixels above which a page is flagged "changed" rather than "identical". */
const COMPARE_CHANGED_THRESHOLD = 0.4;

export interface PageComparisonResult {
  pageIndex: number;
  status: 'identical' | 'changed' | 'only-in-a' | 'only-in-b';
  diffPercent?: number;
  thumbA?: string;
  thumbB?: string;
  thumbDiff?: string;
}

export interface CompareResult {
  pages: PageComparisonResult[];
  pageCountA: number;
  pageCountB: number;
}

/** Renders a page "contain"-fit (preserving aspect ratio, letterboxed on white) into a fixed-size canvas, so two differently-sized pages can still be pixel-diffed directly. */
async function renderPageContain(pdf: PDFDocumentProxy, pageNumber: number, boxWidth: number, boxHeight: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(boxWidth / unscaled.width, boxHeight / unscaled.height);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = boxWidth;
  canvas.height = boxHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, boxWidth, boxHeight);
  ctx.translate((boxWidth - viewport.width) / 2, (boxHeight - viewport.height) / 2);
  await page.render({ canvasContext: ctx, viewport } as never).promise;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return canvas;
}

/** Pixel-diffs two same-size canvases, producing a percentage-different score and a highlight canvas (differing pixels in red, matching pixels dimmed). */
function diffCanvases(canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement): { diffPercent: number; diffCanvas: HTMLCanvasElement } {
  const { width, height } = canvasA;
  const dataA = canvasA.getContext('2d')!.getImageData(0, 0, width, height);
  const dataB = canvasB.getContext('2d')!.getImageData(0, 0, width, height);

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d')!;
  const diffImage = diffCtx.createImageData(width, height);

  let diffCount = 0;
  const totalPixels = width * height;

  for (let i = 0; i < dataA.data.length; i += 4) {
    const delta =
      Math.abs(dataA.data[i] - dataB.data[i]) +
      Math.abs(dataA.data[i + 1] - dataB.data[i + 1]) +
      Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);

    if (delta > COMPARE_PIXEL_TOLERANCE) {
      diffCount++;
      diffImage.data[i] = 239;
      diffImage.data[i + 1] = 68;
      diffImage.data[i + 2] = 68;
      diffImage.data[i + 3] = 255;
    } else {
      const gray = (dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2]) / 3;
      const lightened = 255 - (255 - gray) * 0.35;
      diffImage.data[i] = lightened;
      diffImage.data[i + 1] = lightened;
      diffImage.data[i + 2] = lightened;
      diffImage.data[i + 3] = 255;
    }
  }

  diffCtx.putImageData(diffImage, 0, 0);
  return { diffPercent: (diffCount / totalPixels) * 100, diffCanvas };
}

/** Compares two PDFs page-by-page: identical/changed for pages both share, only-in-a/only-in-b for a page-count mismatch. */
export async function comparePdfs(fileA: File | Blob, fileB: File | Blob): Promise<CompareResult> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

  const [bufA, bufB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
  const [pdfA, pdfB] = await Promise.all([
    pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise,
    pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise,
  ]);

  const pageCountA = pdfA.numPages;
  const pageCountB = pdfB.numPages;
  const commonPages = Math.min(pageCountA, pageCountB);
  const pages: PageComparisonResult[] = [];

  for (let i = 0; i < commonPages; i++) {
    const [canvasA, canvasB] = await Promise.all([
      renderPageContain(pdfA, i + 1, COMPARE_THUMB_WIDTH, COMPARE_THUMB_HEIGHT),
      renderPageContain(pdfB, i + 1, COMPARE_THUMB_WIDTH, COMPARE_THUMB_HEIGHT),
    ]);
    const { diffPercent, diffCanvas } = diffCanvases(canvasA, canvasB);
    const status: PageComparisonResult['status'] = diffPercent > COMPARE_CHANGED_THRESHOLD ? 'changed' : 'identical';

    pages.push({
      pageIndex: i,
      status,
      diffPercent,
      thumbA: canvasA.toDataURL('image/png'),
      thumbB: canvasB.toDataURL('image/png'),
      thumbDiff: status === 'changed' ? diffCanvas.toDataURL('image/png') : undefined,
    });
  }

  for (let i = commonPages; i < pageCountA; i++) {
    const canvasA = await renderPageContain(pdfA, i + 1, COMPARE_THUMB_WIDTH, COMPARE_THUMB_HEIGHT);
    pages.push({ pageIndex: i, status: 'only-in-a', thumbA: canvasA.toDataURL('image/png') });
  }
  for (let i = commonPages; i < pageCountB; i++) {
    const canvasB = await renderPageContain(pdfB, i + 1, COMPARE_THUMB_WIDTH, COMPARE_THUMB_HEIGHT);
    pages.push({ pageIndex: i, status: 'only-in-b', thumbB: canvasB.toDataURL('image/png') });
  }

  return { pages, pageCountA, pageCountB };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Builds a self-contained HTML report (thumbnails embedded as data URLs) summarizing a comparePdfs() result. */
export function buildCompareReport(result: CompareResult, nameA: string, nameB: string): Blob {
  const statusLabel: Record<PageComparisonResult['status'], string> = {
    identical: 'Identical',
    changed: 'Changed',
    'only-in-a': `Only in ${escapeHtml(nameA)}`,
    'only-in-b': `Only in ${escapeHtml(nameB)}`,
  };
  const statusColor: Record<PageComparisonResult['status'], string> = {
    identical: '#16a34a',
    changed: '#ea580c',
    'only-in-a': '#2563eb',
    'only-in-b': '#7c3aed',
  };

  const rows = result.pages
    .map((p) => {
      const thumbs = [
        p.thumbA ? `<figure><img src="${p.thumbA}" alt=""><figcaption>${escapeHtml(nameA)}</figcaption></figure>` : '',
        p.thumbDiff ? `<figure><img src="${p.thumbDiff}" alt=""><figcaption>Diff</figcaption></figure>` : '',
        p.thumbB ? `<figure><img src="${p.thumbB}" alt=""><figcaption>${escapeHtml(nameB)}</figcaption></figure>` : '',
      ].join('');
      const detail = p.status === 'changed' && p.diffPercent !== undefined ? ` - ${p.diffPercent.toFixed(1)}% of pixels differ` : '';

      return `
        <section class="page-row">
          <h2>Page ${p.pageIndex + 1} <span class="badge" style="background:${statusColor[p.status]}">${statusLabel[p.status]}${detail}</span></h2>
          <div class="thumbs">${thumbs}</div>
        </section>`;
    })
    .join('');

  const changed = result.pages.filter((p) => p.status === 'changed').length;
  const identical = result.pages.filter((p) => p.status === 'identical').length;
  const onlyInA = result.pages.filter((p) => p.status === 'only-in-a').length;
  const onlyInB = result.pages.filter((p) => p.status === 'only-in-b').length;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PDF Comparison Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .summary { color: #64748b; margin-bottom: 2rem; }
  .summary strong { color: #1e293b; }
  .page-row { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .page-row h2 { font-size: 1rem; margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
  .badge { color: #fff; font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.6rem; border-radius: 999px; }
  .thumbs { display: flex; gap: 1rem; flex-wrap: wrap; }
  .thumbs figure { margin: 0; text-align: center; }
  .thumbs img { max-width: 220px; border: 1px solid #e2e8f0; border-radius: 6px; display: block; }
  .thumbs figcaption { font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem; }
</style>
</head>
<body>
  <h1>PDF Comparison Report</h1>
  <p class="summary">
    <strong>${escapeHtml(nameA)}</strong> (${result.pageCountA} pages) vs <strong>${escapeHtml(nameB)}</strong> (${result.pageCountB} pages)
    &mdash; ${changed} changed, ${identical} identical${onlyInA ? `, ${onlyInA} only in ${escapeHtml(nameA)}` : ''}${onlyInB ? `, ${onlyInB} only in ${escapeHtml(nameB)}` : ''}
  </p>
  ${rows}
</body>
</html>`;

  return new Blob([html], { type: 'text/html' });
}
