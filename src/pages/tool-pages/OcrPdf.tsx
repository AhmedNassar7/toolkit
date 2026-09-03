import ToolPage, { type ProcessResult } from '../ToolPage';
import { ocrDocument, OCR_LANGUAGES } from '../../utils/ocrProcessor';

function OcrOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const lang = (options.lang as string) ?? 'eng';
  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Document language</label>
      <select
        value={lang}
        onChange={(e) => setOptions((prev) => ({ ...prev, lang: e.target.value }))}
        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
      >
        {OCR_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      {lang !== 'eng' && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          English runs fully offline. Other languages download their recognition data
          (~1–15 MB) from the Tesseract project the first time you use them.
        </p>
      )}
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const lang = (options?.lang as string) ?? 'eng';
  const { pdf, text, pages, words } = await ocrDocument(file, { lang });
  const base = file.name.replace(/\.[^.]+$/, '') || 'document';
  const langLabel = OCR_LANGUAGES.find((l) => l.code === lang)?.label ?? lang;

  return {
    blobs: [
      { blob: pdf, name: `${base}_ocr.pdf` },
      { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: `${base}.txt` },
    ],
    info: {
      pages,
      words,
      language: langLabel,
    },
  };
}

export default function OcrPdf() {
  return <ToolPage processor={processor} optionsComponent={OcrOptions} />;
}
