import ToolPage, { type ProcessResult } from '../ToolPage';
import { svgToPdf } from '../../utils/svgProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blob = await svgToPdf(file);
  return {
    singleBlob: { blob, name: file.name.replace(/\.svg$/i, '.pdf') },
    info: { output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function SvgToPdf() {
  return <ToolPage processor={processor} />;
}
