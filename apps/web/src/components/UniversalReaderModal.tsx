import React, { useState, useEffect } from 'react';
import { AggregatorItem } from '../types';
import { api } from '../services/api';
import { extractYouTubeVideoId, getYouTubeEmbedUrl } from '../utils/youtube';

interface UniversalReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: AggregatorItem | null;
  onOpenCitation?: (item: AggregatorItem) => void;
}

type ReadingTheme = 'LIGHT' | 'SEPIA' | 'DARK';

export const UniversalReaderModal: React.FC<UniversalReaderModalProps> = ({
  isOpen,
  onClose,
  item,
  onOpenCitation,
}) => {
  const [theme, setTheme] = useState<ReadingTheme>('LIGHT');
  const [fontSize, setFontSize] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);

  // Distraction-free proxy text state (for Gutenberg, Articles, News)
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyContent, setProxyContent] = useState<string | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'EMBED' | 'DISTRACTION_FREE'>('EMBED');

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  // Load readable text for Gutenberg / News / Articles
  useEffect(() => {
    if (!isOpen || !item) {
      setProxyContent(null);
      setProxyError(null);
      return;
    }

    // Default modes based on source
    if (item.readerType === 'gutenberg') {
      setActiveMode('DISTRACTION_FREE');
    } else {
      setActiveMode('EMBED');
    }

    if (item.readerType === 'gutenberg' || item.readerType === 'news') {
      setProxyLoading(true);
      setProxyError(null);
      api.get<{ content: string; title?: string }>(`/aggregator/read-proxy?url=${encodeURIComponent(item.readUrl)}`)
        .then((res) => {
          setProxyContent(res.content);
        })
        .catch((err) => {
          console.warn('Reader proxy fallback', err);
          setProxyError('Direct text reader unavailable. Switching to embedded frame.');
          setActiveMode('EMBED');
        })
        .finally(() => {
          setProxyLoading(false);
        });
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleCopyCitation = async () => {
    const year = item.published ? new Date(item.published).getFullYear() : new Date().getFullYear();
    const authors = item.authors?.replace(/^Author:\s*/, '').replace(/^Reporter:\s*/, '') || 'Unknown';
    const citation = `${authors} (${year}). ${item.title}. [Online] Available at: ${item.externalUrl}`;

    try {
      await navigator.clipboard.writeText(citation);
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    } catch {
      setCopiedCitation(false);
    }
  };

  const getThemeWrapperClass = () => {
    switch (theme) {
      case 'SEPIA':
        return 'bg-[#fbf0d9] text-[#5f4b32]';
      case 'DARK':
        return 'bg-slate-950 text-slate-100';
      case 'LIGHT':
      default:
        return 'bg-slate-100 text-slate-900';
    }
  };

  const getReaderCardClass = () => {
    switch (theme) {
      case 'SEPIA':
        return 'bg-[#f4ecd8] border-[#e2d5b8] text-[#4a3b27]';
      case 'DARK':
        return 'bg-slate-900 border-slate-800 text-slate-100';
      case 'LIGHT':
      default:
        return 'bg-white border-slate-200 text-slate-900';
    }
  };

  const getBadgeColor = (source: string) => {
    switch (source) {
      case 'arXiv':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'Google Books':
        return 'bg-sky-100 text-sky-900 border-sky-300';
      case 'Open Library':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'Project Gutenberg':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'Academic & Tech News':
        return 'bg-rose-100 text-rose-900 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${getThemeWrapperClass()} overflow-hidden animate-in fade-in duration-150`}>
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-900 text-white border-b border-slate-800 flex-shrink-0 gap-3">
        {/* Left: Close & Metadata */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 min-h-[36px]"
            title="Return to Research Catalog (Esc)"
          >
            <span>←</span>
            <span className="hidden sm:inline">Close Reader</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${getBadgeColor(item.source)}`}>
                {item.source}
              </span>
              <span className="text-[11px] text-slate-400 font-medium truncate hidden sm:inline">
                {item.authors || item.category || 'Open Access Research'}
              </span>
            </div>
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md md:max-w-xl mt-0.5" title={item.title}>
              {item.title}
            </h1>
          </div>
        </div>

        {/* Right: Controls (Theme, Mode, Font, Citation) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mode Switcher for Text/News */}
          {(item.readerType === 'gutenberg' || item.readerType === 'news') && proxyContent && (
            <div className="hidden sm:flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
              <button
                onClick={() => setActiveMode('DISTRACTION_FREE')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                  activeMode === 'DISTRACTION_FREE' ? 'bg-emerald-900 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Distraction-Free
              </button>
              <button
                onClick={() => setActiveMode('EMBED')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                  activeMode === 'EMBED' ? 'bg-emerald-900 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Web Frame
              </button>
            </div>
          )}

          {/* Theme Selector */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            {(['LIGHT', 'SEPIA', 'DARK'] as ReadingTheme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-2 py-1 text-[10px] sm:text-xs font-semibold rounded transition-colors ${
                  theme === t ? 'bg-emerald-900 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t === 'LIGHT' ? '☀️' : t === 'SEPIA' ? '📜' : '🌙'}
              </button>
            ))}
          </div>

          {/* Font Zoom Controls */}
          <div className="hidden md:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              onClick={() => setFontSize((f) => Math.max(f - 10, 75))}
              className="px-2 py-1 text-slate-300 hover:text-white font-mono"
              title="Decrease Font Size"
            >
              A-
            </button>
            <span className="px-1.5 text-[10px] font-mono text-slate-400">{fontSize}%</span>
            <button
              onClick={() => setFontSize((f) => Math.min(f + 10, 160))}
              className="px-2 py-1 text-slate-300 hover:text-white font-mono"
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          {/* Copy Citation Button */}
          <button
            onClick={handleCopyCitation}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1 min-h-[36px]"
            title="Copy academic citation"
          >
            <span>📋</span>
            <span className="hidden lg:inline">{copiedCitation ? 'Copied!' : 'Cite'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs border border-slate-700 transition-colors min-h-[36px]"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '↙' : '↗'}
          </button>
        </div>
      </header>

      {/* Reader Body Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center p-2 sm:p-4">
        {activeMode === 'DISTRACTION_FREE' && (item.readerType === 'gutenberg' || item.readerType === 'news') ? (
          <div className={`w-full max-w-4xl h-full rounded-xl border shadow-sm overflow-y-auto p-6 sm:p-12 transition-all ${getReaderCardClass()}`}>
            {proxyLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <div className="w-8 h-8 border-3 border-emerald-900 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-medium text-slate-500">Loading formatted distraction-free text...</p>
              </div>
            ) : proxyError ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-sm font-semibold text-amber-800">{proxyError}</p>
                <button
                  onClick={() => setActiveMode('EMBED')}
                  className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-xs font-semibold"
                >
                  Switch to Embedded View
                </button>
              </div>
            ) : (
              <article
                style={{ fontSize: `${fontSize}%` }}
                className="prose max-w-none leading-relaxed space-y-4"
              >
                <header className="border-b border-slate-200/60 pb-6 mb-6">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm border ${getBadgeColor(item.source)}`}>
                    {item.source}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-extrabold mt-2 leading-tight">
                    {item.title}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.authors} {item.published && `• ${item.published}`}
                  </p>
                </header>
                <div
                  className="reader-html-content leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{ __html: proxyContent || item.description }}
                />
              </article>
            )}
          </div>
        ) : (
          /* Embedded In-UI Viewer (arXiv PDF / Google Books Preview / Open Library / YouTube / Web) */
          <div className="w-full h-full rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col relative">
            {(() => {
              const youtubeId = extractYouTubeVideoId(item.readUrl) || extractYouTubeVideoId(item.externalUrl);
              if (youtubeId) {
                return (
                  <div className="w-full h-full bg-black flex items-center justify-center p-2 sm:p-6">
                    <div className="w-full max-w-4xl aspect-video rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                      <iframe
                        src={getYouTubeEmbedUrl(youtubeId)}
                        title={item.title}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                );
              }
              return (
                <iframe
                  src={item.readUrl}
                  title={item.title}
                  className="w-full h-full flex-1 border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              );
            })()}
          </div>
        )}
      </main>

      {/* Bottom Status / Guidance Bar */}
      <footer className="px-4 py-2 bg-slate-900 text-slate-400 border-t border-slate-800 text-[11px] flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Reading directly inside FSS-IB E-Library UI</span>
          <span className="hidden sm:inline">•</span>
          <span className="font-mono text-slate-300">{item.source}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 hidden md:inline">Press Esc to exit reader</span>
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
          >
            <span>External Mirror</span>
            <span>↗</span>
          </a>
        </div>
      </footer>
    </div>
  );
};
