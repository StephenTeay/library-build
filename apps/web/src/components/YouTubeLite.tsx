import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';

interface YouTubeLiteProps {
  videoId: string;
  title: string;
  startSeconds?: number | null;
}

export const YouTubeLite: React.FC<YouTubeLiteProps> = ({ videoId, title, startSeconds = 0 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const { dataSaver } = useSettings();

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${startSeconds || 0}`;

  if (isPlaying) {
    return (
      <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-xl shadow-md bg-black">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsPlaying(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setIsPlaying(true);
        }
      }}
      aria-label={`Play video: ${title}`}
      className="relative pb-[56.25%] h-0 overflow-hidden rounded-xl cursor-pointer bg-slate-900 shadow-sm border border-slate-800 group"
    >
      {/* Thumbnail: suppress image background if strict data saver is preferred */}
      {!dataSaver && (
        <img
          src={thumbnailUrl}
          alt={title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity"
        />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-950/60 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-white text-xs sm:text-sm font-semibold truncate max-w-[85%] drop-shadow-sm">
            {title}
          </h4>
          {dataSaver && (
            <span className="bg-emerald-900 text-white px-2 py-0.5 rounded text-[10px] font-bold shrink-0">
              Data-Saver
            </span>
          )}
        </div>

        {/* Center Play Button */}
        <div className="self-center text-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-900 hover:bg-emerald-800 text-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg group-hover:scale-105 transition-transform">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-[14px] border-l-white ml-1" />
          </div>
          <span className="text-slate-200 text-xs font-medium">
            {dataSaver ? 'Click to Stream Video' : 'Play Lecture'}
          </span>
        </div>

        <div className="text-slate-400 text-[11px] font-mono">
          {startSeconds ? `Starts at ${Math.floor(startSeconds / 60)}m ${startSeconds % 60}s` : 'Zero-cost embedded player'}
        </div>
      </div>
    </div>
  );
};
