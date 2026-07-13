import ToolPage, { type ProcessResult } from '../ToolPage';
import { cropPdf } from '../../utils/pdfProcessor';

function CropOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  const margin = (options.margin as number) ?? 20;
  return (
    <div>
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
        Crop margin: {margin}pt on every side
      </label>
      <input
        type="range"
        min="0"
        max="150"
        step="5"
        value={margin}
        onChange={(e) => setOptions({ ...options, margin: parseInt(e.target.value, 10) })}
        className="w-full accent-red-500"
      />
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const margin = (options?.margin as number) ?? 20;
  const blob = await cropPdf(file, { top: margin, bottom: margin, left: margin, right: margin });
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_cropped.pdf') },
    info: { margin: margin + 'pt' },
  };
}

export default function CropPdf() {
  return <ToolPage processor={processor} optionsComponent={CropOptions} />;
}
