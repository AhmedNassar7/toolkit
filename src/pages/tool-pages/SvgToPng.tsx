import ToolPage, { type ProcessResult } from '../ToolPage';
import FormatSelect from '../../components/FormatSelect';
import { svgToImage, type ImageFormat } from '../../utils/svgProcessor';

const FORMATS: { value: ImageFormat; label: string; ext: string }[] = [
  { value: 'png', label: 'PNG', ext: 'png' },
  { value: 'jpeg', label: 'JPG', ext: 'jpg' },
  { value: 'webp', label: 'WEBP', ext: 'webp' },
];

function SvgToPngOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  const format = (options.format as ImageFormat) || 'png';
  return (
    <FormatSelect
      label="Output format:"
      formats={FORMATS}
      value={format}
      onChange={(value) => setOptions({ ...options, format: value })}
    />
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const format = (options?.format as ImageFormat) || 'png';
  const ext = FORMATS.find((f) => f.value === format)!.ext;
  const blob = await svgToImage(file, format);
  return {
    singleBlob: { blob, name: file.name.replace(/\.svg$/i, `.${ext}`) },
    info: { format: format.toUpperCase(), output_size: (blob.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function SvgToPng() {
  return <ToolPage processor={processor} optionsComponent={SvgToPngOptions} />;
}
