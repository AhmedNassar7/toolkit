import ToolPage, { type ProcessResult } from '../ToolPage';
import { repairPdf } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blob = await repairPdf(file);
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_repaired.pdf') },
    info: { status: 'Rebuilt', output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function RepairPdf() {
  return <ToolPage processor={processor} />;
}
