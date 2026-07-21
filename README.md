# Toolkit - PDF Tools Suite

**A free, 100% client-side PDF toolkit.** Merge, split, compress, convert, and secure PDFs with just a few clicks. **Your files never leave your device** - every tool runs entirely in your browser, with no upload and no backend. **100% FREE • No sign-up required • No ads**

---

## 📋 Table of Contents

**For users**
- [Quick Start](#-quick-start)
- [Features](#-all-features)
  - [Organize PDF](#organize-pdf)
  - [Optimize PDF](#optimize-pdf)
  - [Convert PDF](#convert-pdf)
  - [Edit PDF](#edit-pdf)
  - [PDF Security](#pdf-security)
  - [PDF Intelligence](#pdf-intelligence)
- [Security & Privacy](#-security--privacy)

**For developers**
- [Tech Stack](#-tech-stack)
- [Local Setup](#-local-setup)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [Tests](#-tests)

---

## 🚀 Quick Start

1. **Open the app** → Visit [Toolkit](https://ahmednassar7.github.io/toolkit/)
2. **Choose a tool** → Browse or search for what you need
3. **Upload file** → Drag & drop or click to select
4. **Download result** → Your file is ready instantly!

Tools marked **🕒 Coming Soon** below aren't implemented yet — the app shows a clear "not available yet" page for these instead of pretending to process your file, and they're visibly badged on the homepage before you click in.

---

## 📦 All Features

### **Organize PDF**
Manage and restructure your PDF documents with ease.

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Merge PDF** | ✅ | Combine multiple PDFs in any order | Multiple `.pdf` | Single PDF |
| **Split PDF** | ✅ | Extract every page into a separate file | `.pdf` | Multiple PDFs |
| **Rotate PDF** | ✅ | Rotate pages 90°, 180°, or 270° | `.pdf` | Rotated PDF |
| **Organize PDF** | ✅ | Reorder or delete pages | `.pdf` | Organized PDF |
| **Crop PDF** | ✅ | Trim margins on every page | `.pdf` | Cropped PDF |

### **Optimize PDF**
Reduce file size and improve document quality.

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Compress PDF** | ✅ | Strips metadata to shave a small amount of size. Not full image/stream recompression — expect a modest reduction, not a dramatic one | `.pdf` | Smaller PDF |
| **Repair PDF** | ✅ | Leniently re-parses and rebuilds the PDF structure | `.pdf` | Repaired PDF |
| **PDF to PDF/A** | 🕒 | Coming soon | `.pdf` | PDF/A File |

### **Convert PDF**
Convert between PDF and other popular formats.

**PDF → Office Documents:**

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **PDF to Word** | ✅ | High-fidelity via an optional self-hosted LibreOffice service; falls back to layout-aware text extraction done entirely in-browser if that's not configured | `.pdf` | `.docx` |
| **PDF to PowerPoint** | ✅ | High-fidelity via the same LibreOffice service (real slide geometry, not just a bulleted outline); falls back to one slide of extracted text per PDF page, built in-browser | `.pdf` | `.pptx` |
| **PDF to Excel** | ✅ | Extracts detected table rows into cells entirely in-browser (LibreOffice has no PDF import filter for Calc, so this format always uses the client-side path) | `.pdf` | `.xlsx` |

**Office → PDF:**

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Word to PDF** | ✅ | High-fidelity via an optional self-hosted LibreOffice service; falls back to basic local text extraction if that's not configured | `.doc, .docx` | `.pdf` |
| **PowerPoint to PDF** | ✅ | High-fidelity via the LibreOffice service; falls back to extracting real slide text client-side | `.ppt, .pptx` | `.pdf` |
| **Excel to PDF** | ✅ | High-fidelity via the LibreOffice service; falls back to extracting real cell data client-side | `.xls, .xlsx` | `.pdf` |

Without `VITE_CONVERT_API_URL` configured, every conversion above still works using the lower-fidelity fallback path (text-only, no images/fonts/real tables).

**Images & Web:**

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **PDF to JPG** | ✅ | Renders every page to a JPG image | `.pdf` | `.jpg` files |
| **JPG to PDF** | ✅ | Embeds images as PDF pages | `.jpg, .jpeg, .png` | `.pdf` |
| **HTML to PDF** | ✅ | Extracts visible page text (client-side, no server) | `.html, .htm` | `.pdf` |

### **Edit PDF**
Add content and make modifications to PDF documents.

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Edit PDF** | 🕒 | Coming soon | `.pdf` | Edited PDF |
| **Watermark** | ✅ | Add a text watermark with custom color/opacity | `.pdf` | Watermarked PDF |
| **Page Numbers** | ✅ | Add "page / total" numbering | `.pdf` | PDF with Numbers |
| **Sign PDF** | 🕒 | Coming soon | `.pdf` | Signed PDF |
| **PDF Forms** | 🕒 | Coming soon | `.pdf` | Filled PDF |

### **PDF Security**
Protect, unlock, and secure your PDF documents.

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Protect PDF** | ✅ | Real password encryption (PDF standard security handler) | `.pdf` | Protected PDF |
| **Unlock PDF** | ✅ | Genuinely decrypts given the correct password | `.pdf` | Unlocked PDF |
| **Redact PDF** | 🕒 | Coming soon — deliberately not shipped half-working, since a wrong redaction is worse than none | `.pdf` | Redacted PDF |

### **PDF Intelligence**
Smarter tools for scanning, reading, and understanding PDFs.

| Tool | Status | Description | Input | Output |
|------|--------|-------------|-------|--------|
| **Scan to PDF** | ✅ | Same engine as JPG to PDF | `.jpg, .png` | Scanned PDF |
| **QR Code** | ✅ | Scan or generate QR codes | image / text | PNG or decoded text |
| **OCR PDF** | 🕒 | Coming soon | `.pdf` | OCR PDF |
| **Compare PDF** | 🕒 | Coming soon | Two `.pdf` files | Comparison Report |
| **AI Summarizer** | 🕒 | Coming soon | `.pdf` | Summary Text |
| **Translate PDF** | 🕒 | Coming soon | `.pdf` | Translated PDF |

---

### 🔒 Security & Privacy

- **100% client-side**: Every tool processes files entirely in your browser. Nothing is uploaded, and there is no backend or server dependency of any kind for any tool.
- **Optional exception**: If you configure `VITE_CONVERT_API_URL` to point at your own self-hosted `convert-service/` (LibreOffice, run via Docker on infrastructure you control), Office↔PDF conversions send the file there for higher-fidelity output instead of the built-in in-browser extraction, and it isn't stored afterward. This is entirely opt-in - without it, everything still works, fully client-side.
- **No Account**: No sign-up required
- **No Ads**: Completely ad-free
- **HTTPS Only**: All connections encrypted

---

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript, built with Vite, styled with Tailwind CSS
- **PDF processing**: [`pdf-lib-with-encrypt`](https://www.npmjs.com/package/pdf-lib-with-encrypt) (a `pdf-lib` fork that adds real password encryption/decryption) and [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist), both running client-side in the browser
- **Office document generation**: [`docx`](https://www.npmjs.com/package/docx), [`pptxgenjs`](https://www.npmjs.com/package/pptxgenjs), and [`exceljs`](https://www.npmjs.com/package/exceljs) build `.docx`/`.pptx`/`.xlsx` files entirely in-browser for PDF→Word/PowerPoint/Excel
- **Backend**: None required - the app has no server-side component
- **Optional backend**: A small Node/Express service in [`convert-service/`](convert-service/) that wraps LibreOffice for high-fidelity conversion in both directions - Word/PowerPoint/Excel→PDF and PDF→Word/PowerPoint (self-hosted via Docker; entirely opt-in - the app works fully without it, just with lower-fidelity output for those conversions)
- **Hosting**: Static site on GitHub Pages, deployed via [`gh-pages`](https://www.npmjs.com/package/gh-pages)

---

## 💻 Local Setup

```bash
git clone https://github.com/AhmedNassar7/toolkit.git
cd toolkit
npm install
npm run dev             # starts the dev server, usually at http://localhost:5173
```

No environment variables or accounts are required to run the app - every tool works out of the box, fully client-side.

**Environment variables** (see [`.env.example`](.env.example)) - entirely optional:

| Variable | Required? | What it's for |
|---|---|---|
| `VITE_CONVERT_API_URL` | No | URL of a self-hosted `convert-service` instance, for higher-fidelity Word/PowerPoint/Excel→PDF and PDF→Word/PowerPoint. Without it, those conversions still work, using in-browser extraction/generation instead. |

**Available scripts:**

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite ([details](TESTS.md)) |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Build and publish `dist/` to GitHub Pages |

---

## 📁 Project Structure

```
src/
  components/       Shared UI (header, footer, file upload, tool card, ...)
  pages/
    tool-pages/      One file per tool (MergePdf.tsx, ProtectPdf.tsx, ...)
    ToolRouter.tsx   Maps a tool's URL id to its component
    HomePage.tsx     The tool grid / search / category browser
  utils/
    pdfProcessor.ts         Core PDF logic (merge, split, crop, encrypt, ...) - unit tested
    officeExportProcessor.ts  PDF→Word/PowerPoint/Excel extraction + generation, entirely in-browser
  data/
    tools.ts         The list of tools: name, description, category, status

convert-service/                  Optional Node/LibreOffice service for Office<->PDF high-fidelity conversion
tests/                            Vitest suite for src/utils/pdfProcessor.ts
```

---

## 🚀 Deployment

**Frontend** (GitHub Pages):
```bash
npm run deploy
```
This builds the app and pushes `dist/` to the `gh-pages` branch, matching the `homepage` field in `package.json`. No backend deployment step is needed - the app is entirely static.

**Convert service** (optional, for high-fidelity Word/PowerPoint/Excel→PDF and PDF→Word/PowerPoint):
```bash
docker compose up --build -d
```
Then set `VITE_CONVERT_API_URL` to wherever you host it and redeploy the frontend.

---

## 🧪 Tests

Run `npm test` to run the test suite (56 tests covering all client-side PDF operations — see [TESTS.md](TESTS.md) for details).

---

## 📜 License

**100% Free & Open Source** - Use without any restrictions

---

**Last Updated**: July 2026  
**Version**: 1.2.0  
**Status**: 22 of 31 tools available; 9 honestly marked Coming Soon — now 100% client-side, no backend required