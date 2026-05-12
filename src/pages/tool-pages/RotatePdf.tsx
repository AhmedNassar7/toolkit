import ToolPage, { type ProcessResult } from '../ToolPage';
import { rotatePdf } from '../../utils/pdfProcessor';

function RotateOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  const degrees = (options.degrees as number) || 90;
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 dark:text-gray-400">Rotation:</label>
      {[90, 180, 270].map((d) => (
        <button
          key={d}
          onClick={() => setOptions({ ...options, degrees: d })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            degrees === d
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {d}&deg;
        </button>
      ))}
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const rotationDegrees = (options?.degrees as number) || 90;
  const file = files[0];
  const blob = await rotatePdf(file, rotationDegrees);
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', `_rotated_${rotationDegrees}.pdf`) },
    info: { rotation: rotationDegrees + '\u00B0', pages: 'All' },
  };
}

export default function RotatePdf() {
  return <ToolPage processor={processor} optionsComponent={RotateOptions} />;
}
