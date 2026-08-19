import { useEffect, useState } from 'react';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { comparePdfs, buildCompareReport, type CompareResult, type PageComparisonResult } from '../../utils/pdfProcessor';
import { CheckCircle2, AlertTriangle, FileX2, Loader2 } from 'lucide-react';

const STATUS_META: Record<PageComparisonResult['status'], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  identical: { label: 'Identical', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400', icon: CheckCircle2 },
  changed: { label: 'Changed', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400', icon: AlertTriangle },
  'only-in-a': { label: 'Only in first file', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', icon: FileX2 },
  'only-in-b': { label: 'Only in second file', className: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400', icon: FileX2 },
};

function ComparePdfOptions({
  options,
  setOptions,
  files,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
  files: File[];
}) {
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = options.result as CompareResult | undefined;

  useEffect(() => {
    if (files.length !== 2) {
      if (options.result !== undefined) setOptions({});
      return;
    }

    let cancelled = false;
    setComparing(true);
    setError(null);

    comparePdfs(files[0], files[1])
      .then((res) => {
        if (cancelled) return;
        setOptions({ result: res });
      })
      .catch(() => {
        if (!cancelled) setError('Could not compare these PDFs. One of them may be corrupted or password protected.');
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files[0], files[1]]);

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Upload two PDFs above to compare them.</p>;
  }

  if (files.length === 1) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Upload a second PDF to compare against the first.</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (comparing || !result) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Comparing pages...
      </div>
    );
  }

  const changed = result.pages.filter((p) => p.status === 'changed').length;
  const identical = result.pages.filter((p) => p.status === 'identical').length;
  const onlyInA = result.pages.filter((p) => p.status === 'only-in-a').length;
  const onlyInB = result.pages.filter((p) => p.status === 'only-in-b').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">Changed</p>
          <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">{changed}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">Identical</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">{identical}</p>
        </div>
        {onlyInA > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">Only in first</p>
            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{onlyInA}</p>
          </div>
        )}
        {onlyInB > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">Only in second</p>
            <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">{onlyInB}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {result.pages.map((p) => {
          const meta = STATUS_META[p.status];
          const Icon = meta.icon;
          return (
            <div key={p.pageIndex} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Page {p.pageIndex + 1}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.className}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                  {p.status === 'changed' && p.diffPercent !== undefined ? ` - ${p.diffPercent.toFixed(1)}%` : ''}
                </span>
              </div>
              <div className="flex gap-3 flex-wrap">
                {p.thumbA && (
                  <figure className="m-0">
                    <img src={p.thumbA} alt="" className="w-28 rounded-lg border border-gray-200 dark:border-gray-700" />
                    <figcaption className="text-[10px] text-gray-400 text-center mt-1">{files[0].name}</figcaption>
                  </figure>
                )}
                {p.thumbDiff && (
                  <figure className="m-0">
                    <img src={p.thumbDiff} alt="" className="w-28 rounded-lg border border-gray-200 dark:border-gray-700" />
                    <figcaption className="text-[10px] text-gray-400 text-center mt-1">Diff</figcaption>
                  </figure>
                )}
                {p.thumbB && (
                  <figure className="m-0">
                    <img src={p.thumbB} alt="" className="w-28 rounded-lg border border-gray-200 dark:border-gray-700" />
                    <figcaption className="text-[10px] text-gray-400 text-center mt-1">{files[1].name}</figcaption>
                  </figure>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  if (files.length !== 2) {
    throw new Error('Upload exactly two PDFs to compare.');
  }
  const result = options?.result as CompareResult | undefined;
  if (!result) {
    throw new Error('Comparison is still running - wait a moment and try again.');
  }

  const blob = buildCompareReport(result, files[0].name, files[1].name);
  const changed = result.pages.filter((p) => p.status === 'changed').length;
  const identical = result.pages.filter((p) => p.status === 'identical').length;
  const onlyInA = result.pages.filter((p) => p.status === 'only-in-a').length;
  const onlyInB = result.pages.filter((p) => p.status === 'only-in-b').length;

  return {
    singleBlob: { blob, name: 'comparison-report.html' },
    info: {
      pages_compared: result.pages.length,
      changed,
      identical,
      ...(onlyInA ? { only_in_first: onlyInA } : {}),
      ...(onlyInB ? { only_in_second: onlyInB } : {}),
    },
  };
}

export default function ComparePdf() {
  return <ToolPage processor={processor} optionsComponent={ComparePdfOptions} />;
}
