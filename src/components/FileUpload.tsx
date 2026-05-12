import { useCallback, useState, useRef } from 'react';
import { Upload, X, File, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  accept: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  onFilesSelected: (files: File[]) => void;
  files: File[];
  onRemoveFile?: (index: number) => void;
  color?: string;
}

export default function FileUpload({
  accept,
  multiple = false,
  maxFiles = 20,
  maxSizeMB = 100,
  onFilesSelected,
  files,
  onRemoveFile,
  color = '#e74c3c',
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (incoming: FileList | File[]): { valid: File[]; error: string | null } => {
      const arr = Array.from(incoming);
      const total = files.length + arr.length;

      if (total > maxFiles) {
        return { valid: [], error: `Maximum ${maxFiles} files allowed` };
      }

      const acceptTypes = accept.split(',').map((s) => s.trim().toLowerCase());
      const valid: File[] = [];

      for (const file of arr) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const mime = file.type.toLowerCase();
        const matchesType = acceptTypes.some((type) => {
          if (type.startsWith('.')) {
            return type === ext;
          }

          if (type.endsWith('/*')) {
            return mime.startsWith(type.slice(0, -1));
          }

          return type === mime;
        });

        if (!matchesType) {
          return { valid: [], error: `File type "${ext}" is not supported. Accepted: ${accept}` };
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          return { valid: [], error: `File "${file.name}" exceeds ${maxSizeMB}MB limit` };
        }
        valid.push(file);
      }

      return { valid, error: null };
    },
    [accept, files.length, maxFiles, maxSizeMB]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const { valid, error } = validateFiles(e.dataTransfer.files);
      if (error) {
        setError(error);
        return;
      }
      setError(null);
      onFilesSelected(multiple ? [...files, ...valid] : valid);
    },
    [validateFiles, onFilesSelected, multiple, files]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const { valid, error } = validateFiles(e.target.files);
      if (error) {
        setError(error);
        return;
      }
      setError(null);
      onFilesSelected(multiple ? [...files, ...valid] : valid);
      if (inputRef.current) inputRef.current.value = '';
    },
    [validateFiles, onFilesSelected, multiple, files]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-current bg-opacity-5 scale-[1.01]'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
        }`}
        style={dragActive ? { borderColor: color, backgroundColor: color + '08' } : {}}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />

        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-transform duration-200"
          style={{ backgroundColor: color + '15' }}
        >
          <Upload className="w-8 h-8" style={{ color }} />
        </div>

        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Drag & drop your files here
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          or{' '}
          <span style={{ color }} className="font-medium underline underline-offset-2">
            browse files
          </span>{' '}
          from your computer
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Accepted: {accept} | Max {maxSizeMB}MB per file
        </p>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                <File className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatSize(file.size)}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              {onRemoveFile && multiple && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(i);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                >
                  <X className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
