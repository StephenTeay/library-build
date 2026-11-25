import React, { useState } from 'react';
import { CitationItem, CitationStyle, formatCitation, downloadBibTeX, downloadRIS } from '../utils/citationFormatter';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CitationItem | null;
}

const STYLES: { key: CitationStyle; label: string }[] = [
  { key: 'APA', label: 'APA (7th)' },
  { key: 'MLA', label: 'MLA (9th)' },
  { key: 'CHICAGO', label: 'Chicago' },
  { key: 'HARVARD', label: 'Harvard' },
  { key: 'IEEE', label: 'IEEE' },
  { key: 'BIBTEX', label: 'BibTeX' },
  { key: 'RIS', label: 'RIS (Zotero)' },
];

export const CitationModal: React.FC<CitationModalProps> = ({ isOpen, onClose, item }) => {
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('APA');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !item) return null;

  const citationText = formatCitation(item, selectedStyle);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(citationText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-emerald-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <div>
              <h2 className="text-base font-bold tracking-tight">Academic Citation Formatter</h2>
              <p className="text-xs text-emerald-200">
                Generate verified bibliography references for academic assignments and research
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg font-bold p-1 rounded hover:bg-emerald-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Target Resource Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Resource:</span>
            <p className="font-bold text-slate-900 text-sm line-clamp-1">{item.title}</p>
            <div className="flex flex-wrap gap-2 text-slate-600 pt-0.5">
              {item.courseCode && <span>Course: <strong className="text-slate-800">{item.courseCode}</strong></span>}
              {item.author && <span>Author: <strong className="text-slate-800">{item.author}</strong></span>}
              {item.isbn && <span>ISBN: <strong className="font-mono text-slate-800">{item.isbn}</strong></span>}
            </div>
          </div>

          {/* Style Selector Tabs */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 pb-2">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSelectedStyle(s.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  selectedStyle === s.key
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Formatted Output Box */}
          <div className="relative">
            <pre className="p-4 bg-slate-950 text-slate-100 font-mono text-xs rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800 min-h-[100px] select-all">
              {citationText}
            </pre>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => downloadBibTeX(item)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-semibold border border-slate-300 transition-colors"
                title="Download BibTeX file for LaTeX / Overleaf"
              >
                📥 Export .bib
              </button>
              <button
                onClick={() => downloadRIS(item)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-semibold border border-slate-300 transition-colors"
                title="Download RIS file for Zotero, Mendeley, and EndNote"
              >
                📥 Export .ris
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={handleCopy}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 min-h-[38px]"
              >
                <span>{copied ? '✓' : '📋'}</span>
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Citation'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
