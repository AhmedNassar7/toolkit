import ToolPage, { type ProcessResult } from '../ToolPage';
import { addPageNumbers } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blob = await addPageNumbers(file);
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_numbered.pdf') },
    info: { pages: 'Numbered', position: 'Bottom center' },
  };
}

export default function PageNumbers() {
  return <ToolPage processor={processor} />;
}
