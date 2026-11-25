import React, { useState, useEffect } from 'react';
import { LearningResource } from '../types';
import { extractYouTubeVideoId, getYouTubeEmbedUrl } from '../utils/youtube';

interface ReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: LearningResource | null;
  onOpenCitation?: (res: LearningResource) => void;
}

type ReadingTheme = 'LIGHT' | 'SEPIA' | 'DARK';

export const ReaderModal: React.FC<ReaderModalProps> = ({
  isOpen,
  onClose,
  resource,
  onOpenCitation,
}) => {
  const [theme, setTheme] = useState<ReadingTheme>('LIGHT');
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Close on Escape key
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

  if (!isOpen || !resource) return null;

  const streamUrl = `/api/resources/${resource.id}/stream`;
  const youtubeVideoId = extractYouTubeVideoId(resource.video_id) || extractYouTubeVideoId(resource.external_url);
  const isVideo = resource.resource_type === 'VIDEO';
  const isAudio = resource.resource_type === 'AUDIO';
  const isExternal = Boolean(resource.external_url);
  const isExternalPdf = Boolean(
    resource.external_url?.endsWith('.pdf') ||
    resource.external_url?.includes('arxiv.org/pdf') ||
    resource.external_url?.includes('/pdf')
  );

  const getThemeClasses = () => {
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

  const getViewerContainerClasses = () => {
    switch (theme) {
      case 'SEPIA':
        return 'bg-[#f4ecd8] border-[#e2d5b8]';
      case 'DARK':
        return 'bg-slate-900 border-slate-800';
      case 'LIGHT':
      default:
        return 'bg-white border-slate-200';
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 175));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 60));
  const handleResetZoom = () => setZoom(100);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${getThemeClasses()} overflow-hidden`}>
      {/* Top Reader Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800 flex-shrink-0 gap-3">
        {/* Resource Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Return to Course View (Esc)"
          >
            <span>←</span>
            <span className="hidden sm:inline">Close</span>
          </button>

          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-md sm:max-w-lg">
              {resource.title}
            </h1>
            <p className="text-[10px] text-slate-400 truncate hidden sm:block">
              FSS-IB E-Reader • {resource.resource_type}
            </p>
          </div>
        </div>

        {/* Center Reader Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls for documents */}
          {!isVideo && !isAudio && (
            <div className="hidden md:flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700 text-xs">
              <button
                onClick={handleZoomOut}
                className="px-2 py-1 hover:bg-slate-700 rounded text-slate-300 font-bold"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={handleResetZoom}
                className="px-2 py-1 hover:bg-slate-700 rounded text-slate-300 font-mono text-[11px]"
                title="Reset Zoom"
              >
                {zoom}%
              </button>
              <button
                onClick={handleZoomIn}
                className="px-2 py-1 hover:bg-slate-700 rounded text-slate-300 font-bold"
                title="Zoom In"
              >
                +
              </button>
            </div>
          )}

          {/* Reading Theme Selector */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700 text-xs">
            <button
              onClick={() => setTheme('LIGHT')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                theme === 'LIGHT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
              title="Light Theme"
            >
              ☀️
            </button>
            <button
              onClick={() => setTheme('SEPIA')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                theme === 'SEPIA' ? 'bg-[#f4ecd8] text-[#5f4b32] shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
              title="Warm Sepia Theme"
            >
              📜
            </button>
            <button
              onClick={() => setTheme('DARK')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                theme === 'DARK' ? 'bg-slate-950 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
              title="Night / Dark Theme"
            >
              🌙
            </button>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onOpenCitation && (
            <button
              onClick={() => onOpenCitation(resource)}
              className="px-2.5 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1"
              title="Generate Academic Citation"
            >
              <span>📖</span>
              <span className="hidden sm:inline">Cite</span>
            </button>
          )}

          <a
            href={isExternal ? resource.external_url || '#' : streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={!isExternal}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-semibold transition-colors flex items-center gap-1"
            title="Download or open in new tab"
          >
            <span>📥</span>
            <span className="hidden md:inline">Download</span>
          </a>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title="Close Viewer"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Document Display Canvas */}
      <main className="flex-1 overflow-auto p-2 sm:p-4 flex items-center justify-center">
        {youtubeVideoId ? (
          <div className="w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800">
            <div className="relative pb-[56.25%] h-0 overflow-hidden">
              <iframe
                src={getYouTubeEmbedUrl(youtubeVideoId, resource.start_seconds || 0)}
                title={resource.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
          </div>
        ) : isVideo ? (
          <div className="w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-lg">
            <video
              src={streamUrl}
              controls
              autoPlay
              className="w-full h-auto max-h-[80vh]"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        ) : isAudio ? (
          <div className="p-8 bg-white rounded-xl shadow-md border border-slate-200 max-w-md w-full text-center space-y-4">
            <span className="text-5xl">🎧</span>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">{resource.title}</h2>
              <p className="text-xs text-slate-500 mt-1">Audio Lecture / Recording</p>
            </div>
            <audio src={streamUrl} controls className="w-full mt-2" />
          </div>
        ) : isExternalPdf ? (
          <div
            className={`w-full h-full max-w-6xl rounded-lg border shadow-xs overflow-hidden flex flex-col ${getViewerContainerClasses()}`}
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
          >
            <iframe
              src={resource.external_url!}
              title={resource.title}
              className="w-full h-full flex-1 border-0"
            />
          </div>
        ) : isExternal ? (
          <div
            className={`w-full h-full max-w-6xl rounded-lg border shadow-xs overflow-hidden flex flex-col ${getViewerContainerClasses()}`}
          >
            <iframe
              src={resource.external_url!}
              title={resource.title}
              className="w-full h-full flex-1 border-0"
            />
          </div>
        ) : (
          /* Standard In-Browser PDF & Document Stream Frame */
          <div
            className={`w-full h-full max-w-6xl rounded-lg border shadow-xs overflow-hidden flex flex-col ${getViewerContainerClasses()}`}
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
          >
            <iframe
              src={`${streamUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              title={resource.title}
              className="w-full h-full flex-1 border-0"
            />
          </div>
        )}
      </main>
    </div>
  );
};
