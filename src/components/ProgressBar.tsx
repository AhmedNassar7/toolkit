interface ProgressBarProps {
  progress: number;
  color?: string;
  label?: string;
}

export default function ProgressBar({ progress, color = '#e74c3c', label }: ProgressBarProps) {
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
          <span className="text-sm font-semibold" style={{ color }}>
            {Math.round(progress)}%
          </span>
        </div>
      )}
      <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
