import ToolPage, { type ProcessResult } from '../ToolPage';
import { imageToSvg } from '../../utils/svgProcessor';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const blob = await imageToSvg(file);
  return {
    singleBlob: { blob, name: file.name.replace(/\.(png|jpe?g)$/i, '.svg') },
    info: { format: 'SVG', output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function PngToSvg() {
  return <ToolPage processor={processor} />;
}
