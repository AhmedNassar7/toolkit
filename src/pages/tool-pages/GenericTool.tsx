import ToolPage, { type ProcessResult } from '../ToolPage';
import { getPdfInfo } from '../../utils/pdfProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const info = await getPdfInfo(file);
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type || 'application/pdf' });

  return {
    singleBlob: { blob, name: file.name },
    info: {
      pages: info.pages,
      size: info.size,
      title: info.title || 'N/A',
      author: info.author || 'N/A',
    },
  };
}

export default function GenericTool() {
  return <ToolPage processor={processor} />;
}
