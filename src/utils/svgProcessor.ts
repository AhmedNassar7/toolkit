import { PDFDocument } from 'pdf-lib-with-encrypt';

function parseSvgSize(svgText: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;

  if (doc.querySelector('parsererror') || svg.nodeName !== 'svg') {
    throw new Error('The file is not a valid SVG.');
  }

  let width = parseFloat(svg.getAttribute('width') ?? '');
  let height = parseFloat(svg.getAttribute('height') ?? '');

  const viewBox = svg.getAttribute('viewBox');
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      if (!Number.isFinite(width)) width = parts[2];
      if (!Number.isFinite(height)) height = parts[3];
    }
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    width = 800;
    height = 600;
  }

  return { width, height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Failed to render the SVG. It may be invalid or reference external resources.'));
    img.src = url;
  });
}

async function rasterizeSvg(svgText: string, width: number, height: number, scale: number): Promise<HTMLCanvasElement> {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPng(file: File | Blob, scale = 2): Promise<Blob> {
  const svgText = await file.text();
  const { width, height } = parseSvgSize(svgText);
  const canvas = await rasterizeSvg(svgText, width, height, scale);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG from the SVG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function svgToPdf(file: File | Blob, scale = 2): Promise<Blob> {
  const svgText = await file.text();
  const { width, height } = parseSvgSize(svgText);
  const canvas = await rasterizeSvg(svgText, width, height, scale);
  const pngDataUrl = canvas.toDataURL('image/png');
  const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();

  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedPng(pngBytes);
  // Page is sized to the SVG's own dimensions (1px = 1pt, matching this
  // codebase's imagesToPdf convention) so the artwork lands at its original
  // scale and position; the image itself is rendered at a higher pixel
  // density (scale) and downscaled onto the page for crisp output.
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function getImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read the image. It may be corrupted or in an unsupported format.'));
    };
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsDataURL(blob);
  });
}

function wrapRasterInSvg(dataUrl: string, width: number, height: number): Blob {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `  <image x="0" y="0" width="${width}" height="${height}" href="${dataUrl}"/>\n` +
    `</svg>\n`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

// Wraps a raster image (PNG/JPEG) in an SVG container at its native pixel
// size. This preserves the original pixels exactly and keeps them at the
// correct position/scale, but it is not a vector trace - editing the result
// as paths isn't possible, only as an embedded bitmap.
export async function imageToSvg(file: File | Blob): Promise<Blob> {
  const { width, height } = await getImageDimensions(file);
  const dataUrl = await blobToDataUrl(file);
  return wrapRasterInSvg(dataUrl, width, height);
}

export async function pdfToSvgs(file: File | Blob, scale = 2): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const svgBlobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: renderViewport } as never).promise;

    const dataUrl = canvas.toDataURL('image/png');
    svgBlobs.push(wrapRasterInSvg(dataUrl, baseViewport.width, baseViewport.height));
  }

  return svgBlobs;
}
