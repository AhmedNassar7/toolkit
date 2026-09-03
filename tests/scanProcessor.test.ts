import { describe, expect, it } from 'vitest';
import {
  documentQuad,
  estimateSkew,
  otsuThreshold,
  scanPageLayout,
  warpTargetSize,
} from '../src/utils/pdfProcessor';

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };
const MARGIN = 24;

/** Row-major grayscale (0 = ink, 255 = paper) with evenly spaced horizontal
 *  lines, optionally rotated `angleDeg` about the image centre. */
function linedImage(w: number, h: number, angleDeg = 0): Float32Array {
  const g = new Float32Array(w * h).fill(255);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let line = 1; line <= 12; line++) {
    const y0 = (h * line) / 13;
    for (let x = 0; x < w; x++) {
      const dx = x - w / 2;
      const dy = y0 - h / 2;
      const xi = Math.round(dx * cos - dy * sin + w / 2);
      const yi = Math.round(dx * sin + dy * cos + h / 2);
      for (let t = -1; t <= 1; t++) {
        const yy = yi + t;
        if (xi >= 0 && xi < w && yy >= 0 && yy < h) g[yy * w + xi] = 0;
      }
    }
  }
  return g;
}

describe('scanPageLayout', () => {
  it('"fit" makes the page equal the photo', () => {
    const l = scanPageLayout(800, 600, 'fit');
    expect(l).toEqual({
      pageWidth: 800,
      pageHeight: 600,
      drawWidth: 800,
      drawHeight: 600,
      x: 0,
      y: 0,
    });
  });

  it('places a portrait photo on a portrait A4 page within the margins', () => {
    const l = scanPageLayout(1000, 1400, 'a4');
    expect(l.pageWidth).toBeCloseTo(A4.width);
    expect(l.pageHeight).toBeCloseTo(A4.height);
    expect(l.drawWidth).toBeLessThanOrEqual(A4.width - MARGIN * 2 + 0.01);
    expect(l.drawHeight).toBeLessThanOrEqual(A4.height - MARGIN * 2 + 0.01);
    expect(l.x).toBeGreaterThanOrEqual(MARGIN - 0.01);
    expect(l.y).toBeGreaterThanOrEqual(MARGIN - 0.01);
    // aspect ratio preserved
    expect(l.drawWidth / l.drawHeight).toBeCloseTo(1000 / 1400, 3);
  });

  it('turns the page landscape when the photo is wider than tall', () => {
    const l = scanPageLayout(1400, 1000, 'a4');
    expect(l.pageWidth).toBeCloseTo(A4.height);
    expect(l.pageHeight).toBeCloseTo(A4.width);
    expect(l.drawWidth / l.drawHeight).toBeCloseTo(1.4, 3);
  });

  it('supports Letter and keeps the photo centred', () => {
    const l = scanPageLayout(900, 1200, 'letter');
    expect(l.pageWidth).toBeCloseTo(LETTER.width);
    expect(l.pageHeight).toBeCloseTo(LETTER.height);
    expect(l.x * 2 + l.drawWidth).toBeCloseTo(LETTER.width, 3);
    expect(l.y * 2 + l.drawHeight).toBeCloseTo(LETTER.height, 3);
  });

  it('scales a huge photo down to fit', () => {
    const l = scanPageLayout(5000, 7000, 'a4');
    expect(l.drawWidth).toBeLessThanOrEqual(A4.width - MARGIN * 2 + 0.01);
    expect(l.drawHeight).toBeLessThanOrEqual(A4.height - MARGIN * 2 + 0.01);
  });
});

describe('estimateSkew', () => {
  it('returns 0 for a straight page', () => {
    expect(estimateSkew(linedImage(200, 260, 0), 200, 260)).toBe(0);
  });

  it('returns 0 for a blank page', () => {
    const blank = new Float32Array(120 * 120).fill(255);
    expect(estimateSkew(blank, 120, 120)).toBe(0);
  });

  it('recovers a clockwise skew with the correcting sign', () => {
    const angle = estimateSkew(linedImage(220, 280, 4), 220, 280);
    expect(angle).toBeLessThan(-1.5); // corrects a +4° tilt by rotating back
    expect(Math.abs(Math.abs(angle) - 4)).toBeLessThan(2);
  });

  it('recovers a counter-clockwise skew with the correcting sign', () => {
    const angle = estimateSkew(linedImage(220, 280, -5), 220, 280);
    expect(angle).toBeGreaterThan(1.5);
    expect(Math.abs(Math.abs(angle) - 5)).toBeLessThan(2);
  });
});

describe('otsuThreshold', () => {
  it('lands between the two peaks of a bimodal image', () => {
    const g = new Float32Array(2000);
    for (let i = 0; i < g.length; i++) g[i] = i % 2 ? 220 : 30;
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });
});

describe('warpTargetSize', () => {
  it('returns the side lengths of a rectangle unchanged', () => {
    expect(
      warpTargetSize([
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 90 },
        { x: 0, y: 90 },
      ])
    ).toEqual({ width: 120, height: 90 });
  });

  it('averages opposite sides of a trapezoid', () => {
    const size = warpTargetSize([
      { x: 10, y: 0 },
      { x: 90, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(size.width).toBe(90); // (80 + 100) / 2
    expect(size.height).toBeGreaterThanOrEqual(99);
    expect(size.height).toBeLessThanOrEqual(101);
  });
});

/** White page (255) with a filled dark rectangle. */
function pageWithRect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Float32Array {
  const g = new Float32Array(w * h).fill(255);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = 40;
  return g;
}

describe('documentQuad', () => {
  it('finds the corners of an inset document', () => {
    const q = documentQuad(pageWithRect(500, 600, 100, 80, 400, 520), 500, 600);
    expect(q).not.toBeNull();
    const [tl, tr, br, bl] = q!;
    expect(tl.x).toBeLessThan(115);
    expect(tl.y).toBeLessThan(95);
    expect(br.x).toBeGreaterThan(385);
    expect(br.y).toBeGreaterThan(505);
    expect(tr.x).toBeGreaterThan(385);
    expect(bl.y).toBeGreaterThan(505);
  });

  it('returns null when the page already fills the frame', () => {
    expect(documentQuad(pageWithRect(400, 500, 2, 2, 398, 498), 400, 500)).toBeNull();
  });

  it('returns null for a tiny speck', () => {
    expect(documentQuad(pageWithRect(400, 500, 195, 245, 205, 255), 400, 500)).toBeNull();
  });
});
