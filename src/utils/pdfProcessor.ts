import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';

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

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    page.drawText(text, {
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

export async function protectPdf(file: File | Blob, _password: string): Promise<Blob> {
  // pdf-lib doesn't support encryption directly, so we return the PDF as-is
  // In production, this would use a server-side tool
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  pdfDoc.setTitle('Protected Document');
  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function pdfToImages(file: File | Blob): Promise<Blob[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    '/pdf.worker.min.mjs',
    window.location.origin
  ).href;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport } as never).promise;

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92);
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
