import { useRef, useState, useCallback } from 'react';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { signPdf, type SignatureAnchor, type SignatureTarget } from '../../utils/pdfProcessor';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

const anchors: { value: SignatureAnchor; label: string }[] = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

function SignatureOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(Boolean(options.signatureDataUrl));

  const getContext = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const ctx = getContext();
      if (!ctx) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const { x, y } = pointFromEvent(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [getContext, pointFromEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const ctx = getContext();
      if (!ctx) return;
      const { x, y } = pointFromEvent(e);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111827';
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [getContext, pointFromEvent]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHasSignature(true);
    setOptions({ ...options, signatureDataUrl: canvas.toDataURL('image/png') });
  }, [options, setOptions]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setOptions({ ...options, signatureDataUrl: undefined });
  }, [getContext, options, setOptions]);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setOptions({ ...options, signatureDataUrl: dataUrl });
        setHasSignature(true);

        const canvas = canvasRef.current;
        const ctx = getContext();
        if (!canvas || !ctx) return;
        const img = new window.Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [getContext, options, setOptions]
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Draw your signature
        </label>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ touchAction: 'none' }}
          className="w-full h-[160px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white cursor-crosshair"
        />
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Clear
          </button>
          <label className="text-xs font-medium text-red-500 hover:text-red-600 cursor-pointer">
            Upload signature image instead
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
        {!hasSignature && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Draw above or upload an image before signing.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Apply to</label>
        <select
          value={(options.target as SignatureTarget) ?? 'last'}
          onChange={(e) => setOptions({ ...options, target: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
        >
          <option value="last">Last page</option>
          <option value="first">First page</option>
          <option value="all">All pages</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Position</label>
        <select
          value={(options.anchor as SignatureAnchor) ?? 'bottom-right'}
          onChange={(e) => setOptions({ ...options, anchor: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
        >
          {anchors.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Size: {(options.widthPercent as number) ?? 25}% of page width
        </label>
        <input
          type="range"
          min="10"
          max="50"
          step="5"
          value={(options.widthPercent as number) ?? 25}
          onChange={(e) => setOptions({ ...options, widthPercent: parseInt(e.target.value, 10) })}
          className="w-full accent-red-500"
        />
      </div>
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const signatureDataUrl = options?.signatureDataUrl as string | undefined;
  if (!signatureDataUrl) {
    throw new Error('Draw or upload a signature before signing the PDF.');
  }

  const target = (options?.target as SignatureTarget) ?? 'last';
  const anchor = (options?.anchor as SignatureAnchor) ?? 'bottom-right';
  const widthPercent = (options?.widthPercent as number) ?? 25;

  const blob = await signPdf(file, signatureDataUrl, { target, anchor, widthPercent });
  return {
    singleBlob: { blob, name: file.name.replace('.pdf', '_signed.pdf') },
    info: {
      page: target === 'all' ? 'All pages' : target === 'first' ? 'First page' : 'Last page',
      position: anchors.find((a) => a.value === anchor)?.label ?? anchor,
    },
  };
}

export default function SignPdf() {
  return <ToolPage processor={processor} optionsComponent={SignatureOptions} />;
}
