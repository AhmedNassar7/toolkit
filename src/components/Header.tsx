import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm dark:shadow-gray-800/50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-red-500 rounded-lg flex items-center justify-center group-hover:bg-red-600 transition-colors">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              PDF<span className="text-red-500">Tools</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              All Tools
            </Link>
            <Link
              to="/?category=organize"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Organize
            </Link>
            <Link
              to="/?category=optimize"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Optimize
            </Link>
            <Link
              to="/?category=convert"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Convert
            </Link>
            <Link
              to="/?category=edit"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Edit
            </Link>
            <Link
              to="/?category=security"
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              Security
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-yellow-400" />
              ) : (
                <Moon className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              ) : (
                <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {[
              { to: '/', label: 'All Tools' },
              { to: '/?category=organize', label: 'Organize' },
              { to: '/?category=optimize', label: 'Optimize' },
              { to: '/?category=convert', label: 'Convert' },
              { to: '/?category=edit', label: 'Edit' },
              { to: '/?category=security', label: 'Security' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
