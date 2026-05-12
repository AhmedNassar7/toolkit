import ToolPage, { type ProcessResult } from '../ToolPage';
import { imagesToPdf } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const blob = await imagesToPdf(files);
  return {
    singleBlob: { blob, name: 'images.pdf' },
    info: { images: files.length, output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function JpgToPdf() {
  return <ToolPage processor={processor} />;
}
