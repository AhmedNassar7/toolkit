import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ToolPage, { type ProcessResult } from '../ToolPage';
import {
  editPdf,
  type EditElement,
  type EditFontFamily,
  type EditFreehandElement,
  type EditImageElement,
  type EditShapeElement,
  type EditTextElement,
} from '../../utils/pdfProcessor';
import {
  MousePointer2,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

type ToolMode = 'select' | 'text' | 'rect' | 'ellipse' | 'freehand';

const MAX_RENDER_WIDTH = 720;

const FONT_OPTIONS: { value: EditFontFamily; label: string; css: string }[] = [
  { value: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { value: 'HelveticaBold', label: 'Helvetica Bold', css: 'Helvetica, Arial, sans-serif' },
  { value: 'TimesRoman', label: 'Times Roman', css: '"Times New Roman", Times, serif' },
  { value: 'Courier', label: 'Courier', css: '"Courier New", Courier, monospace' },
];

function fontCss(family: EditFontFamily): string {
  return FONT_OPTIONS.find((f) => f.value === family)?.css ?? 'sans-serif';
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `el-${Date.now()}-${idCounter}`;
}

function svgPathFromPoints(points: { x: number; y: number }[], scale: number): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x * scale).toFixed(1)},${(p.y * scale).toFixed(1)}`)
    .join(' ');
}

function EditPdfOptions({
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const freehandRef = useRef<{ startX: number; startY: number; points: { x: number; y: number }[] } | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(MAX_RENDER_WIDTH);
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  const [mode, setMode] = useState<ToolMode>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<{ x: number; y: number }[] | null>(null);

  const [creationColor, setCreationColor] = useState('#dc2626');
  const [creationFillEnabled, setCreationFillEnabled] = useState(false);
  const [creationFillColor, setCreationFillColor] = useState('#fde68a');
  const [creationStrokeWidth, setCreationStrokeWidth] = useState(3);
  const [creationFontSize, setCreationFontSize] = useState(20);
  const [creationFontFamily, setCreationFontFamily] = useState<EditFontFamily>('Helvetica');

  const elements = (options.elements as EditElement[] | undefined) ?? [];
  const pageElements = elements.filter((el) => el.pageIndex === pageIndex);
  const selected = elements.find((el) => el.id === selectedId) ?? null;

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

  const addElement = (el: EditElement) => {
    setOptions({ ...options, elements: [...elements, el] });
    setSelectedId(el.id);
  };

  const updateElement = (id: string, patch: Record<string, unknown>) => {
    setOptions({
      ...options,
      elements: elements.map((el) => (el.id === id ? ({ ...el, ...patch } as EditElement) : el)),
    });
  };

  const removeElement = (id: string) => {
    setOptions({ ...options, elements: elements.filter((el) => el.id !== id) });
    setSelectedId(null);
  };

  const pointFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = pointFromEvent(e);

    if (mode === 'select') {
      setSelectedId(null);
      return;
    }

    if (mode === 'text') {
      const el: EditTextElement = {
        id: newId(),
        type: 'text',
        pageIndex,
        x,
        y,
        text: 'New text',
        fontSize: creationFontSize,
        color: creationColor,
        fontFamily: creationFontFamily,
      };
      addElement(el);
      setMode('select');
      return;
    }

    if (mode === 'rect' || mode === 'ellipse') {
      const width = mode === 'rect' ? 140 : 110;
      const height = mode === 'rect' ? 90 : 110;
      const el: EditShapeElement = {
        id: newId(),
        type: mode,
        pageIndex,
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        strokeColor: creationColor,
        strokeWidth: creationStrokeWidth,
        opacity: 1,
        fillColor: creationFillEnabled ? creationFillColor : undefined,
      };
      addElement(el);
      setMode('select');
      return;
    }

    if (mode === 'freehand') {
      e.currentTarget.setPointerCapture(e.pointerId);
      freehandRef.current = { startX: x, startY: y, points: [{ x: 0, y: 0 }] };
      setDrawingPreview([{ x: 0, y: 0 }]);
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'freehand' || !freehandRef.current) return;
    const { x, y } = pointFromEvent(e);
    const rel = { x: x - freehandRef.current.startX, y: y - freehandRef.current.startY };
    freehandRef.current.points.push(rel);
    setDrawingPreview([...freehandRef.current.points]);
  };

  const handleOverlayPointerUp = () => {
    if (mode !== 'freehand' || !freehandRef.current) return;
    const { startX, startY, points } = freehandRef.current;
    freehandRef.current = null;
    setDrawingPreview(null);
    if (points.length < 2) return;
    const el: EditFreehandElement = {
      id: newId(),
      type: 'freehand',
      pageIndex,
      x: startX,
      y: startY,
      points,
      color: creationColor,
      strokeWidth: creationStrokeWidth,
    };
    addElement(el);
  };

  const handleElementPointerDown = (e: React.PointerEvent<HTMLDivElement>, el: EditElement) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(el.id);
    dragStateRef.current = { id: el.id, startX: e.clientX, startY: e.clientY, originX: el.x, originY: el.y };
  };

  const handleElementPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    updateElement(drag.id, { x: drag.originX + dx, y: drag.originY + dy });
  };

  const handleElementPointerUp = () => {
    dragStateRef.current = null;
  };

  const handleImageButtonClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        const pageWidthPt = pageSize?.width ?? 612;
        const pageHeightPt = pageSize?.height ?? 792;
        const width = Math.min(pageWidthPt * 0.4, img.width);
        const height = width * (img.height / img.width);
        const el: EditImageElement = {
          id: newId(),
          type: 'image',
          pageIndex,
          x: (pageWidthPt - width) / 2,
          y: (pageHeightPt - height) / 2,
          width,
          height,
          dataUrl,
        };
        addElement(el);
        setMode('select');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Upload a PDF above to start editing.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-500">{loadError}</p>;
  }

  if (!pdfDoc) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading PDF preview...</p>;
  }

  const modeButtons: { value: ToolMode; label: string; icon: typeof MousePointer2 }[] = [
    { value: 'select', label: 'Select & move', icon: MousePointer2 },
    { value: 'text', label: 'Add text', icon: Type },
    { value: 'rect', label: 'Rectangle', icon: Square },
    { value: 'ellipse', label: 'Ellipse', icon: Circle },
    { value: 'freehand', label: 'Draw', icon: Pencil },
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
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <button
          type="button"
          title="Add image"
          onClick={handleImageButtonClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <ImageIcon className="w-4 h-4" />
          Add image
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {/* Contextual style controls for the next element to be created */}
      {(mode === 'text' || mode === 'rect' || mode === 'ellipse' || mode === 'freehand') && (
        <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            Color
            <input
              type="color"
              value={creationColor}
              onChange={(e) => setCreationColor(e.target.value)}
              className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
          </label>

          {mode === 'text' && (
            <>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Font
                <select
                  value={creationFontFamily}
                  onChange={(e) => setCreationFontFamily(e.target.value as EditFontFamily)}
                  className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Size: {creationFontSize}pt
                <input
                  type="range"
                  min="8"
                  max="72"
                  value={creationFontSize}
                  onChange={(e) => setCreationFontSize(parseInt(e.target.value, 10))}
                  className="accent-red-500"
                />
              </label>
            </>
          )}

          {(mode === 'rect' || mode === 'ellipse') && (
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={creationFillEnabled}
                onChange={(e) => setCreationFillEnabled(e.target.checked)}
              />
              Fill
              {creationFillEnabled && (
                <input
                  type="color"
                  value={creationFillColor}
                  onChange={(e) => setCreationFillColor(e.target.value)}
                  className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
              )}
            </label>
          )}

          {(mode === 'rect' || mode === 'ellipse' || mode === 'freehand') && (
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Stroke: {creationStrokeWidth}pt
              <input
                type="range"
                min="1"
                max="12"
                value={creationStrokeWidth}
                onChange={(e) => setCreationStrokeWidth(parseInt(e.target.value, 10))}
                className="accent-red-500"
              />
            </label>
          )}
        </div>
      )}

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
                cursor: mode === 'select' ? 'default' : 'crosshair',
                touchAction: 'none',
                opacity: rendering ? 0.4 : 1,
              }}
            >
              <svg
                width={pageSize.width * scale}
                height={pageSize.height * scale}
                className="absolute inset-0"
                style={{ pointerEvents: 'none' }}
              >
                {pageElements
                  .filter((el): el is EditFreehandElement => el.type === 'freehand')
                  .map((el) => (
                    <path
                      key={el.id}
                      d={svgPathFromPoints(el.points, scale)}
                      transform={`translate(${el.x * scale}, ${el.y * scale})`}
                      stroke={el.color}
                      strokeWidth={Math.max(1, el.strokeWidth * scale)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      style={{ pointerEvents: mode === 'select' ? 'stroke' : 'none', cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        if (mode !== 'select') return;
                        e.stopPropagation();
                        setSelectedId(el.id);
                      }}
                      opacity={selectedId === el.id ? 0.7 : 1}
                    />
                  ))}
                {drawingPreview && (
                  <path
                    d={svgPathFromPoints(drawingPreview, scale)}
                    transform={freehandRef.current ? `translate(${freehandRef.current.startX * scale}, ${freehandRef.current.startY * scale})` : undefined}
                    stroke={creationColor}
                    strokeWidth={Math.max(1, creationStrokeWidth * scale)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </svg>

              {pageElements
                .filter((el) => el.type !== 'freehand')
                .map((el) => {
                  const isSelected = selectedId === el.id;
                  const common = {
                    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => handleElementPointerDown(e, el),
                    onPointerMove: handleElementPointerMove,
                    onPointerUp: handleElementPointerUp,
                    className: `absolute ${mode === 'select' ? 'cursor-move' : 'cursor-crosshair'} ${
                      isSelected ? 'outline outline-2 outline-red-500' : 'hover:outline hover:outline-1 hover:outline-gray-400'
                    }`,
                    style: { left: el.x * scale, top: el.y * scale },
                  };

                  if (el.type === 'text') {
                    return (
                      <div key={el.id} {...common} style={{ ...common.style, maxWidth: pageSize.width * scale - el.x * scale }}>
                        <div
                          style={{
                            fontFamily: fontCss(el.fontFamily),
                            fontWeight: el.fontFamily === 'HelveticaBold' ? 700 : 400,
                            fontSize: el.fontSize * scale,
                            color: el.color,
                            whiteSpace: 'pre',
                            lineHeight: 1.2,
                          }}
                        >
                          {el.text || ' '}
                        </div>
                        {isSelected && <DeleteHandle onClick={() => removeElement(el.id)} />}
                      </div>
                    );
                  }

                  if (el.type === 'image') {
                    return (
                      <div key={el.id} {...common} style={{ ...common.style, width: el.width * scale, height: el.height * scale }}>
                        <img src={el.dataUrl} alt="" className="w-full h-full object-fill select-none pointer-events-none" draggable={false} />
                        {isSelected && <DeleteHandle onClick={() => removeElement(el.id)} />}
                      </div>
                    );
                  }

                  // rect / ellipse
                  return (
                    <div
                      key={el.id}
                      {...common}
                      style={{
                        ...common.style,
                        width: el.width * scale,
                        height: el.height * scale,
                        borderRadius: el.type === 'ellipse' ? '50%' : 0,
                        border: `${Math.max(1, el.strokeWidth * scale)}px solid ${el.strokeColor}`,
                        backgroundColor: el.fillColor ?? 'transparent',
                        opacity: el.opacity,
                      }}
                    >
                      {isSelected && <DeleteHandle onClick={() => removeElement(el.id)} />}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Selected element properties */}
      {selected && (
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">{selected.type} properties</h4>
            <button
              type="button"
              onClick={() => removeElement(selected.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>

          {selected.type === 'text' && (
            <div className="space-y-3">
              <textarea
                value={selected.text}
                onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Font
                  <select
                    value={selected.fontFamily}
                    onChange={(e) => updateElement(selected.id, { fontFamily: e.target.value as EditFontFamily })}
                    className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Size: {selected.fontSize}pt
                  <input
                    type="range"
                    min="8"
                    max="72"
                    value={selected.fontSize}
                    onChange={(e) => updateElement(selected.id, { fontSize: parseInt(e.target.value, 10) })}
                    className="accent-red-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Color
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                    className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  />
                </label>
              </div>
            </div>
          )}

          {selected.type === 'image' && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Width
                <input
                  type="number"
                  min="10"
                  value={Math.round(selected.width)}
                  onChange={(e) => {
                    const width = Math.max(10, parseInt(e.target.value, 10) || 10);
                    const aspect = selected.height / selected.width;
                    updateElement(selected.id, { width, height: width * aspect });
                  }}
                  className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                />
                pt
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Height
                <input
                  type="number"
                  min="10"
                  value={Math.round(selected.height)}
                  onChange={(e) => {
                    const height = Math.max(10, parseInt(e.target.value, 10) || 10);
                    const aspect = selected.width / selected.height;
                    updateElement(selected.id, { height, width: height * aspect });
                  }}
                  className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                />
                pt
              </label>
            </div>
          )}

          {(selected.type === 'rect' || selected.type === 'ellipse') && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Width
                <input
                  type="number"
                  min="10"
                  value={Math.round(selected.width)}
                  onChange={(e) => updateElement(selected.id, { width: Math.max(10, parseInt(e.target.value, 10) || 10) })}
                  className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Height
                <input
                  type="number"
                  min="10"
                  value={Math.round(selected.height)}
                  onChange={(e) => updateElement(selected.id, { height: Math.max(10, parseInt(e.target.value, 10) || 10) })}
                  className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Stroke
                <input
                  type="color"
                  value={selected.strokeColor}
                  onChange={(e) => updateElement(selected.id, { strokeColor: e.target.value })}
                  className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={selected.strokeWidth}
                  onChange={(e) => updateElement(selected.id, { strokeWidth: parseInt(e.target.value, 10) })}
                  className="accent-red-500"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={selected.fillColor !== undefined}
                  onChange={(e) => updateElement(selected.id, { fillColor: e.target.checked ? '#fde68a' : undefined })}
                />
                Fill
                {selected.fillColor !== undefined && (
                  <input
                    type="color"
                    value={selected.fillColor}
                    onChange={(e) => updateElement(selected.id, { fillColor: e.target.value })}
                    className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  />
                )}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Opacity: {Math.round(selected.opacity * 100)}%
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={selected.opacity}
                  onChange={(e) => updateElement(selected.id, { opacity: parseFloat(e.target.value) })}
                  className="accent-red-500"
                />
              </label>
            </div>
          )}

          {selected.type === 'freehand' && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Color
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                  className="h-7 w-9 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Stroke: {selected.strokeWidth}pt
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={selected.strokeWidth}
                  onChange={(e) => updateElement(selected.id, { strokeWidth: parseInt(e.target.value, 10) })}
                  className="accent-red-500"
                />
              </label>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {elements.length === 0
          ? 'Pick a tool above, then click (or draw) on the page to add it. Select an element to edit or delete it.'
          : `${elements.length} element${elements.length === 1 ? '' : 's'} added across ${new Set(elements.map((e) => e.pageIndex)).size} page(s).`}
      </p>
    </div>
  );
}

function DeleteHandle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const elements = (options?.elements as EditElement[] | undefined) ?? [];
  if (elements.length === 0) {
    throw new Error('Add at least one text box, image, shape, or drawing before saving.');
  }

  const blob = await editPdf(file, elements);
  const pagesTouched = new Set(elements.map((el) => el.pageIndex)).size;

  return {
    singleBlob: { blob, name: file.name.replace(/\.pdf$/i, '_edited.pdf') },
    info: { elements: elements.length, pages: pagesTouched },
  };
}

export default function EditPdf() {
  return <ToolPage processor={processor} optionsComponent={EditPdfOptions} />;
}
