import ToolPage, { type ProcessResult } from '../ToolPage';
import { ocrDocument } from '../../utils/ocrProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const { pdf, text, pages, words } = await ocrDocument(file);
  const base = file.name.replace(/\.[^.]+$/, '') || 'document';

  return {
    blobs: [
      { blob: pdf, name: `${base}_ocr.pdf` },
      { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: `${base}.txt` },
    ],
    info: {
      pages,
      words,
      language: 'English',
    },
  };
}

export default function OcrPdf() {
  return <ToolPage processor={processor} />;
}
