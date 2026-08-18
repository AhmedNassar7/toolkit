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

export async function signPdf(
  file: File | Blob,
  signatureDataUrl: string,
  options?: { target?: SignatureTarget; anchor?: SignatureAnchor; widthPercent?: number }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const imageBytes = dataUrlToBytes(signatureDataUrl);
  const image = signatureDataUrl.startsWith('data:image/png')
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

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
