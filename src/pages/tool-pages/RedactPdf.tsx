import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { redactPdf, type RedactBox } from '../../utils/pdfProcessor';
import { MousePointer2, Square, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';

type ToolMode = 'draw' | 'select';

const MAX_RENDER_WIDTH = 720;
const MIN_BOX_SIZE = 4;

interface RedactBoxUI extends RedactBox {
  id: string;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `box-${Date.now()}-${idCounter}`;
}

function RedactPdfOptions({
  options,
  setOptions,
  files,
}: {
  options: Record<string, unknown>;
  setOptions: (o: Record<string, unknown>) => void;
  files: File[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawStateRef = useRef<{ startX: number; startY: number } | null>(null);
  const dragStateRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(MAX_RENDER_WIDTH);
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  const [mode, setMode] = useState<ToolMode>('draw');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const boxes = (options.boxes as RedactBoxUI[] | undefined) ?? [];
  const pageBoxes = boxes.filter((b) => b.pageIndex === pageIndex);

  // Load the PDF with pdfjs so pages can be rendered for the editor preview.
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setNumPages(0);
    setPageIndex(0);
    setLoadError(null);
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
        if (!cancelled) setLoadError('Could not read this PDF. It may be corrupted or password protected.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files[0]]);

  // Track available width so the page render fits its container responsively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.max(240, Math.floor(width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render the current page to the background canvas at a scale that fits the container.
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
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
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

  useEffect(() => {
    setSelectedId(null);
  }, [pageIndex]);

  const setBoxes = (next: RedactBoxUI[]) => {
    setOptions({ ...options, boxes: next });
  };

  const updateBox = (id: string, patch: Partial<RedactBoxUI>) => {
    setBoxes(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBox = (id: string) => {
    setBoxes(boxes.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  const pointFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'select') {
      setSelectedId(null);
      return;
    }
    const { x, y } = pointFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawStateRef.current = { startX: x, startY: y };
    setDrawPreview({ x, y, width: 0, height: 0 });
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'draw' || !drawStateRef.current) return;
    const { x, y } = pointFromEvent(e);
    const { startX, startY } = drawStateRef.current;
    setDrawPreview({
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
    });
  };

  const handleOverlayPointerUp = () => {
    if (mode !== 'draw' || !drawStateRef.current) return;
    drawStateRef.current = null;
    const box = drawPreview;
    setDrawPreview(null);
    if (!box || box.width < MIN_BOX_SIZE || box.height < MIN_BOX_SIZE) return;
    const newBox: RedactBoxUI = { id: newId(), pageIndex, ...box };
    setBoxes([...boxes, newBox]);
    setSelectedId(newBox.id);
  };

  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>, box: RedactBoxUI) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(box.id);
    dragStateRef.current = { id: box.id, startX: e.clientX, startY: e.clientY, originX: box.x, originY: box.y };
  };

  const handleBoxPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    updateBox(drag.id, { x: drag.originX + dx, y: drag.originY + dy });
  };

  const handleBoxPointerUp = () => {
    dragStateRef.current = null;
  };

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Upload a PDF above to start redacting.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-500">{loadError}</p>;
  }

  if (!pdfDoc) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading PDF preview...</p>;
  }

  const selected = boxes.find((b) => b.id === selectedId) ?? null;

  const modeButtons: { value: ToolMode; label: string; icon: typeof MousePointer2 }[] = [
    { value: 'draw', label: 'Draw redaction box', icon: Square },
    { value: 'select', label: 'Select & move', icon: MousePointer2 },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {modeButtons.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => setMode(value)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              mode === value
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Draw a box over anything you want permanently removed. Redacted pages are flattened to an image so the
        text and graphics underneath can't be recovered - pages with no boxes keep their original quality.
      </p>

      {/* Page navigation */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {pageIndex + 1} of {numPages}
            {pageBoxes.length > 0 ? ` - ${pageBoxes.length} box${pageBoxes.length === 1 ? '' : 'es'}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(numPages - 1, p + 1))}
            disabled={pageIndex === numPages - 1}
            className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page canvas */}
      <div ref={containerRef} className="w-full flex justify-center bg-gray-100 dark:bg-gray-950 rounded-xl p-4 overflow-x-auto">
        <div className="relative shrink-0" style={{ width: pageSize ? pageSize.width * scale : undefined }}>
          <canvas ref={canvasRef} className="block shadow-md rounded-sm" />
          {pageSize && (
            <div
              ref={overlayRef}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              className="absolute inset-0"
              style={{
                cursor: mode === 'draw' ? 'crosshair' : 'default',
                touchAction: 'none',
                opacity: rendering ? 0.4 : 1,
              }}
            >
              {pageBoxes.map((box) => {
                const isSelected = selectedId === box.id;
                return (
                  <div
                    key={box.id}
                    onPointerDown={(e) => handleBoxPointerDown(e, box)}
                    onPointerMove={handleBoxPointerMove}
                    onPointerUp={handleBoxPointerUp}
                    className={`absolute bg-black ${mode === 'select' ? 'cursor-move' : ''} ${
                      isSelected ? 'outline outline-2 outline-purple-400' : ''
                    }`}
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.width * scale,
                      height: box.height * scale,
                    }}
                  >
                    {isSelected && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeBox(box.id)}
                        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {drawPreview && (
                <div
                  className="absolute bg-black/60 border border-purple-400"
                  style={{
                    left: drawPreview.x * scale,
                    top: drawPreview.y * scale,
                    width: drawPreview.width * scale,
                    height: drawPreview.height * scale,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected box properties */}
      {selected && (
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Redaction box</h4>
            <button
              type="button"
              onClick={() => removeBox(selected.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Width
              <input
                type="number"
                min={MIN_BOX_SIZE}
                value={Math.round(selected.width)}
                onChange={(e) => updateBox(selected.id, { width: Math.max(MIN_BOX_SIZE, parseInt(e.target.value, 10) || MIN_BOX_SIZE) })}
                className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
              />
              pt
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Height
              <input
                type="number"
                min={MIN_BOX_SIZE}
                value={Math.round(selected.height)}
                onChange={(e) => updateBox(selected.id, { height: Math.max(MIN_BOX_SIZE, parseInt(e.target.value, 10) || MIN_BOX_SIZE) })}
                className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
              />
              pt
            </label>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {boxes.length === 0
          ? 'Drag on the page to draw a redaction box. Switch to select to move or delete one.'
          : `${boxes.length} box${boxes.length === 1 ? '' : 'es'} across ${new Set(boxes.map((b) => b.pageIndex)).size} page(s).`}
      </p>
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const boxes = (options?.boxes as RedactBoxUI[] | undefined) ?? [];
  if (boxes.length === 0) {
    throw new Error('Draw at least one redaction box before saving.');
  }

  const blob = await redactPdf(file, boxes);
  const pagesRedacted = new Set(boxes.map((b) => b.pageIndex)).size;

  return {
    singleBlob: { blob, name: file.name.replace(/\.pdf$/i, '_redacted.pdf') },
    info: { boxes: boxes.length, pages: pagesRedacted },
  };
}

export default function RedactPdf() {
  return <ToolPage processor={processor} optionsComponent={RedactPdfOptions} />;
}
