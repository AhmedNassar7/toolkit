import { useRef, useState, useCallback, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ToolPage, { type ProcessResult } from '../ToolPage';
import {
  signPdf,
  type SignatureAnchor,
  type SignatureTarget,
  type SignaturePlacement,
} from '../../utils/pdfProcessor';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const MAX_RENDER_WIDTH = 640;
const STORAGE_KEY = 'toolkit:sign:last-signature';
const DEFAULT_ASPECT = 0.32; // signature height / width, until the real image loads

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

function readSavedSignature(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeSavedSignature(dataUrl: string | undefined) {
  try {
    if (dataUrl) localStorage.setItem(STORAGE_KEY, dataUrl);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode, quota, disabled).
  }
}

function SignatureOptions({
  options,
  setOptions,
  files,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
  files: File[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );

  const [mode, setMode] = useState<SignatureMode>('draw');
  const [hasSignature, setHasSignature] = useState(Boolean(options.signatureDataUrl));
  const [typedName, setTypedName] = useState((options.typedName as string) ?? '');
  const [typedFont, setTypedFont] = useState((options.typedFont as string) ?? signatureFonts[0].value);
  const [sigAspect, setSigAspect] = useState(DEFAULT_ASPECT);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(MAX_RENDER_WIDTH);
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  const signatureDataUrl = options.signatureDataUrl as string | undefined;
  const placement = options.placement as SignaturePlacement | undefined;

  const getContext = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [getContext]);

  const drawImageOntoCanvas = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    img.src = dataUrl;
  }, []);

  // Restore a previously used signature so returning users don't recreate it.
  useEffect(() => {
    if (options.signatureDataUrl) return;
    const saved = readSavedSignature();
    if (!saved) return;
    setOptions({ ...options, signatureDataUrl: saved });
    setHasSignature(true);
    setMode('upload');
    drawImageOntoCanvas(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the aspect ratio of the signature box in sync with the real image, and
  // persist the latest signature for next time.
  useEffect(() => {
    if (!signatureDataUrl) return;
    writeSavedSignature(signatureDataUrl);
    const img = new window.Image();
    img.onload = () => {
      if (img.width > 0) setSigAspect(img.height / img.width);
    };
    img.src = signatureDataUrl;
  }, [signatureDataUrl]);

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
      drawImageOntoCanvas(dataUrl);
      setHasSignature(true);
      setOptions({ ...options, signatureDataUrl: dataUrl, typedName, typedFont });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName, typedFont]);

  // Load the PDF with pdfjs for the placement preview.
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setNumPages(0);
    setPageIndex(0);
    setLoadError(false);
    if (files.length === 0) return;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
        const arrayBuffer = await files[0].arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files[0]]);

  // Track available width so the page render stays responsive.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.max(240, Math.floor(width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdfDoc, loadError]);

  // Render the current page to the preview canvas.
  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc) return;
    setRendering(true);

    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(containerWidth, MAX_RENDER_WIDTH);
      const nextScale = targetWidth / unscaled.width;
      const viewport = page.getViewport({ scale: nextScale });
      const previewCanvas = previewCanvasRef.current;
      if (!previewCanvas) return;
      previewCanvas.width = viewport.width;
      previewCanvas.height = viewport.height;
      const ctx = previewCanvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport } as never).promise;
      if (cancelled) return;
      setScale(nextScale);
      setPageSize({ width: unscaled.width, height: unscaled.height });
      setRendering(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex, containerWidth]);

  // Seed a default placement once we know the page size and have a signature.
  useEffect(() => {
    if (!pageSize || !signatureDataUrl || placement) return;
    const widthRatio = 0.25;
    const drawHeightRatio = widthRatio * sigAspect * (pageSize.width / pageSize.height);
    setOptions({
      ...options,
      placement: {
        pageIndex,
        widthRatio,
        xRatio: Math.max(0, 1 - widthRatio - 0.04),
        yRatio: Math.max(0, 1 - drawHeightRatio - 0.04),
        allPages: false,
      } satisfies SignaturePlacement,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, signatureDataUrl, sigAspect]);

  // Keep the placement bound to whichever page is on screen.
  useEffect(() => {
    if (!placement || placement.pageIndex === pageIndex) return;
    setOptions({ ...options, placement: { ...placement, pageIndex } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex]);

  const updatePlacement = useCallback(
    (patch: Partial<SignaturePlacement>) => {
      if (!placement) return;
      const next = { ...placement, ...patch };
      if (!pageSize) {
        setOptions({ ...options, placement: next });
        return;
      }
      const drawHeightRatio = next.widthRatio * sigAspect * (pageSize.width / pageSize.height);
      next.xRatio = Math.min(Math.max(0, next.xRatio), Math.max(0, 1 - next.widthRatio));
      next.yRatio = Math.min(Math.max(0, next.yRatio), Math.max(0, 1 - drawHeightRatio));
      setOptions({ ...options, placement: next });
    },
    [placement, pageSize, sigAspect, options, setOptions]
  );

  // ---- Signature capture (draw / type / upload) ----

  const switchMode = useCallback(
    (next: SignatureMode) => {
      if (next === mode) return;
      setMode(next);
      clearCanvas();
      if (next !== 'type') {
        setHasSignature(false);
        setOptions({ ...options, signatureDataUrl: undefined, placement: undefined });
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
    setOptions({ ...options, signatureDataUrl: undefined, placement: undefined });
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
        drawImageOntoCanvas(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [drawImageOntoCanvas, options, setOptions]
  );

  // ---- Placement drag ----

  const boxPx = pageSize
    ? {
        w: (placement?.widthRatio ?? 0.25) * pageSize.width * scale,
      }
    : null;
  const boxHeightPx = boxPx ? boxPx.w * sigAspect : 0;

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placement || !pageSize || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    updatePlacement({
      xRatio: cx - placement.widthRatio / 2,
      yRatio: cy - (placement.widthRatio * sigAspect * (pageSize.width / pageSize.height)) / 2,
    });
  };

  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placement) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: placement.xRatio,
      originY: placement.yRatio,
    };
  };

  const handleBoxPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    updatePlacement({
      xRatio: drag.originX + (e.clientX - drag.startX) / rect.width,
      yRatio: drag.originY + (e.clientY - drag.startY) / rect.height,
    });
  };

  const handleBoxPointerUp = () => {
    dragRef.current = null;
  };

  const widthPercentValue = (options.widthPercent as number) ?? 25;

  return (
    <div className="space-y-4">
      {/* --- Capture --- */}
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

      {/* --- Placement --- */}
      {files.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Upload a PDF above to position your signature on the page.
        </p>
      ) : loadError ? (
        <FallbackPlacement options={options} setOptions={setOptions} widthPercent={widthPercentValue} />
      ) : !pdfDoc ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading page preview…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600 dark:text-gray-400">
              {hasSignature ? 'Drag your signature where it belongs' : 'Add a signature above first'}
            </label>
            {numPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  disabled={pageIndex === 0}
                  className="p-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {pageIndex + 1} / {numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPageIndex((p) => Math.min(numPages - 1, p + 1))}
                  disabled={pageIndex === numPages - 1}
                  className="p-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div
            ref={containerRef}
            className="w-full flex justify-center bg-gray-100 dark:bg-gray-950 rounded-xl p-3 overflow-x-auto"
          >
            <div
              className="relative shrink-0"
              style={{ width: pageSize ? pageSize.width * scale : undefined }}
            >
              <canvas ref={previewCanvasRef} className="block shadow-md rounded-sm" />
              {pageSize && (
                <div
                  ref={overlayRef}
                  onPointerDown={handleOverlayPointerDown}
                  className="absolute inset-0"
                  style={{ touchAction: 'none', opacity: rendering ? 0.4 : 1, cursor: 'crosshair' }}
                >
                  {hasSignature && signatureDataUrl && placement && (
                    <div
                      onPointerDown={handleBoxPointerDown}
                      onPointerMove={handleBoxPointerMove}
                      onPointerUp={handleBoxPointerUp}
                      className="absolute outline outline-2 outline-red-500/70 cursor-move"
                      style={{
                        left: placement.xRatio * pageSize.width * scale,
                        top: placement.yRatio * pageSize.height * scale,
                        width: boxPx?.w,
                        height: boxHeightPx,
                      }}
                    >
                      <img
                        src={signatureDataUrl}
                        alt="signature"
                        draggable={false}
                        className="w-full h-full object-contain select-none pointer-events-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Size: {Math.round((placement?.widthRatio ?? 0.25) * 100)}% of page width
            </label>
            <input
              type="range"
              min="10"
              max="60"
              step="1"
              value={Math.round((placement?.widthRatio ?? 0.25) * 100)}
              onChange={(e) => updatePlacement({ widthRatio: parseInt(e.target.value, 10) / 100 })}
              disabled={!placement}
              className="w-full accent-red-500 disabled:opacity-40"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={placement?.allPages ?? false}
              onChange={(e) => updatePlacement({ allPages: e.target.checked })}
              disabled={!placement}
              className="accent-red-500"
            />
            Stamp this spot on every page
          </label>
        </div>
      )}
    </div>
  );
}

/** Corner-anchor controls used only when the PDF can't be rendered for preview. */
function FallbackPlacement({
  options,
  setOptions,
  widthPercent,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
  widthPercent: number;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-600 dark:text-amber-500">
        Couldn't render this PDF for preview — placing by corner instead.
      </p>
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
          Size: {widthPercent}% of page width
        </label>
        <input
          type="range"
          min="10"
          max="50"
          step="5"
          value={widthPercent}
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

  const placement = options?.placement as SignaturePlacement | undefined;

  if (placement) {
    const blob = await signPdf(file, signatureDataUrl, { placement });
    return {
      singleBlob: { blob, name: file.name.replace(/\.pdf$/i, '_signed.pdf') },
      info: {
        page: placement.allPages ? 'All pages' : `Page ${placement.pageIndex + 1}`,
        size: `${Math.round(placement.widthRatio * 100)}% width`,
      },
    };
  }

  const target = (options?.target as SignatureTarget) ?? 'last';
  const anchor = (options?.anchor as SignatureAnchor) ?? 'bottom-right';
  const widthPercent = (options?.widthPercent as number) ?? 25;

  const blob = await signPdf(file, signatureDataUrl, { target, anchor, widthPercent });
  return {
    singleBlob: { blob, name: file.name.replace(/\.pdf$/i, '_signed.pdf') },
    info: {
      page: target === 'all' ? 'All pages' : target === 'first' ? 'First page' : 'Last page',
      position: anchors.find((a) => a.value === anchor)?.label ?? anchor,
    },
  };
}

export default function SignPdf() {
  return <ToolPage processor={processor} optionsComponent={SignatureOptions} />;
}
