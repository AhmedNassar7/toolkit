import { useParams, Link } from 'react-router-dom';
import { getToolById } from '../../data/tools';
import { ArrowLeft, Clock } from 'lucide-react';

export default function ComingSoon() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = toolId ? getToolById(toolId) : undefined;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-20 transition-colors">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          All Tools
        </Link>
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Clock className="w-8 h-8 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {tool ? tool.name : 'This tool'} isn't available yet
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          We'd rather tell you honestly than fake it. This tool is still being built and doesn't process files correctly yet.
        </p>
      </div>
    </div>
  );
}
