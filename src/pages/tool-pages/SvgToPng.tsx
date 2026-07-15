import ToolPage, { type ProcessResult } from '../ToolPage';
import { svgToPng } from '../../utils/svgProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blob = await svgToPng(file);
  return {
    singleBlob: { blob, name: file.name.replace(/\.svg$/i, '.png') },
    info: { format: 'PNG', output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function SvgToPng() {
  return <ToolPage processor={processor} />;
}
