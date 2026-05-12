import ToolPage, { type ProcessResult } from '../ToolPage';
import { splitPdf } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blobs = await splitPdf(file);
  return {
    blobs: blobs.map((blob, i) => ({
      blob,
      name: file.name.replace('.pdf', `_page_${i + 1}.pdf`),
    })),
    info: { pages: blobs.length },
  };
}

export default function SplitPdf() {
  return <ToolPage processor={processor} />;
}
