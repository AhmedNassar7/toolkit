import ToolPage, { type ProcessResult } from '../ToolPage';
import { compressPdf, getPdfInfo } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const info = await getPdfInfo(file);
  const blob = await compressPdf(file);
  const newSize = blob.size;
  const reduction = ((1 - newSize / file.size) * 100).toFixed(1);

  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_compressed.pdf') },
    info: {
      original_size: (file.size / 1024).toFixed(1) + ' KB',
      compressed_size: (newSize / 1024).toFixed(1) + ' KB',
      reduction: reduction + '%',
      pages: info.pages,
    },
  };
}

export default function CompressPdf() {
  return <ToolPage processor={processor} />;
}
