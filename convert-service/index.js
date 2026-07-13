const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const { pathToFileURL } = require('url');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024) },
});
const app = express();
const PORT = process.env.PORT || 3000;

// Formats LibreOffice can reliably import/export for this service. PDF -> XLSX
// is intentionally omitted: LibreOffice has no PDF import filter for Calc, so
// that conversion stays on the caller's fallback path.
const SUPPORTED_TARGETS = {
  pdf: ['docx', 'pptx'],
  docx: ['pdf'],
  doc: ['pdf'],
  odt: ['pdf'],
  rtf: ['pdf'],
  txt: ['pdf'],
  pptx: ['pdf'],
  ppt: ['pdf'],
  odp: ['pdf'],
  xlsx: ['pdf'],
  xls: ['pdf'],
  ods: ['pdf'],
};

// Explicit export filter per source app so `--convert-to pdf` doesn't guess
// wrong when soffice can't infer the source type from a sanitized filename.
const PDF_EXPORT_FILTER = {
  docx: 'writer_pdf_Export', doc: 'writer_pdf_Export', odt: 'writer_pdf_Export',
  rtf: 'writer_pdf_Export', txt: 'writer_pdf_Export',
  pptx: 'impress_pdf_Export', ppt: 'impress_pdf_Export', odp: 'impress_pdf_Export',
  xlsx: 'calc_pdf_Export', xls: 'calc_pdf_Export', ods: 'calc_pdf_Export',
};

// Importing a PDF requires telling soffice which app should open it - without
// this it can't pick an export filter and aborts with "no export filter
// found", even though bare `--convert-to docx` works fine for every other
// source format.
const PDF_IMPORT_FILTER = {
  docx: 'writer_pdf_import',
  pptx: 'impress_pdf_import',
};

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

function extOf(filename) {
  return path.extname(filename).replace(/^\./, '').toLowerCase();
}

function buildConvertToArg(sourceExt, targetExt) {
  if (targetExt !== 'pdf') return targetExt;
  const filter = PDF_EXPORT_FILTER[sourceExt];
  if (!filter) return 'pdf';
  return `pdf:${filter}:{"EmbedStandardFonts":true,"UseTaggedPDF":true}`;
}

app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const sourceExt = extOf(req.file.originalname);
  const targetExt = (req.body.target || 'pdf').toLowerCase();

  const supportedTargets = SUPPORTED_TARGETS[sourceExt];
  if (!supportedTargets) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).send(`Unsupported source format: .${sourceExt || 'unknown'}`);
  }
  if (!supportedTargets.includes(targetExt)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).send(`Cannot convert .${sourceExt} to .${targetExt}`);
  }

  // Multer stores uploads without an extension; give soffice an explicit one
  // so format auto-detection doesn't have to rely on content sniffing alone.
  const inputPath = `${path.resolve(req.file.path)}.${sourceExt}`;
  fs.renameSync(path.resolve(req.file.path), inputPath);

  const outputDir = path.resolve(path.dirname(inputPath));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-lo-profile-'));
  const profileUrl = pathToFileURL(profileDir).href;

  const soffice = process.env.SOFFICE_BIN || 'soffice';
  const convertToArg = buildConvertToArg(sourceExt, targetExt);
  const args = [
    '--headless',
    '--nologo',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    '--norestore',
    `-env:UserInstallation=${profileUrl}`,
  ];
  if (sourceExt === 'pdf' && PDF_IMPORT_FILTER[targetExt]) {
    args.push(`--infilter=${PDF_IMPORT_FILTER[targetExt]}`);
  }
  args.push('--convert-to', convertToArg, '--outdir', outputDir, inputPath);

  const cleanup = () => {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  };

  execFile(soffice, args, { timeout: 2 * 60 * 1000 }, (err) => {
    if (err) {
      console.error('Conversion error', err);
      cleanup();
      return res.status(500).send('Conversion failed: ' + err.message);
    }

    const outputPath = path.join(
      outputDir,
      `${path.basename(inputPath, path.extname(inputPath))}.${targetExt}`
    );

    if (!fs.existsSync(outputPath)) {
      cleanup();
      return res.status(500).send('Converted file not found');
    }

    const outputName = req.file.originalname.replace(/\.[^.]+$/, `.${targetExt}`);
    res.download(outputPath, outputName, (downloadErr) => {
      try { fs.unlinkSync(outputPath); } catch {}
      cleanup();
      if (downloadErr) console.error('Download error', downloadErr);
    });
  });
});

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).send('File too large');
  }
  console.error('Service error', err);
  return res.status(500).send('Server error');
});

app.listen(PORT, () => console.log(`Convert service listening on ${PORT}`));
