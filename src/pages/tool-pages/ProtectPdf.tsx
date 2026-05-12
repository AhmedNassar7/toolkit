import ToolPage, { type ProcessResult } from '../ToolPage';
import { protectPdf } from '../../utils/pdfProcessor';

function ProtectOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Password</label>
      <input
        type="password"
        value={(options.password as string) || ''}
        onChange={(e) => setOptions({ ...options, password: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
        placeholder="Enter password to protect PDF"
      />
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const password = (options?.password as string) || 'default';
  const blob = await protectPdf(file, password);
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_protected.pdf') },
    info: { protection: 'Password protected', method: 'AES-256' },
  };
}

export default function ProtectPdf() {
  return <ToolPage processor={processor} optionsComponent={ProtectOptions} />;
}
