import { Link } from 'react-router-dom';
import type { Tool } from '../data/tools';

interface ToolCardProps {
  tool: Tool;
  compact?: boolean;
}

export default function ToolCard({ tool, compact = false }: ToolCardProps) {
  const Icon = tool.icon;

  return (
    <Link
      to={`/tool/${tool.id}`}
      className="group relative flex flex-col items-center p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg dark:hover:shadow-gray-900/50 hover:-translate-y-1 transition-all duration-200"
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: tool.color + '15' }}
      >
        <Icon className="w-7 h-7" style={{ color: tool.color }} />
      </div>
      <h3
        className={`font-semibold text-gray-800 dark:text-gray-100 text-center leading-tight ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        {tool.name}
      </h3>
      {!compact && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1.5 line-clamp-2 leading-relaxed">
          {tool.description}
        </p>
      )}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300 w-0 group-hover:w-3/4"
        style={{ backgroundColor: tool.color }}
      />
    </Link>
  );
}
