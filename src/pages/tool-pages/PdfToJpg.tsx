import ToolPage, { type ProcessResult } from '../ToolPage';
import { pdfToImages } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blobs = await pdfToImages(file);
  return {
    blobs: blobs.map((blob, i) => ({
      blob,
      name: file.name.replace('.pdf', `_page_${i + 1}.jpg`),
    })),
    info: { pages: blobs.length, format: 'JPEG', quality: '92%' },
  };
}

export default function PdfToJpg() {
  return <ToolPage processor={processor} />;
}
