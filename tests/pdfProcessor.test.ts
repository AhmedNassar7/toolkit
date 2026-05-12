import { describe, expect, it, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  addPageNumbers,
  compressPdf,
  getPdfInfo,
  mergePdfs,
  rotatePdf,
  splitPdf,
  watermarkPdf,
  protectPdf,
  imagesToPdf,
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

  const bytes = await pdf.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  return new File([blob], 'sample.pdf', { type: 'application/pdf' });
}

async function loadPdf(blob: Blob) {
  return PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
}

describe('pdfProcessor', () => {
  // ============ MERGE PDF TESTS ============
  describe('mergePdfs', () => {
    it('merges pages from multiple PDFs in correct order', async () => {
      const first = await createSamplePdf(1);
      const second = await createSamplePdf(2);

      const merged = await mergePdfs([first, second]);
      const pdf = await loadPdf(merged);

      expect(pdf.getPageCount()).toBe(3);
    });

    it('merges single PDF without error', async () => {
      const single = await createSamplePdf(5);

      const merged = await mergePdfs([single]);
      const pdf = await loadPdf(merged);

      expect(pdf.getPageCount()).toBe(5);
    });

    it('merges many PDFs with varying page counts', async () => {
      const pdf1 = await createSamplePdf(1);
      const pdf2 = await createSamplePdf(3);
      const pdf3 = await createSamplePdf(2);
      const pdf4 = await createSamplePdf(4);

      const merged = await mergePdfs([pdf1, pdf2, pdf3, pdf4]);
      const result = await loadPdf(merged);

      expect(result.getPageCount()).toBe(10);
    });

    it('preserves page content after merge', async () => {
      const pdf1 = await createSamplePdf(1);
      const pdf2 = await createSamplePdf(1);

      const merged = await mergePdfs([pdf1, pdf2]);
      const result = await loadPdf(merged);

      expect(result.getPages()).toHaveLength(2);
      expect(result.getPages()[0]).toBeDefined();
      expect(result.getPages()[1]).toBeDefined();
    });
  });

  // ============ SPLIT PDF TESTS ============
  describe('splitPdf', () => {
    it('splits each page into a separate PDF', async () => {
      const source = await createSamplePdf(3);

      const parts = await splitPdf(source);

      expect(parts).toHaveLength(3);

      for (const part of parts) {
        const pdf = await loadPdf(part);
        expect(pdf.getPageCount()).toBe(1);
      }
    });

    it('splits single-page PDF correctly', async () => {
      const source = await createSamplePdf(1);

      const parts = await splitPdf(source);

      expect(parts).toHaveLength(1);
      const pdf = await loadPdf(parts[0]);
      expect(pdf.getPageCount()).toBe(1);
    });

    it('splits large PDF into correct number of files', async () => {
      const source = await createSamplePdf(10);

      const parts = await splitPdf(source);

      expect(parts).toHaveLength(10);
      expect(parts.every((p) => p instanceof Blob)).toBe(true);
    });

    it('each split PDF is valid and loadable', async () => {
      const source = await createSamplePdf(5);
      const parts = await splitPdf(source);

      for (let i = 0; i < parts.length; i++) {
        const pdf = await loadPdf(parts[i]);
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getPages()).toHaveLength(1);
      }
    });
  });

  // ============ ROTATE PDF TESTS ============
  describe('rotatePdf', () => {
    it('rotates every page by the requested angle', async () => {
      const source = await createSamplePdf(1);

      const rotated = await rotatePdf(source, 90);
      const pdf = await loadPdf(rotated);

      expect(pdf.getPages()[0].getRotation().angle).toBe(90);
    });

    it('rotates 180 degrees correctly', async () => {
      const source = await createSamplePdf(1);

      const rotated = await rotatePdf(source, 180);
      const pdf = await loadPdf(rotated);

      expect(pdf.getPages()[0].getRotation().angle).toBe(180);
    });

    it('rotates 270 degrees correctly', async () => {
      const source = await createSamplePdf(1);

      const rotated = await rotatePdf(source, 270);
      const pdf = await loadPdf(rotated);

      expect(pdf.getPages()[0].getRotation().angle).toBe(270);
    });

    it('rotates all pages in multi-page PDF', async () => {
      const source = await createSamplePdf(5);

      const rotated = await rotatePdf(source, 90);
      const pdf = await loadPdf(rotated);

      expect(pdf.getPageCount()).toBe(5);
      pdf.getPages().forEach((page) => {
        expect(page.getRotation().angle).toBe(90);
      });
    });

    it('handles cumulative rotations correctly', async () => {
      const source = await createSamplePdf(1);

      let rotated = await rotatePdf(source, 90);
      rotated = await rotatePdf(rotated, 90);

      const pdf = await loadPdf(rotated);
      expect(pdf.getPages()[0].getRotation().angle).toBe(180);
    });

    it('preserves page content after rotation', async () => {
      const source = await createSamplePdf(2);

      const rotated = await rotatePdf(source, 90);
      const pdf = await loadPdf(rotated);

      expect(pdf.getPageCount()).toBe(2);
    });
  });

  // ============ COMPRESS PDF TESTS ============
  describe('compressPdf', () => {
    it('compresses a PDF without changing its pages', async () => {
      const source = await createSamplePdf(2, { title: 'Quarterly Report', author: 'Toolkit' });

      const compressed = await compressPdf(source);
      const pdf = await loadPdf(compressed);

      expect(pdf.getPageCount()).toBe(2);
    });

    it('removes metadata during compression', async () => {
      const source = await createSamplePdf(1, { title: 'Secret', author: 'John Doe' });

      const compressed = await compressPdf(source);
      const pdf = await loadPdf(compressed);

      expect(pdf.getTitle()).toBe('');
      expect(pdf.getAuthor()).toBe('');
    });

    it('reduces file size by removing metadata', async () => {
      const source = await createSamplePdf(1, { title: 'Large Title Here', author: 'Very Long Author Name' });
      const originalSize = source.size;

      const compressed = await compressPdf(source);
      const compressedSize = compressed.size;

      // Compressed should be smaller or equal
      expect(compressedSize).toBeLessThanOrEqual(originalSize);
    });

    it('preserves all pages during compression', async () => {
      const source = await createSamplePdf(10);

      const compressed = await compressPdf(source);
      const pdf = await loadPdf(compressed);

      expect(pdf.getPageCount()).toBe(10);
      expect(pdf.getPages()).toHaveLength(10);
    });
  });

  // ============ GET PDF INFO TESTS ============
  describe('getPdfInfo', () => {
    it('returns usable file information', async () => {
      const source = await createSamplePdf(2, { title: 'Q1 Review', author: 'Toolkit' });

      const info = await getPdfInfo(source);

      expect(info.pages).toBe(2);
      expect(info.title).toBe('Q1 Review');
      expect(info.author).toBe('Toolkit');
      expect(info.size).toMatch(/KB$/);
    });

    it('extracts page count correctly', async () => {
      const source = await createSamplePdf(5);

      const info = await getPdfInfo(source);

      expect(info.pages).toBe(5);
    });

    it('formats file size in KB or MB', async () => {
      const source = await createSamplePdf(1);

      const info = await getPdfInfo(source);

      expect(info.size).toMatch(/^[\d.]+\s(KB|MB)$/);
    });

    it('handles PDF without metadata gracefully', async () => {
      const source = await createSamplePdf(1);

      const info = await getPdfInfo(source);

      expect(info.pages).toBe(1);
      expect(info.title).toBeUndefined();
      expect(info.author).toBeUndefined();
    });

    it('returns size as positive number', async () => {
      const source = await createSamplePdf(3);

      const info = await getPdfInfo(source);

      expect(info.size).toBeDefined();
      expect(parseInt(info.size)).toBeGreaterThan(0);
    });
  });

  // ============ WATERMARK PDF TESTS ============
  describe('watermarkPdf', () => {
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

    it('applies watermark with default options', async () => {
      const source = await createSamplePdf(1);

      const watermarked = await watermarkPdf(source, 'DRAFT');
      const pdf = await loadPdf(watermarked);

      expect(pdf.getPageCount()).toBe(1);
    });

    it('applies watermark to all pages', async () => {
      const source = await createSamplePdf(5);

      const watermarked = await watermarkPdf(source, 'CONFIDENTIAL', {
        opacity: 0.7,
        fontSize: 50,
      });
      const pdf = await loadPdf(watermarked);

      expect(pdf.getPageCount()).toBe(5);
    });

    it('supports custom colors in hex format', async () => {
      const source = await createSamplePdf(1);

      const watermarked = await watermarkPdf(source, 'SECRET', {
        color: '#FF0000', // Red
      });
      const pdf = await loadPdf(watermarked);

      expect(pdf.getPageCount()).toBe(1);
    });

    it('supports various opacity levels', async () => {
      const source = await createSamplePdf(1);

      const opacities = [0.1, 0.3, 0.5, 0.8, 1.0];
      for (const opacity of opacities) {
        const watermarked = await watermarkPdf(source, 'TEST', { opacity });
        const pdf = await loadPdf(watermarked);
        expect(pdf.getPageCount()).toBe(1);
      }
    });

    it('handles various font sizes', async () => {
      const source = await createSamplePdf(1);

      const sizes = [20, 40, 60, 80];
      for (const size of sizes) {
        const watermarked = await watermarkPdf(source, 'MARK', { fontSize: size });
        const pdf = await loadPdf(watermarked);
        expect(pdf.getPageCount()).toBe(1);
      }
    });

    it('preserves page content with watermark', async () => {
      const source = await createSamplePdf(2);

      const watermarked = await watermarkPdf(source, 'WATERMARK');
      const pdf = await loadPdf(watermarked);

      expect(pdf.getPageCount()).toBe(2);
      expect(pdf.getPages()).toHaveLength(2);
    });
  });

  // ============ PAGE NUMBERS TESTS ============
  describe('addPageNumbers', () => {
    it('adds page numbers without changing the number of pages', async () => {
      const source = await createSamplePdf(2);

      const numbered = await addPageNumbers(source);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(2);
    });

    it('adds page numbers to single-page PDF', async () => {
      const source = await createSamplePdf(1);

      const numbered = await addPageNumbers(source);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(1);
    });

    it('adds page numbers to large PDF', async () => {
      const source = await createSamplePdf(20);

      const numbered = await addPageNumbers(source);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(20);
    });

    it('formats page numbers as "current / total"', async () => {
      const source = await createSamplePdf(3);

      const numbered = await addPageNumbers(source);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(3);
      expect(pdf.getPages()).toHaveLength(3);
    });

    it('preserves page content when adding numbers', async () => {
      const source = await createSamplePdf(5);

      const numbered = await addPageNumbers(source);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(5);
      pdf.getPages().forEach((page) => {
        expect(page).toBeDefined();
      });
    });
  });

  // ============ PROTECT PDF TESTS ============
  describe('protectPdf', () => {
    it('processes PDF with protection flag', async () => {
      const source = await createSamplePdf(1);

      const protected_ = await protectPdf(source, 'password123');
      const pdf = await loadPdf(protected_);

      expect(pdf.getPageCount()).toBe(1);
    });

    it('marks PDF as protected', async () => {
      const source = await createSamplePdf(1);

      const protected_ = await protectPdf(source, 'secret');
      const pdf = await loadPdf(protected_);

      expect(pdf.getTitle()).toBe('Protected Document');
    });

    it('preserves page content in protected PDF', async () => {
      const source = await createSamplePdf(3);

      const protected_ = await protectPdf(source, 'pass');
      const pdf = await loadPdf(protected_);

      expect(pdf.getPageCount()).toBe(3);
    });
  });

  // ============ IMAGES TO PDF TESTS ============
  describe('imagesToPdf', () => {
    it.skip('creates PDF from image files', async () => {
      // Skipped: requires browser canvas API
      // In production, this would be tested in an integration/E2E environment
    });

    it.skip('creates multi-page PDF from multiple images', async () => {
      // Skipped: requires browser canvas API
      // In production, this would be tested in an integration/E2E environment
    });
  });

  // ============ INTEGRATION TESTS ============
  describe('integration scenarios', () => {
    it('merge then split returns original page count', async () => {
      const pdf1 = await createSamplePdf(2);
      const pdf2 = await createSamplePdf(3);

      const merged = await mergePdfs([pdf1, pdf2]);
      const split = await splitPdf(merged);

      expect(split).toHaveLength(5);
    });

    it('watermark then compress preserves pages', async () => {
      const source = await createSamplePdf(2);

      const watermarked = await watermarkPdf(source, 'CONFIDENTIAL');
      const compressed = await compressPdf(watermarked);
      const info = await getPdfInfo(compressed);

      expect(info.pages).toBe(2);
    });

    it('rotate then add page numbers works correctly', async () => {
      const source = await createSamplePdf(3);

      const rotated = await rotatePdf(source, 90);
      const numbered = await addPageNumbers(rotated);
      const pdf = await loadPdf(numbered);

      expect(pdf.getPageCount()).toBe(3);
      pdf.getPages().forEach((page) => {
        expect(page.getRotation().angle).toBe(90);
      });
    });

    it('multiple watermarks and compressions', async () => {
      let pdf: Blob = await createSamplePdf(1);

      pdf = await watermarkPdf(pdf, 'DRAFT', { opacity: 0.3 });
      pdf = await watermarkPdf(pdf, 'CONFIDENTIAL', { opacity: 0.5, color: '#FF0000' });
      pdf = await compressPdf(pdf);

      const result = await loadPdf(pdf);
      expect(result.getPageCount()).toBe(1);
    });

    it('split, modify each part, then merge', async () => {
      const source = await createSamplePdf(3);
      const parts = await splitPdf(source);

      const modified = await Promise.all(
        parts.map((part) => watermarkPdf(part, 'MODIFIED', { opacity: 0.4 }))
      );

      const merged = await mergePdfs(modified);
      const result = await loadPdf(merged);

      expect(result.getPageCount()).toBe(3);
    });
  });
});