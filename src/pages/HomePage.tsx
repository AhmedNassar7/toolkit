import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { tools, categories, getToolsByCategory, type ToolCategory } from '../data/tools';
import ToolCard from '../components/ToolCard';
import { Search, ArrowRight, Shield, Zap, Globe } from 'lucide-react';

const categoryColors: Record<ToolCategory, string> = {
  organize: '#e74c3c',
  optimize: '#27ae60',
  convert: '#3498db',
  edit: '#f39c12',
  security: '#8e44ad',
  intelligence: '#1abc9c',
};

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const activeCategory = searchParams.get('category') as ToolCategory | null;

  const filteredTools = useMemo(() => {
    let result = activeCategory ? getToolsByCategory(activeCategory) : tools;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeCategory, search]);

  const groupedTools = useMemo(() => {
    if (activeCategory || search.trim()) return null;
    const groups: Record<string, typeof tools> = {};
    for (const cat of Object.keys(categories) as ToolCategory[]) {
      const catTools = getToolsByCategory(cat);
      if (catTools.length > 0) groups[cat] = catTools;
    }
    return groups;
  }, [activeCategory, search]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-black pt-28 pb-20 sm:pt-36 sm:pb-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-red-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-blue-500 rounded-full blur-[150px]" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-green-500 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm text-gray-300 mb-6 border border-white/10">
            <Zap className="w-4 h-4 text-yellow-400" />
            100% Free — No Registration Required
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight leading-tight">
            Every PDF Tool You Need.
            <br />
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              All in One Place.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few
            clicks. Fast, secure, and completely free.
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tools... (e.g., compress, merge, convert)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all text-base"
            />
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-8 mt-10 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              Secure Processing
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Lightning Fast
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              Works Everywhere
            </div>
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-16 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
            <button
              onClick={() => {
                setSearchParams({});
                setSearch('');
              }}
              className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all ${
                !activeCategory
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              All Tools
            </button>
            {(Object.keys(categories) as ToolCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSearchParams({ category: cat });
                  setSearch('');
                }}
                className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                style={
                  activeCategory === cat
                    ? { backgroundColor: categoryColors[cat] }
                    : undefined
                }
              >
                {categories[cat].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {activeCategory && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {categories[activeCategory].label}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {categories[activeCategory].description}
            </p>
          </div>
        )}

        {search.trim() && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Search results for &ldquo;{search}&rdquo;
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {filteredTools.length} tools found
            </p>
          </div>
        )}

        {groupedTools && !search.trim() ? (
          Object.entries(groupedTools).map(([cat, catTools]) => (
            <div key={cat} className="mb-12">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-1.5 h-8 rounded-full"
                    style={{ backgroundColor: categoryColors[cat as ToolCategory] }}
                  />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {categories[cat as ToolCategory].label}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {categories[cat as ToolCategory].description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSearchParams({ category: cat })}
                  className="hidden sm:flex items-center gap-1 text-sm font-medium hover:gap-2 transition-all"
                  style={{ color: categoryColors[cat as ToolCategory] }}
                >
                  View all <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {catTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} compact />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} compact />
            ))}
          </div>
        )}

        {filteredTools.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 dark:text-gray-500 text-lg">No tools found matching your search.</p>
          </div>
        )}
      </section>

      {/* Features Section */}
      <section className="bg-white dark:bg-gray-900 py-16 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              Why Choose PDFTools?
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Professional-grade PDF tools, completely free. No hidden fees, no registration, no
              limits.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: 'Secure & Private',
                desc: 'Files are processed locally in your browser and automatically deleted after processing. Your data never leaves your device.',
                color: '#27ae60',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                desc: 'Client-side processing means instant results. No waiting for server uploads or downloads. Everything happens right in your browser.',
                color: '#f39c12',
              },
              {
                icon: Globe,
                title: 'Works Everywhere',
                desc: 'Use on any device with a modern browser. Desktop, tablet, or mobile — PDFTools adapts to your screen.',
                color: '#3498db',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="text-center p-8 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                <div
                  className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: feature.color + '15' }}
                >
                  <feature.icon className="w-7 h-7" style={{ color: feature.color }} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
