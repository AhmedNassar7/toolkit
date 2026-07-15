import ToolPage, { type ProcessResult } from '../ToolPage';
import FormatSelect from '../../components/FormatSelect';
import { pdfToImages, type ImageFormat } from '../../utils/pdfProcessor';

const FORMATS: { value: ImageFormat; label: string; ext: string }[] = [
  { value: 'png', label: 'PNG', ext: 'png' },
  { value: 'jpeg', label: 'JPG', ext: 'jpg' },
  { value: 'webp', label: 'WEBP', ext: 'webp' },
];

function PdfToPngOptions({
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
  const blobs = await pdfToImages(file, { format });
  return {
    blobs: blobs.map((blob, i) => ({
      blob,
      name: file.name.replace(/\.pdf$/i, `_page_${i + 1}.${ext}`),
    })),
    info: { pages: blobs.length, format: format.toUpperCase() },
  };
}

export default function PdfToPng() {
  return <ToolPage processor={processor} optionsComponent={PdfToPngOptions} />;
}
