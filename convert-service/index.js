const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const { pathToFileURL } = require('url');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024) },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.docx')) {
      return callback(new Error('Only DOCX files are supported'));
    }
    return callback(null, true);
  },
});
const app = express();
const PORT = process.env.PORT || 3000;

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

// Convert uploaded DOCX to PDF using installed LibreOffice (soffice)
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).send('Only DOCX files are supported');
  }

  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve(path.dirname(inputPath));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-lo-profile-'));
  const profileUrl = pathToFileURL(profileDir).href;

  // Run soffice to convert
  const soffice = process.env.SOFFICE_BIN || 'soffice';
  const args = [
    '--headless',
    '--nologo',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    '--norestore',
    `-env:UserInstallation=${profileUrl}`,
    '--convert-to',
    'pdf:writer_pdf_Export',
    '--outdir',
    outputDir,
    inputPath,
  ];

  execFile(soffice, args, { timeout: 2 * 60 * 1000 }, (err) => {
    if (err) {
      console.error('Conversion error', err);
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
      try { fs.unlinkSync(inputPath); } catch (e) {}
      return res.status(500).send('Conversion failed: ' + err.message);
    }

    // PDF will have same base name with .pdf
    const pdfPath = inputPath + '.pdf';
    const altPdf = inputPath.replace(/\.[^.]+$/, '.pdf');
    const finalPdf = fs.existsSync(pdfPath) ? pdfPath : altPdf;

    if (!fs.existsSync(finalPdf)) {
      return res.status(500).send('Converted file not found');
    }

    res.download(finalPdf, req.file.originalname.replace(/\.docx$/i, '.pdf'), (downloadErr) => {
      // cleanup temp files
      try { fs.unlinkSync(inputPath); } catch (e) {}
      try { fs.unlinkSync(finalPdf); } catch (e) {}
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
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
