import { Link } from 'react-router-dom';
import { Clock, Sparkles } from 'lucide-react';
import type { Tool } from '../data/tools';

interface ToolCardProps {
  tool: Tool;
  compact?: boolean;
}

export default function ToolCard({ tool, compact = false }: ToolCardProps) {
  const Icon = tool.icon;
  const comingSoon = !!tool.comingSoon;
  const improving = !comingSoon && !!tool.improving;

  return (
    <Link
      to={`/tool/${tool.id}`}
      className={`group relative flex flex-col items-center p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg dark:hover:shadow-gray-900/50 hover:-translate-y-1 transition-all duration-200 ${
        comingSoon ? 'opacity-70 hover:opacity-100' : ''
      }`}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <Clock className="w-2.5 h-2.5" />
          Coming Soon
        </span>
      )}
      {improving && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <Sparkles className="w-2.5 h-2.5" />
          Upgrading
        </span>
      )}
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
