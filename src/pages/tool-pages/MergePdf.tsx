import ToolPage, { type ProcessResult } from '../ToolPage';
import { mergePdfs } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const blob = await mergePdfs(files);
  return {
    singleBlob: { blob, name: 'merged.pdf' },
    info: { files_merged: files.length, total_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function MergePdf() {
  return <ToolPage processor={processor} />;
}
