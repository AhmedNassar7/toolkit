import { useRef, useState, useCallback, useEffect } from 'react';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { signPdf, type SignatureAnchor, type SignatureTarget } from '../../utils/pdfProcessor';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

type SignatureMode = 'draw' | 'type' | 'upload';

const anchors: { value: SignatureAnchor; label: string }[] = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

const signatureFonts: { value: string; label: string }[] = [
  { value: "'Great Vibes', cursive", label: 'Elegant' },
  { value: "'Dancing Script', cursive", label: 'Casual' },
  { value: "'Sacramento', cursive", label: 'Monoline' },
  { value: "'Pacifico', cursive", label: 'Bold' },
];

const modeTabs: { value: SignatureMode; label: string }[] = [
  { value: 'draw', label: 'Draw' },
  { value: 'type', label: 'Type' },
  { value: 'upload', label: 'Upload' },
];

/** Render typed text in a script font onto a transparent PNG data URL. */
async function renderTypedSignature(name: string, fontStack: string): Promise<string | undefined> {
  const trimmed = name.trim();
  if (!trimmed) return undefined;

  const fontSize = 96;
  // Make sure the web font is loaded before we rasterize, otherwise canvas
  // falls back to a serif and the signature looks wrong.
  try {
    await document.fonts.load(`${fontSize}px ${fontStack}`, trimmed);
    await document.fonts.ready;
  } catch {
    // Font loading is best-effort; fall through and draw with whatever is ready.
  }

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return undefined;
  measureCtx.font = `${fontSize}px ${fontStack}`;
  const metrics = measureCtx.measureText(trimmed);
  const padX = fontSize * 0.4;
  const padY = fontSize * 0.4;
  const width = Math.ceil(metrics.width + padX * 2);
  const height = Math.ceil(fontSize * 1.6 + padY);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(trimmed, width / 2, height / 2);

  return canvas.toDataURL('image/png');
}

function SignatureOptions({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [hasSignature, setHasSignature] = useState(Boolean(options.signatureDataUrl));
  const [typedName, setTypedName] = useState((options.typedName as string) ?? '');
  const [typedFont, setTypedFont] = useState((options.typedFont as string) ?? signatureFonts[0].value);

  const getContext = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [getContext]);

  // Live-render the typed signature into the preview canvas and the option payload.
  useEffect(() => {
    if (mode !== 'type') return;
    let cancelled = false;

    (async () => {
      const dataUrl = await renderTypedSignature(typedName, typedFont);
      if (cancelled) return;

      clearCanvas();
      if (!dataUrl) {
        setHasSignature(false);
        setOptions({ ...options, signatureDataUrl: undefined, typedName, typedFont });
        return;
      }

      const canvas = canvasRef.current;
      const ctx = getContext();
      if (canvas && ctx) {
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        };
        img.src = dataUrl;
      }

      setHasSignature(true);
      setOptions({ ...options, signatureDataUrl: dataUrl, typedName, typedFont });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName, typedFont]);

  const switchMode = useCallback(
    (next: SignatureMode) => {
      if (next === mode) return;
      setMode(next);
      clearCanvas();
      if (next !== 'type') {
        setHasSignature(false);
        setOptions({ ...options, signatureDataUrl: undefined });
      }
    },
    [mode, clearCanvas, options, setOptions]
  );

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
      if (mode !== 'draw') return;
      const ctx = getContext();
      if (!ctx) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const { x, y } = pointFromEvent(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [mode, getContext, pointFromEvent]
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
    clearCanvas();
    setHasSignature(false);
    if (mode === 'type') setTypedName('');
    setOptions({ ...options, signatureDataUrl: undefined });
  }, [clearCanvas, mode, options, setOptions]);

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
        <div className="flex gap-1 p-1 mb-2 rounded-xl bg-gray-100 dark:bg-gray-800">
          {modeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchMode(tab.value)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                mode === tab.value
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'type' && (
          <div className="space-y-2 mb-2">
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type your full name"
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
            />
            <div className="grid grid-cols-2 gap-2">
              {signatureFonts.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setTypedFont(f.value)}
                  style={{ fontFamily: f.value }}
                  className={`px-3 py-2 rounded-xl border text-xl leading-tight truncate transition-colors ${
                    typedFont === f.value
                      ? 'border-red-500 ring-2 ring-red-500/30 text-gray-900 dark:text-gray-100'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {typedName.trim() || f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          {mode === 'draw'
            ? 'Draw your signature'
            : mode === 'type'
              ? 'Signature preview'
              : 'Uploaded signature'}
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
          className={`w-full h-[160px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white ${
            mode === 'draw' ? 'cursor-crosshair' : ''
          }`}
        />
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Clear
          </button>
          {mode === 'upload' && (
            <label className="text-xs font-medium text-red-500 hover:text-red-600 cursor-pointer">
              Choose signature image
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
        {!hasSignature && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {mode === 'draw'
              ? 'Draw above before signing.'
              : mode === 'type'
                ? 'Type your name above to generate an online signature.'
                : 'Upload a PNG or JPG image before signing.'}
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
    throw new Error('Draw, type, or upload a signature before signing the PDF.');
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
