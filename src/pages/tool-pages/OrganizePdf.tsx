import { useEffect, useState } from 'react';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { organizePdf, getPdfInfo } from '../../utils/pdfProcessor';
import { ArrowUp, ArrowDown, X } from 'lucide-react';

function OrganizeOptions({
  options,
  setOptions,
  files,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
  files: File[];
}) {
  const [loading, setLoading] = useState(false);
  const order = (options.pageOrder as number[]) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (files.length === 0) return;
    setLoading(true);
    getPdfInfo(files[0])
      .then((info) => {
        if (cancelled) return;
        setOptions({ ...options, pageOrder: Array.from({ length: info.pages }, (_, i) => i) });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files[0]]);

  if (loading || !order) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Reading page count...</p>;
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOptions({ ...options, pageOrder: next });
  };

  const remove = (index: number) => {
    const next = order.filter((_, i) => i !== index);
    setOptions({ ...options, pageOrder: next });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Reorder or remove pages ({order.length} of {order.length} kept)
      </p>
      {order.map((pageIndex, i) => (
        <div
          key={pageIndex}
          className="flex items-center justify-between px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Page {pageIndex + 1}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={order.length <= 1}
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const pageOrder = options?.pageOrder as number[] | undefined;
  if (!pageOrder || pageOrder.length === 0) {
    throw new Error('At least one page must remain in the document.');
  }
  const blob = await organizePdf(file, pageOrder);
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_organized.pdf') },
    info: { pages: pageOrder.length },
  };
}

export default function OrganizePdf() {
  return <ToolPage processor={processor} optionsComponent={OrganizeOptions} />;
}
