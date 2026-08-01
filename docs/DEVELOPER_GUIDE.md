# Developer Guide

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [User Guide](USER_GUIDE.md)

## Tech stack

| Layer | Tech |
|---|---|
| Framework | React 18.3 + TypeScript 5.5, JSX via `@vitejs/plugin-react` |
| Build tool | Vite 5.4 (base path `/toolkit/`, set in [`vite.config.ts`](../vite.config.ts)) |
| Routing | react-router-dom 7.15 (`BrowserRouter` with `basename="/toolkit"`) |
| Styling | Tailwind CSS 3.4 |
| PDF engine | [`pdf-lib-with-encrypt`](https://www.npmjs.com/package/pdf-lib-with-encrypt) (a `pdf-lib` fork adding real password encryption) + [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) |
| Office generation | `docx`, `pptxgenjs`, `exceljs` — build `.docx`/`.pptx`/`.xlsx` entirely client-side |
| Misc | `jszip` (multi-file ZIP downloads), `file-saver`, `qrcode` + `jsqr` (QR generate/scan), `lucide-react` (icons) |
| Type checking | TypeScript (`tsc --noEmit -p tsconfig.app.json`) — `strict`, `noUnusedLocals`, `noUnusedParameters` all on |
| Linting | ESLint 9 flat config ([`eslint.config.js`](../eslint.config.js)) — `@eslint/js` recommended + `typescript-eslint` recommended + `react-hooks`/`react-refresh` plugins |
| Testing | Vitest 2.1, run in a Node environment (not jsdom) |
| Hosting | Static site on GitHub Pages via [`gh-pages`](https://www.npmjs.com/package/gh-pages) |
| Optional backend | Node/Express + LibreOffice, containerized (`convert-service/`) |

There is no runtime backend for the core app — see [Architecture](ARCHITECTURE.md)
for why, and the one opt-in exception.

## Local setup

```bash
git clone https://github.com/AhmedNassar7/toolkit.git
cd toolkit
npm install
npm run dev          # http://localhost:5173/toolkit/ — note the /toolkit/ base path
```

No environment variables or accounts are required — every tool works fully
client-side out of the box. The only optional variable is
[`VITE_CONVERT_API_URL`](#optional-convert-service) (see [`.env.example`](../.env.example)).

**Scripts** (from [`package.json`](../package.json)):

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once (`vitest run --environment node`) |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `npm run lint` | `eslint .` |
| `npm run deploy` | `predeploy` (build) then publish `dist/` to the `gh-pages` branch via `gh-pages -d dist` |

## Testing

61 tests across two files, all run with `npm test` (Vitest, Node environment
— not a browser/jsdom environment).

**`tests/pdfProcessor.test.ts`** (58 tests) exercises every exported function
in [`src/utils/pdfProcessor.ts`](../src/utils/pdfProcessor.ts) against real,
generated PDFs — no mocks. Each test loads the actual output back with
`pdf-lib` and asserts on real structure (page count, rotation angle, crop
box, encryption, signature placement, etc.):

| Suite | Tests | Covers |
|---|---|---|
| `mergePdfs` | 4 | Page order/count across 1–4 source files |
| `splitPdf` | 4 | One valid output file per page |
| `rotatePdf` | 6 | 90°/180°/270°, multi-page, cumulative rotation |
| `compressPdf` | 4 | Metadata stripped, content/page count unchanged |
| `getPdfInfo` | 5 | Page count, size formatting, metadata extraction |
| `watermarkPdf` | 7 | Custom text/color/opacity/font size on every page |
| `signPdf` | 5 | Signature image stamped at the requested anchor/target page(s) |
| `addPageNumbers` | 5 | "current / total" numbering, page count preserved |
| `protectPdf` | 3 | Real encryption — rejects no/wrong password, opens with the right one |
| `unlockPdf` | 2 | Real decryption given the correct password; rejects a wrong one |
| `cropPdf` | 3 | Crop box math, clamped safely for oversized margins |
| `repairPdf` | 2 | Lenient reparse + resave preserves page count |
| `organizePdf` | 3 | Reorders/drops pages, supports a single-page result |
| `integration scenarios` | 5 | Chained ops (merge→split, watermark→compress, etc.) |

**`tests/qrCode.test.ts`** (3 tests) covers the pure validation logic behind
the QR tool (URL-vs-text detection, non-empty input, accepted image MIME
types) — not actual scanning/generation, which needs a real `<canvas>` and
DOM.

```bash
npm test                                            # run once
npx vitest run --reporter=verbose                   # verbose output
npx vitest --watch                                  # watch mode
npx vitest run tests/pdfProcessor.test.ts -t "mergePdfs"   # one suite
```

Tests assert on **behavior** (real output), not implementation:

```typescript
// Good — checks real output
const pdf = await loadPdf(merged);
expect(pdf.getPageCount()).toBe(3);
```

Two helpers keep tests concise: `createSamplePdf(pageCount, metadata?)`
builds a real, valid PDF to test against; `loadPdf(blob)` loads and
validates output structure. Follow the existing pattern in the relevant
`describe` block when adding a test.

**What isn't covered by this suite**, and why:
- `pdfToImages` (renders PDF pages to a `<canvas>`) needs a real DOM.
- Download triggers (`saveAs`) only matter in a real browser.
- `officeExportProcessor.ts` needs `pdfjs-dist`'s worker plus `docx`/`pptxgenjs`/`exceljs` in a real browser context.
- The `convert-service/` LibreOffice path runs outside this codebase entirely.

These are exercised manually in a real browser rather than by an automated
browser test suite — **there is no Playwright/Puppeteer setup in this repo**
(no such dependency in `package.json`, no config or spec files); if you add
browser-level automated coverage, this section should be updated to
document it.

## Linting & type checking

```bash
npm run lint        # ESLint flat config, see eslint.config.js
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
```

`tsconfig.app.json` targets ES2020 with `strict`, `noUnusedLocals`, and
`noUnusedParameters` enabled — dead/unused code fails typecheck, not just
lint.

## Build & deploy

**Frontend** builds to `dist/` via `npm run build` (`vite build`), and is
served as a fully static site — no server-side rendering, no API routes.

Pushing to `main` triggers [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):
checks out the repo, sets up Node 20, `npm ci`, `npm run build` (with
`VITE_CONVERT_API_URL` injected from a repo secret if set), then publishes
`dist/` to the `gh-pages` branch via `peaceiris/actions-gh-pages@v4`. This
matches the `homepage` field in `package.json`
(`https://ahmednassar7.github.io/toolkit/`).

`npm run deploy` (`gh-pages -d dist`, after a `predeploy` build) does the
same thing manually, as a fallback to the CI-driven path.

### Optional: convert-service

[`convert-service/`](../convert-service/) is a small Express server that
wraps a headless LibreOffice install (see [`Dockerfile`](../convert-service/Dockerfile))
to do real Word/PowerPoint/Excel→PDF and PDF→Word/PowerPoint conversion
(`POST /convert`, multipart `file` + `target` fields). PDF→Excel is
intentionally excluded — LibreOffice has no PDF import filter for Calc — so
that conversion always uses the client-side fallback regardless of
configuration.

Run it locally:

```bash
docker compose up --build -d   # builds convert-service/, exposes :3000
```

Then point the frontend at it:

```bash
# .env (see .env.example)
VITE_CONVERT_API_URL=http://localhost:3000/convert
```

Relevant server env vars (from [`convert-service/index.js`](../convert-service/index.js)):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `MAX_UPLOAD_BYTES` | `52428800` (50MB) | Upload size limit (multer) |
| `CORS_ORIGIN` | *(empty = allow all)* | Comma-separated allowlist of origins |
| `SOFFICE_BIN` | `soffice` | Override the LibreOffice binary path |

Each request runs `soffice --headless --convert-to ...` in an isolated temp
user-profile directory, then deletes both the input and the converted output
file after the response is sent — nothing persists between requests. Gating
logic for which formats even attempt the server path lives in
`SERVER_CAPABLE_FORMATS` (`src/pages/tool-pages/PdfToOffice.tsx`) and
`SERVER_CAPABLE_EXTENSIONS` (`src/pages/tool-pages/ConvertToPdf.tsx`).

Without `VITE_CONVERT_API_URL` set (the default, including on the public
GitHub Pages deployment unless a repo secret is configured), every
Office↔PDF tool still works, using in-browser text extraction instead.

## Adding a new tool

See the "Adding a new tool" section of [`CLAUDE.md`](../CLAUDE.md) — it
lists the four files that need to change (`src/data/tools.ts`, a processor
in `src/utils/`, a wrapper in `src/pages/tool-pages/`, and a route entry in
`src/pages/ToolRouter.tsx`) and the conventions each one follows.
