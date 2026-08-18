import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ToolPage, { type ProcessResult } from '../ToolPage';
import {
  detectPdfFormFields,
  processPdfForm,
  type DetectedFormField,
  type FormFieldValue,
  type NewFormField,
} from '../../utils/pdfProcessor';
import { MousePointer2, Type, Square, Trash2, ChevronLeft, ChevronRight, X, FileInput } from 'lucide-react';

type FieldMode = 'fill' | 'create';
type DrawMode = 'select' | 'text' | 'checkbox';

const MAX_RENDER_WIDTH = 720;
const MIN_FIELD_SIZE = 6;

interface NewFieldUI extends NewFormField {
  id: string;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `field-${Date.now()}-${idCounter}`;
}

function PdfFormsOptions({
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

  const [detectedFields, setDetectedFields] = useState<DetectedFormField[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [fieldMode, setFieldMode] = useState<FieldMode>('create');

  const [drawMode, setDrawMode] = useState<DrawMode>('text');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const fieldValues = (options.fieldValues as FormFieldValue[] | undefined) ?? [];
  const newFields = (options.newFields as NewFieldUI[] | undefined) ?? [];
  const pageFields = newFields.filter((f) => f.pageIndex === pageIndex);
  const flatten = (options.flatten as boolean | undefined) ?? true;

  // Load with pdfjs (for the page preview) and detect any existing AcroForm fields (for fill mode).
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setNumPages(0);
    setPageIndex(0);
    setLoadError(null);
    setDetectedFields(null);
    setDetectError(null);
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

      try {
        const fields = await detectPdfFormFields(files[0]);
        if (cancelled) return;
        setDetectedFields(fields);
        const fillable = fields.filter((f) => f.type !== 'unsupported');
        if (fillable.length > 0) {
          setFieldMode('fill');
          setOptions({
            fieldValues: fillable.map(
              (f): FormFieldValue => ({
                name: f.name,
                type: f.type as FormFieldValue['type'],
                value: f.currentValue ?? (f.type === 'checkbox' ? false : ''),
              })
            ),
          });
        } else {
          setFieldMode('create');
        }
      } catch {
        if (!cancelled) setDetectError("Couldn't inspect this PDF for existing form fields.");
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
    // The canvas only mounts once detectedFields is also ready (a second, independent async
    // load) - without it in the deps, this can fire while canvasRef.current is still null and
    // never get a chance to retry once the canvas actually appears.
    if (!pdfDoc || fieldMode !== 'create' || detectedFields === null) return;
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
  }, [pdfDoc, pageIndex, containerWidth, fieldMode, detectedFields]);

  useEffect(() => {
    setSelectedId(null);
  }, [pageIndex]);

  const setNewFields = (next: NewFieldUI[]) => {
    setOptions({ ...options, newFields: next });
  };

  const updateNewField = (id: string, patch: Partial<NewFieldUI>) => {
    setNewFields(newFields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeNewField = (id: string) => {
    setNewFields(newFields.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  const setFieldValue = (field: DetectedFormField, value: string | boolean) => {
    const next = fieldValues.filter((v) => v.name !== field.name);
    next.push({ name: field.name, type: field.type as FormFieldValue['type'], value });
    setOptions({ ...options, fieldValues: next });
  };

  const pointFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawMode === 'select') {
      setSelectedId(null);
      return;
    }
    const { x, y } = pointFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawStateRef.current = { startX: x, startY: y };
    setDrawPreview({ x, y, width: 0, height: 0 });
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawMode === 'select' || !drawStateRef.current) return;
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
    if (drawMode === 'select' || !drawStateRef.current) return;
    drawStateRef.current = null;
    const box = drawPreview;
    setDrawPreview(null);
    if (!box) return;

    const width = drawMode === 'checkbox' ? Math.max(box.width, 18) : Math.max(box.width, 60);
    const height = drawMode === 'checkbox' ? Math.max(box.height, 18) : Math.max(box.height, 20);
    if (box.width < MIN_FIELD_SIZE && box.height < MIN_FIELD_SIZE) return;

    const ordinal = newFields.filter((f) => f.type === drawMode).length + 1;
    const field: NewFieldUI = {
      id: newId(),
      pageIndex,
      type: drawMode,
      name: `${drawMode === 'checkbox' ? 'Checkbox' : 'Text Field'} ${ordinal}`,
      x: box.x,
      y: box.y,
      width,
      height,
    };
    setNewFields([...newFields, field]);
    setSelectedId(field.id);
  };

  const handleFieldPointerDown = (e: React.PointerEvent<HTMLDivElement>, field: NewFieldUI) => {
    if (drawMode !== 'select') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(field.id);
    dragStateRef.current = { id: field.id, startX: e.clientX, startY: e.clientY, originX: field.x, originY: field.y };
  };

  const handleFieldPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    updateNewField(drag.id, { x: drag.originX + dx, y: drag.originY + dy });
  };

  const handleFieldPointerUp = () => {
    dragStateRef.current = null;
  };

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Upload a PDF above to work with its form fields.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-500">{loadError}</p>;
  }

  if (!pdfDoc || detectedFields === null) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading PDF...</p>;
  }

  const fillableFields = detectedFields.filter((f) => f.type !== 'unsupported');
  const unsupportedCount = detectedFields.length - fillableFields.length;
  const selected = newFields.find((f) => f.id === selectedId) ?? null;

  const modeTabs: { value: FieldMode; label: string }[] = [
    { value: 'fill', label: `Fill existing fields${fillableFields.length ? ` (${fillableFields.length})` : ''}` },
    { value: 'create', label: 'Add new fields' },
  ];

  return (
    <div className="space-y-4">
      {detectError && <p className="text-xs text-amber-600 dark:text-amber-400">{detectError}</p>}

      {/* Mode tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {modeTabs.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFieldMode(value)}
            disabled={value === 'fill' && fillableFields.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              fieldMode === value
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <FileInput className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {fieldMode === 'fill' ? (
        <div className="space-y-4">
          {fillableFields.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This PDF has no fillable fields. Switch to "Add new fields" to draw some.
            </p>
          ) : (
            <div className="space-y-3">
              {fillableFields.map((field) => {
                const current = fieldValues.find((v) => v.name === field.name)?.value ?? field.currentValue ?? '';
                return (
                  <div
                    key={field.name}
                    className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                  >
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      {field.name}
                    </label>
                    {field.type === 'text' &&
                      (field.multiline ? (
                        <textarea
                          rows={3}
                          value={String(current)}
                          onChange={(e) => setFieldValue(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(current)}
                          onChange={(e) => setFieldValue(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                        />
                      ))}
                    {field.type === 'checkbox' && (
                      <input
                        type="checkbox"
                        checked={Boolean(current)}
                        onChange={(e) => setFieldValue(field, e.target.checked)}
                        className="w-5 h-5 accent-orange-500"
                      />
                    )}
                    {(field.type === 'dropdown' || field.type === 'optionlist') && (
                      <select
                        value={String(current)}
                        onChange={(e) => setFieldValue(field, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="" disabled>
                          Select...
                        </option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.type === 'radio' && (
                      <div className="flex flex-wrap gap-3">
                        {(field.options ?? []).map((opt) => (
                          <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="radio"
                              name={field.name}
                              checked={current === opt}
                              onChange={() => setFieldValue(field, opt)}
                              className="accent-orange-500"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {unsupportedCount > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {unsupportedCount} button/signature field{unsupportedCount === 1 ? '' : 's'} in this PDF can't be
                  edited here and will be left as-is.
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={flatten}
                  disabled={newFields.length > 0}
                  onChange={(e) => setOptions({ ...options, flatten: e.target.checked })}
                  className="accent-orange-500"
                />
                Flatten after filling (bakes values into the page, form can no longer be edited)
                {newFields.length > 0 && ' - disabled while new fields are being added'}
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { value: 'text', label: 'Text field', icon: Type },
                { value: 'checkbox', label: 'Checkbox', icon: Square },
                { value: 'select', label: 'Select & move', icon: MousePointer2 },
              ] as { value: DrawMode; label: string; icon: typeof Type }[]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                title={label}
                onClick={() => setDrawMode(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  drawMode === value
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Draw a box where you want a fillable field. The result stays interactive - open it in any PDF reader
            to fill it in later.
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
                {pageFields.length > 0 ? ` - ${pageFields.length} field${pageFields.length === 1 ? '' : 's'}` : ''}
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
                    cursor: drawMode === 'select' ? 'default' : 'crosshair',
                    touchAction: 'none',
                    opacity: rendering ? 0.4 : 1,
                  }}
                >
                  {pageFields.map((field) => {
                    const isSelected = selectedId === field.id;
                    return (
                      <div
                        key={field.id}
                        onPointerDown={(e) => handleFieldPointerDown(e, field)}
                        onPointerMove={handleFieldPointerMove}
                        onPointerUp={handleFieldPointerUp}
                        className={`absolute flex items-center justify-center bg-orange-400/20 border-2 border-dashed border-orange-500 ${
                          drawMode === 'select' ? 'cursor-move' : ''
                        } ${isSelected ? 'outline outline-2 outline-orange-600' : ''}`}
                        style={{
                          left: field.x * scale,
                          top: field.y * scale,
                          width: field.width * scale,
                          height: field.height * scale,
                        }}
                      >
                        <span className="text-[10px] leading-none text-orange-700 dark:text-orange-300 truncate px-1 pointer-events-none select-none">
                          {field.name}
                        </span>
                        {isSelected && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => removeNewField(field.id)}
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
                      className="absolute bg-orange-400/20 border-2 border-dashed border-orange-500"
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

          {/* Selected field properties */}
          {selected && (
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                  {selected.type === 'checkbox' ? 'Checkbox' : 'Text field'}
                </h4>
                <button
                  type="button"
                  onClick={() => removeNewField(selected.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Field name
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateNewField(selected.id, { name: e.target.value })}
                  className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Width
                  <input
                    type="number"
                    min={MIN_FIELD_SIZE}
                    value={Math.round(selected.width)}
                    onChange={(e) => updateNewField(selected.id, { width: Math.max(MIN_FIELD_SIZE, parseInt(e.target.value, 10) || MIN_FIELD_SIZE) })}
                    className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                  />
                  pt
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Height
                  <input
                    type="number"
                    min={MIN_FIELD_SIZE}
                    value={Math.round(selected.height)}
                    onChange={(e) => updateNewField(selected.id, { height: Math.max(MIN_FIELD_SIZE, parseInt(e.target.value, 10) || MIN_FIELD_SIZE) })}
                    className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                  />
                  pt
                </label>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500">
            {newFields.length === 0
              ? 'Pick a field type above, then drag on the page to place it.'
              : `${newFields.length} field${newFields.length === 1 ? '' : 's'} across ${new Set(newFields.map((f) => f.pageIndex)).size} page(s).`}
          </p>
        </div>
      )}
    </div>
  );
}

async function processor(files: File[], options?: Record<string, unknown>): Promise<ProcessResult> {
  const file = files[0];
  const fieldValues = (options?.fieldValues as FormFieldValue[] | undefined) ?? [];
  const newFields = (options?.newFields as NewFieldUI[] | undefined) ?? [];
  const flatten = newFields.length === 0 ? ((options?.flatten as boolean | undefined) ?? true) : false;

  if (fieldValues.length === 0 && newFields.length === 0) {
    throw new Error('Fill in a field or draw at least one new field before saving.');
  }

  const blob = await processPdfForm(file, { fieldValues, newFields, flatten });

  return {
    singleBlob: { blob, name: file.name.replace(/\.pdf$/i, newFields.length > 0 ? '_fillable.pdf' : '_filled.pdf') },
    info: {
      ...(fieldValues.length > 0 ? { filled: fieldValues.length } : {}),
      ...(newFields.length > 0 ? { added: newFields.length } : {}),
    },
  };
}

export default function PdfForms() {
  return <ToolPage processor={processor} optionsComponent={PdfFormsOptions} />;
}
