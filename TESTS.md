# Test Suite

This describes the automated test suite for Toolkit's client-side PDF logic.

**Total:** 56 tests across two files  
**Framework:** [Vitest](https://vitest.dev/), running in a Node environment  
**Run:** `npm test` (or `npx vitest run --environment node`)

## What's covered

`tests/pdfProcessor.test.ts` (53 tests) exercises every function in `src/utils/pdfProcessor.ts` against real, generated PDFs — no mocks. Each test loads the actual output back with `pdf-lib` and asserts on its real structure (page count, rotation angle, crop box, encryption, etc.).

| Suite | Tests | What it checks |
|---|---|---|
| `mergePdfs` | 4 | Page order and count across 1–4 source files |
| `splitPdf` | 4 | One output file per page, each independently valid |
| `rotatePdf` | 6 | 90°/180°/270°, multi-page, and cumulative rotation |
| `compressPdf` | 4 | Metadata stripped, page count and content unchanged |
| `getPdfInfo` | 5 | Page count, size formatting, metadata extraction |
| `watermarkPdf` | 8 | Custom text/color/opacity/font size, applied to every page |
| `addPageNumbers` | 5 | "current / total" numbering, page count preserved |
| `protectPdf` | 3 | Genuinely encrypts — rejects no password and the wrong password, opens with the right one |
| `unlockPdf` | 2 | Genuinely decrypts given the correct password; rejects a wrong one |
| `cropPdf` | 3 | Crop box math is exact and safely clamped for oversized margins |
| `repairPdf` | 2 | Lenient reparse + resave preserves page count |
| `organizePdf` | 3 | Reorders pages, drops omitted ones, supports a single-page result |
| `integration scenarios` | 5 | Chained operations (merge→split, watermark→compress, split→modify→merge, etc.) |

`tests/qrCode.test.ts` (3 tests) checks the pure validation logic used by the QR tool: URL-vs-text detection, non-empty input, and accepted image MIME types. It doesn't cover actual scanning/generation, since those need a real `<canvas>` and DOM — that's verified manually in a browser instead.

## Running tests

```bash
npm test                                    # run once
npx vitest run --reporter=verbose           # verbose output
npx vitest --watch                          # watch mode
npx vitest run pdfProcessor.test.ts -t "mergePdfs"   # one suite
```

## How the tests are written

Every test asserts on **behavior** (the actual output), not implementation:

```typescript
// Good: checks real output
const pdf = await loadPdf(merged);
expect(pdf.getPageCount()).toBe(3);

// Avoided: checking that a function was called, not what it produced
expect(mergePdf).toHaveBeenCalled();
```

Two small helpers keep tests concise:
- `createSamplePdf(pageCount, metadata?)` — builds a real, valid PDF to test against
- `loadPdf(blob)` — loads and validates the output structure

## Known limitations

- **`pdfToImages`** needs a real `<canvas>`/DOM (it renders PDF pages to images), so it isn't covered by this Node test suite — verified separately with a real-browser (Playwright) test instead.
- **Download triggers** (`saveAs`) aren't tested — they only matter in a real browser.
- **PDF-to-Word/PowerPoint/Excel** (`src/utils/officeExportProcessor.ts`) needs `pdfjs-dist`'s worker plus `docx`/`pptxgenjs`/`exceljs`, all of which need a real browser, so it isn't covered by this Node test suite — verified with a real-browser (Playwright) test instead. The optional Word/PowerPoint/Excel→PDF server path (self-hosted `convert-service/`, LibreOffice) also runs outside this codebase and has no automated coverage here.

## Adding a test

Follow the pattern already in the relevant `describe` block in `tests/pdfProcessor.test.ts`, generate a real PDF with `createSamplePdf`, and assert on the real output — not on whether a function was called.

---

**Last updated:** 2026-07-21
