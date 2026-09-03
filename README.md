# Toolkit

[![Deploy](https://github.com/AhmedNassar7/toolkit/actions/workflows/deploy.yml/badge.svg)](https://github.com/AhmedNassar7/toolkit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A free, 100% client-side PDF/image/SVG toolkit.** Merge, split, compress,
convert, sign, and secure PDFs — every tool runs entirely in your browser,
with no upload and no backend for the core app.

**Live:** [ahmednassar7.github.io/toolkit](https://ahmednassar7.github.io/toolkit/)

## What it is

Toolkit is a single-page React app with 35 PDF/image/SVG tools organized
into six categories (Organize, Optimize, Convert, Edit, Security,
Intelligence). 26 are fully working today, 6 more work at basic
text-only fidelity while a higher-fidelity path is built out, and the
remaining 3 are honestly marked "Coming Soon" instead of shipped
half-broken. Everything runs in-browser; the one optional exception is a
self-hosted LibreOffice service for higher-fidelity Office↔PDF conversion.

## Highlights

- **Organize & optimize** — merge, split, rotate, reorder, crop, compress, and repair PDFs
- **Convert** — PDF ⇄ Word/PowerPoint/Excel/PNG/JPG/SVG, HTML → PDF, JPG → PDF
- **Edit & secure** — watermark, page numbers, sign (type your name, draw, or upload a signature, optionally date it, then drag/resize it on the page), password-protect/unlock with real encryption
- **Capture** — scan pages with your device camera, auto-straighten & crop them, reorder, and export a multi-page PDF (optionally OCR'd in the same pass)
- **OCR** — extract text from a scanned PDF or photo (Tesseract, in-browser); get a searchable PDF plus a `.txt`. English is fully offline; other languages fetch their data on demand
- **QR codes** — scan or generate
- **Privacy by default** — no upload, no account, no ads; files never leave your device. Fonts and the OCR engine are self-hosted; the only outbound requests are the opt-in server path below and (if you pick one) a non-English OCR language pack

## Quick start

```bash
git clone https://github.com/AhmedNassar7/toolkit.git
cd toolkit
npm install
npm run dev   # http://localhost:5173/toolkit/
```

No environment variables or accounts needed — everything works out of the box.

## Learn more

- **[User Guide](docs/USER_GUIDE.md)** — how to use the app, tool by tool
- **[Architecture](docs/ARCHITECTURE.md)** — system/data flow, project structure, design decisions
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** — tech stack, local setup, testing, linting, build & deploy, the optional self-hosted convert service

## License

[MIT](LICENSE) © 2026 Ahmed Nassar
