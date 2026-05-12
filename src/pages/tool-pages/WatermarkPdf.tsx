import ToolPage, { type ProcessResult } from '../ToolPage';
import { watermarkPdf } from '../../utils/pdfProcessor';

function WatermarkOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Watermark Text</label>
        <input
          type="text"
          value={(options.text as string) || 'CONFIDENTIAL'}
          onChange={(e) => setOptions({ ...options, text: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
          placeholder="Enter watermark text"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Opacity: {Math.round(((options.opacity as number) ?? 0.3) * 100)}%
        </label>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={(options.opacity as number) ?? 0.3}
          onChange={(e) => setOptions({ ...options, opacity: parseFloat(e.target.value) })}
          className="w-full accent-red-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Watermark Color</label>
        <input
          type="color"
          value={(options.color as string) || '#d11c24'}
          onChange={(e) => setOptions({ ...options, color: e.target.value })}
          className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1"
        />
      </div>
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const text = (options?.text as string) || 'CONFIDENTIAL';
  const opacity = (options?.opacity as number) ?? 0.3;
  const color = (options?.color as string) || '#d11c24';
  const blob = await watermarkPdf(file, text, { opacity, color });
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_watermarked.pdf') },
    info: { watermark: text, opacity: Math.round(opacity * 100) + '%', color },
  };
}

export default function WatermarkPdf() {
  return <ToolPage processor={processor} optionsComponent={WatermarkOptions} />;
}
