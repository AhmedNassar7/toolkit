const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Convert uploaded DOCX to PDF using installed LibreOffice (soffice)
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve(path.dirname(inputPath));

  // Run soffice to convert
  const soffice = process.env.SOFFICE_BIN || 'soffice';
  const args = ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath];

  execFile(soffice, args, { timeout: 2 * 60 * 1000 }, (err) => {
    if (err) {
      console.error('Conversion error', err);
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
      if (downloadErr) console.error('Download error', downloadErr);
    });
  });
});

app.listen(PORT, () => console.log(`Convert service listening on ${PORT}`));
