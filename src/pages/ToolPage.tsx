import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getToolById } from '../data/tools';
import FileUpload from '../components/FileUpload';
import ProgressBar from '../components/ProgressBar';
import { ArrowLeft, Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

type Step = 'upload' | 'processing' | 'done';

interface ToolPageProps {
  processor: (files: File[], options?: Record<string, unknown>) => Promise<ProcessResult>;
  optionsComponent?: React.ComponentType<{
    options: Record<string, unknown>;
    setOptions: (opts: Record<string, unknown>) => void;
  }>;
}

export interface ProcessResult {
  blobs?: { blob: Blob; name: string }[];
  singleBlob?: { blob: Blob; name: string };
  info?: Record<string, string | number>;
}

export default function ToolPage({ processor, optionsComponent: OptionsComponent }: ToolPageProps) {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = toolId ? getToolById(toolId) : undefined;

  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<Step>('upload');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setError(null);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;
    setStep('processing');
    setProgress(10);
    setError(null);

    try {
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 15, 85));
      }, 300);

      const res = await processor(files, options);
      clearInterval(interval);
      setProgress(100);
      setResult(res);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
      setStep('upload');
      setProgress(0);
    }
  }, [files, options, processor]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setStep('upload');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  if (!tool) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-16 transition-colors">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tool Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">The requested tool does not exist.</p>
          <Link to="/" className="text-red-500 font-medium hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const Icon = tool.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-20 transition-colors">
      {/* Tool Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            All Tools
          </Link>
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

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Upload Step */}
        {step === 'upload' && (
          <div className="space-y-6">
            <FileUpload
              accept={tool.acceptTypes}
              multiple={tool.id === 'merge-pdf' || tool.id === 'jpg-to-pdf'}
              maxFiles={tool.id === 'merge-pdf' || tool.id === 'jpg-to-pdf' ? 20 : 1}
              onFilesSelected={handleFilesSelected}
              files={files}
              onRemoveFile={handleRemoveFile}
              color={tool.color}
            />

            {OptionsComponent && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 transition-colors">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Options</h3>
                <OptionsComponent options={options} setOptions={setOptions} />
              </div>
            )}

            {files.length > 0 && (
              <button
                onClick={handleProcess}
                className="w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all hover:opacity-90 active:scale-[0.99] shadow-lg"
                style={{ backgroundColor: tool.color }}
              >
                {tool.name}
              </button>
            )}
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center transition-colors">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center animate-pulse"
              style={{ backgroundColor: tool.color + '15' }}
            >
              <RefreshCw
                className="w-8 h-8 animate-spin"
                style={{ color: tool.color }}
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
              Processing your file...
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This may take a moment depending on file size
            </p>
            <ProgressBar progress={progress} color={tool.color} />
          </div>
        )}

        {/* Done Step */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center transition-colors">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                {tool.outputLabel} Ready!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Your file has been processed successfully
              </p>

              {result.info && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {Object.entries(result.info).map(([key, value]) => (
                    <div key={key} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {result.singleBlob && (
                  <button
                    onClick={() => {
                      const { blob, name } = result.singleBlob!;
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
                    style={{ backgroundColor: tool.color }}
                  >
                    <Download className="w-5 h-5" />
                    Download {tool.outputLabel}
                  </button>
                )}

                {result.blobs && result.blobs.length > 0 && (
                  <>
                    {result.blobs.length === 1 ? (
                      <button
                        onClick={() => {
                          const { blob, name } = result.blobs![0];
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
                        style={{ backgroundColor: tool.color }}
                      >
                        <Download className="w-5 h-5" />
                        Download {tool.outputLabel}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            for (const { blob, name } of result.blobs!) {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = name;
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
                          style={{ backgroundColor: tool.color }}
                        >
                          <Download className="w-5 h-5" />
                          Download All ({result.blobs.length} files)
                        </button>
                        <button
                          onClick={async () => {
                            const JSZip = (await import('jszip')).default;
                            const zip = new JSZip();
                            for (const { blob, name } of result.blobs!) {
                              zip.file(name, blob);
                            }
                            const content = await zip.generateAsync({ type: 'blob' });
                            const url = URL.createObjectURL(content);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${tool.id}-output.zip`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          Download as ZIP
                        </button>
                      </>
                    )}
                  </>
                )}

                <button
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="w-5 h-5" />
                  Process Another
                </button>
              </div>
            </div>

            {/* Privacy note */}
            <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">
              Your files are processed entirely in your browser and are never uploaded to any server.
            </div>
          </div>
        )}

        {/* Error */}
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
