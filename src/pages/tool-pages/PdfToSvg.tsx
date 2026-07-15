import ToolPage, { type ProcessResult } from '../ToolPage';
import { pdfToSvgs } from '../../utils/svgProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blobs = await pdfToSvgs(file);
  return {
    blobs: blobs.map((blob, i) => ({
      blob,
      name: file.name.replace(/\.pdf$/i, `_page_${i + 1}.svg`),
    })),
    info: { pages: blobs.length, format: 'SVG' },
  };
}

export default function PdfToSvg() {
  return <ToolPage processor={processor} />;
}
