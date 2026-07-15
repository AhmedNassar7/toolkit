import { FileText, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400 border-t border-gray-800 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-red-500 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                PDF<span className="text-red-500">Tools</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed">
              Every tool you need to work with PDFs in one place. All are 100% free and easy to use.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Organize
            </h3>
            <ul className="space-y-2">
              {['merge-pdf', 'split-pdf', 'rotate-pdf', 'compress-pdf'].map((id) => (
                <li key={id}>
                  <Link
                    to={`/tool/${id}`}
                    className="text-sm hover:text-white transition-colors capitalize"
                  >
                    {id.replace(/-/g, ' ')}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Convert
            </h3>
            <ul className="space-y-2">
              {['pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'pdf-to-png', 'jpg-to-pdf'].map(
                (id) => (
                  <li key={id}>
                    <Link
                      to={`/tool/${id}`}
                      className="text-sm hover:text-white transition-colors capitalize"
                    >
                      {id.replace(/-/g, ' ')}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Edit & Security
            </h3>
            <ul className="space-y-2">
              {['edit-pdf', 'watermark', 'protect-pdf', 'unlock-pdf', 'sign-pdf'].map((id) => (
                <li key={id}>
                  <Link
                    to={`/tool/${id}`}
                    className="text-sm hover:text-white transition-colors capitalize"
                  >
                    {id.replace(/-/g, ' ')}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm">
            Made with <Heart className="w-3.5 h-3.5 inline text-red-500 fill-red-500" /> for PDF
            lovers everywhere
          </p>
          <div className="flex items-center gap-6 text-sm">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>All files processed securely</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
