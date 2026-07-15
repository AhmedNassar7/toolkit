interface FormatOption {
  value: string;
  label: string;
}

interface FormatSelectProps {
  label: string;
  formats: FormatOption[];
  value: string;
  onChange: (value: string) => void;
}

export default function FormatSelect({ label, formats, value, onChange }: FormatSelectProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
      {formats.map((format) => (
        <button
          key={format.value}
          onClick={() => onChange(format.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            value === format.value
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {format.label}
        </button>
      ))}
    </div>
  );
}
