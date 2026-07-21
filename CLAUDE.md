# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Start dev server (http://localhost:5173/toolkit/, base path matters - see below)
npm run build        # Production build to dist/
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run lint          # ESLint
npm test              # Run full Vitest suite (tests/*.test.ts)
npx vitest run tests/pdfProcessor.test.ts -t "test name"   # Run a single test
npm run deploy         # Manual: build + publish dist/ to gh-pages branch
```

Pushing to `main` also auto-deploys via `.github/workflows/deploy.yml` (build + `peaceiris/actions-gh-pages` to the `gh-pages` branch) - `npm run deploy` is a manual fallback using the same target.

Only `src/utils/pdfProcessor.ts` has a dedicated test suite (`tests/pdfProcessor.test.ts`); `tests/qrCode.test.ts` covers QR utilities. Other tool pages/processors are not unit tested.

## Architecture

This is a client-side, single-page PDF/image/SVG toolkit (Vite + React 18 + TS + react-router-dom + Tailwind), deployed as a static site to GitHub Pages under base path `/toolkit/` (set in `vite.config.ts`'s `base` and `BrowserRouter`'s `basename` in `App.tsx`). Almost everything runs in the browser - no upload, no server - except the three exceptions noted below.

**Adding a new tool requires touching four places:**
1. `src/data/tools.ts` - add a `Tool` entry (id, name, description, icon, category, color, acceptTypes, outputLabel). `comingSoon: true` renders an honest "not available yet" page instead of a broken one - used for genuinely unimplemented tools, not as a WIP flag.
2. `src/utils/*Processor.ts` - the actual conversion logic (`pdfProcessor.ts`, `svgProcessor.ts`, etc.), pure functions taking `File | Blob` and returning `Blob`/`Blob[]`.
3. `src/pages/tool-pages/*.tsx` - a thin wrapper: a `processor(files, options) => Promise<ProcessResult>` function passed to the shared `ToolPage` component. `ProcessResult` is `{ blobs?, singleBlob?, info? }` - `info` renders as small stat tiles on the result screen, `blobs`/`singleBlob` drive the download button(s) (multi-file results also get a "download as ZIP" option via `jszip`).
4. `src/pages/ToolRouter.tsx` - register the component in the `toolComponents` map keyed by tool id.

`ToolPage.tsx` owns all the generic upload -> processing -> done/error state machine and download wiring; tool pages should never reimplement it. Tool-specific option UIs (format pickers, sliders, color inputs) plug in via the `optionsComponent` prop rather than forking `ToolPage`.

**Output format selection**: rather than one fixed output extension per tool, tools that can reasonably produce more than one format (e.g. PDF to PNG, SVG to PNG) expose an in-page format selector (`src/components/FormatSelect.tsx`) instead of a separate tool/page per format. The tool's `id`/`name` reflects the default/primary format; format-capable processors take an `options?: { format }` argument (see `pdfToImages` in `pdfProcessor.ts`, `svgToImage` in `svgProcessor.ts`).

**Raster <-> SVG conversion is not vector tracing.** PNG/JPG -> SVG wraps the raster as a base64 `<image>` inside an SVG container at native pixel size (`wrapRasterInSvg` in `svgProcessor.ts`) - this preserves exact position/size without adding a tracing dependency, but the result isn't editable as paths.

**Everything is client-side. There is no backend, no upload, and no Supabase** - this app used to call a Supabase Edge Function for PDF -> Word/PowerPoint/Excel, but that's been fully replaced by in-browser extraction/generation (`src/utils/officeExportProcessor.ts`, using `pdfjs-dist` for extraction and `docx`/`pptxgenjs`/`exceljs` for generation). Don't reintroduce a server call for any tool without discussing it first.

**One optional, self-hosted exception**: PDF <-> Word/PowerPoint and Word/PowerPoint/Excel -> PDF prefer the optional self-hosted LibreOffice service in `convert-service/` (`VITE_CONVERT_API_URL`, run via `docker compose up --build -d`) for real fidelity, and fall back to fully in-browser extraction/generation if that env var isn't set, unreachable, or (for PDF -> Excel, since LibreOffice has no PDF import filter for Calc) unsupported for the format. This fallback logic lives in `src/pages/tool-pages/PdfToOffice.tsx` and `ConvertToPdf.tsx` (`SERVER_CAPABLE_FORMATS`/`SERVER_CAPABLE_EXTENSIONS` gate which formats even attempt the server path). Without `VITE_CONVERT_API_URL` set, every tool still works, fully client-side.

Everything else (merge/split/rotate/organize/crop/compress/repair/watermark/page-numbers/protect/unlock/imagesToPdf, SVG conversions, QR) runs entirely in-browser via `pdf-lib-with-encrypt` (a `pdf-lib` fork adding real password encryption) and `pdfjs-dist`.

`pdfjs-dist`'s worker is served from `${import.meta.env.BASE_URL}pdf.worker.min.mjs` (not the default CDN path) so it resolves correctly under the `/toolkit/` base in production.
