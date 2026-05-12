import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  addPageNumbers,
  compressPdf,
  getPdfInfo,
  mergePdfs,
  rotatePdf,
  splitPdf,
  watermarkPdf,
} from '../src/utils/pdfProcessor';

async function createSamplePdf(pageCount: number, metadata?: { title?: string; author?: string }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([400, 400]);
    page.drawText(`Page ${pageIndex + 1}`, {
      x: 32,
      y: 360,
      size: 18,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  if (metadata?.title) {
    pdf.setTitle(metadata.title);
  }

  if (metadata?.author) {
    pdf.setAuthor(metadata.author);
  }

  return new File([await pdf.save()], 'sample.pdf', { type: 'application/pdf' });
}

async function loadPdf(blob: Blob) {
  return PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
}

describe('pdfProcessor', () => {
  it('merges pages from multiple PDFs in order', async () => {
    const first = await createSamplePdf(1);
    const second = await createSamplePdf(2);

    const merged = await mergePdfs([first, second]);
    const pdf = await loadPdf(merged);

    expect(pdf.getPageCount()).toBe(3);
  });

  it('splits each page into a separate PDF', async () => {
    const source = await createSamplePdf(3);

    const parts = await splitPdf(source);

    expect(parts).toHaveLength(3);

    for (const part of parts) {
      const pdf = await loadPdf(part);
      expect(pdf.getPageCount()).toBe(1);
    }
  });

  it('rotates every page by the requested angle', async () => {
    const source = await createSamplePdf(1);

    const rotated = await rotatePdf(source, 90);
    const pdf = await loadPdf(rotated);

    expect(pdf.getPages()[0].getRotation().angle).toBe(90);
  });

  it('compresses a PDF without changing its pages', async () => {
    const source = await createSamplePdf(2, { title: 'Quarterly Report', author: 'Toolkit' });

    const compressed = await compressPdf(source);
    const pdf = await loadPdf(compressed);

    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe('');
    expect(pdf.getAuthor()).toBe('');
  });

  it('returns usable file information', async () => {
    const source = await createSamplePdf(2, { title: 'Q1 Review', author: 'Toolkit' });

    const info = await getPdfInfo(source);

    expect(info.pages).toBe(2);
    expect(info.title).toBe('Q1 Review');
    expect(info.author).toBe('Toolkit');
    expect(info.size).toMatch(/KB$/);
  });

  it('adds a watermark with custom styling', async () => {
    const source = await createSamplePdf(1);

    const watermarked = await watermarkPdf(source, 'CONFIDENTIAL', {
      opacity: 0.5,
      fontSize: 42,
      color: '#112233',
    });
    const pdf = await loadPdf(watermarked);

    expect(pdf.getPageCount()).toBe(1);
  });

  it('adds page numbers without changing the number of pages', async () => {
    const source = await createSamplePdf(2);

    const numbered = await addPageNumbers(source);
    const pdf = await loadPdf(numbered);

    expect(pdf.getPageCount()).toBe(2);
  });
});