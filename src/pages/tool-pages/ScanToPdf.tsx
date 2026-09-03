import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  RotateCcw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  CheckCircle,
  AlertCircle,
  ImagePlus,
} from 'lucide-react';
import { getToolById } from '../../data/tools';
import { useGoBack } from '../../hooks/useGoBack';
import ProgressBar from '../../components/ProgressBar';
import { scanToPdf, type ScanFilter, type ScanPageSize } from '../../utils/pdfProcessor';
import { ocrDocument, OCR_LANGUAGES } from '../../utils/ocrProcessor';

type Step = 'capture' | 'processing' | 'done';

interface Shot {
  id: string;
  url: string;
  blob: Blob;
}

interface OutFile {
  blob: Blob;
  name: string;
}

const pageSizes: { value: ScanPageSize; label: string }[] = [
  { value: 'fit', label: 'Fit to photo' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
];

const filters: { value: ScanFilter; label: string }[] = [
  { value: 'none', label: 'Colour' },
  { value: 'grayscale', label: 'Greyscale' },
  { value: 'bw', label: 'Black & white' },
];

export default function ScanToPdf() {
  const tool = getToolById('scan-to-pdf')!;
  const goBack = useGoBack();
  const Icon = tool.icon;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotsRef = useRef<Shot[]>([]);

  const [step, setStep] = useState<Step>('capture');
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [shots, setShots] = useState<Shot[]>([]);
  const [pageSize, setPageSize] = useState<ScanPageSize>('fit');
  const [filter, setFilter] = useState<ScanFilter>('none');
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [runOcr, setRunOcr] = useState(false);
  const [ocrLang, setOcrLang] = useState('eng');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OutFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraError('This browser can’t open the camera. Use “Add photos” below instead.');
      return;
    }
    setCameraState('starting');
    setCameraError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState('live');
    } catch {
      setCameraState('error');
      setCameraError('Couldn’t access the camera. Check permissions, or use “Add photos” below.');
    }
  }, [facing, stopCamera]);

  // Run the camera only while capturing; restart it when the facing mode flips.
  useEffect(() => {
    if (step !== 'capture') return;
    startCamera();
    return () => stopCamera();
  }, [step, startCamera, stopCamera]);

  // Release object URLs when the component goes away.
  useEffect(() => {
    return () => {
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
      stopCamera();
    };
  }, [stopCamera]);

  const addShot = useCallback((blob: Blob) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setShots((prev) => [...prev, { id, url: URL.createObjectURL(blob), blob }]);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && addShot(blob), 'image/jpeg', 0.92);
  }, [addShot]);

  const addFromFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      Array.from(e.target.files ?? [])
        .filter((f) => f.type.startsWith('image/'))
        .forEach(addShot);
      e.target.value = '';
    },
    [addShot]
  );

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const moveShot = useCallback((id: string, dir: -1 | 1) => {
    setShots((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }, []);

  const createPdf = useCallback(async () => {
    if (shots.length === 0) return;
    setStep('processing');
    setProgress(runOcr ? 8 : 15);
    setError(null);
    try {
      const tick = setInterval(() => setProgress((p) => Math.min(p + (runOcr ? 5 : 12), 85)), 400);
      const scan = await scanToPdf(
        shots.map((s) => s.blob),
        { pageSize, filter, autoEnhance }
      );

      let outputs: OutFile[];
      if (runOcr) {
        const { pdf, text } = await ocrDocument(scan, { lang: ocrLang });
        outputs = [
          { blob: pdf, name: 'scan_ocr.pdf' },
          { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: 'scan.txt' },
        ];
      } else {
        outputs = [{ blob: scan, name: 'scan.pdf' }];
      }

      clearInterval(tick);
      setProgress(100);
      setResult(outputs);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the PDF.');
      setStep('capture');
      setProgress(0);
    }
  }, [shots, pageSize, filter, autoEnhance, runOcr, ocrLang]);

  const download = useCallback((file: OutFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const reset = useCallback(() => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setStep('capture');
  }, [shots]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-20 transition-colors">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            All Tools
          </button>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: tool.color + '15' }}
            >
              <Icon className="w-7 h-7" style={{ color: tool.color }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tool.name}</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{tool.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {step === 'capture' && (
          <div className="space-y-6">
            {/* Camera */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 sm:p-6 transition-colors">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-900">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                  style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
                />
                {cameraState !== 'live' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 text-gray-300">
                    <Camera className="w-8 h-8" />
                    <p className="text-sm">
                      {cameraState === 'starting'
                        ? 'Starting camera…'
                        : cameraError ?? 'Camera unavailable.'}
                    </p>
                    {cameraState === 'error' && (
                      <button
                        onClick={startCamera}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                <button
                  onClick={capture}
                  disabled={cameraState !== 'live'}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
                  style={{ backgroundColor: tool.color }}
                >
                  <Camera className="w-5 h-5" />
                  Capture page
                </button>
                <button
                  onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <RotateCcw className="w-5 h-5" />
                  Flip camera
                </button>
                <label className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                  <ImagePlus className="w-5 h-5" />
                  Add photos
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={addFromFiles}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Captured pages */}
            {shots.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 transition-colors">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {shots.length} page{shots.length === 1 ? '' : 's'}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {shots.map((shot, index) => (
                    <div
                      key={shot.id}
                      className="group relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    >
                      <img src={shot.url} alt={`Page ${index + 1}`} className="w-full h-32 object-cover" />
                      <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
                        {index + 1}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveShot(shot.id, -1)}
                          disabled={index === 0}
                          className="p-1 rounded bg-white/20 text-white hover:bg-white/40 disabled:opacity-30"
                          aria-label="Move earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveShot(shot.id, 1)}
                          disabled={index === shots.length - 1}
                          className="p-1 rounded bg-white/20 text-white hover:bg-white/40 disabled:opacity-30"
                          aria-label="Move later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeShot(shot.id)}
                          className="p-1 rounded bg-white/20 text-white hover:bg-red-500"
                          aria-label="Delete page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Options */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 transition-colors space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Options</h3>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Page size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as ScanPageSize)}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                >
                  {pageSizes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Colour</label>
                <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800">
                  {filters.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        filter === f.value
                          ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={autoEnhance}
                  onChange={(e) => setAutoEnhance(e.target.checked)}
                  className="accent-red-500"
                />
                Auto-enhance — straighten &amp; crop each page to the document
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={runOcr}
                  onChange={(e) => setRunOcr(e.target.checked)}
                  className="accent-red-500"
                />
                Make searchable — run OCR and also export the text
              </label>

              {runOcr && (
                <div className="pl-6 space-y-1">
                  <select
                    value={ocrLang}
                    onChange={(e) => setOcrLang(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  >
                    {OCR_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    OCR adds time (a few seconds per page).
                    {ocrLang !== 'eng' &&
                      ' Non-English languages download their data on first use.'}
                  </p>
                </div>
              )}
            </div>

            {shots.length > 0 && (
              <button
                onClick={createPdf}
                className="w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all hover:opacity-90 active:scale-[0.99] shadow-lg"
                style={{ backgroundColor: tool.color }}
              >
                Create PDF
              </button>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center transition-colors">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center animate-pulse"
              style={{ backgroundColor: tool.color + '15' }}
            >
              <RefreshCw className="w-8 h-8 animate-spin" style={{ color: tool.color }} />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
              {runOcr ? 'Building & reading your PDF…' : 'Building your PDF…'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Processing {shots.length} page{shots.length === 1 ? '' : 's'} in your browser
              {runOcr ? ' — OCR can take a few seconds per page' : ''}
            </p>
            <ProgressBar progress={progress} color={tool.color} />
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center transition-colors">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                {tool.outputLabel} Ready!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Your scan has been assembled successfully
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">pages</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{shots.length}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">page size</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {pageSizes.find((p) => p.value === pageSize)?.label}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">searchable</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {runOcr ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                {result.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => download(file)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
                    style={{ backgroundColor: tool.color }}
                  >
                    <Download className="w-5 h-5" />
                    {file.name.endsWith('.txt') ? 'Download text' : 'Download PDF'}
                  </button>
                ))}
                <button
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="w-5 h-5" />
                  Scan Another
                </button>
              </div>
            </div>

            <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">
              Your photos are processed entirely in your browser and are never uploaded to any server.
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Processing Error</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
