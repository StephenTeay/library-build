import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { BookImportSummary } from '../types';

export const BookImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BookImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.endsWith('.csv') && selected.type !== 'text/csv') {
        setErrorMsg('Please select a valid CSV file (.csv)');
        setFile(null);
        return;
      }
      setFile(selected);
      setErrorMsg(null);
      setSummary(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (!selected.name.endsWith('.csv') && selected.type !== 'text/csv') {
        setErrorMsg('Please drop a valid CSV file (.csv)');
        return;
      }
      setFile(selected);
      setErrorMsg(null);
      setSummary(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/library/template-csv', { credentials: 'include' });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'fss_library_catalog_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setErrorMsg('Failed to download sample template: ' + (err.message || 'Unknown error'));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a CSV file to upload.');
      return;
    }

    if (mode === 'replace') {
      const confirmPurge = window.confirm(
        'WARNING: You have selected "Replace Catalog". This will purge existing seeded books and replace them with the records in this CSV. Continue?'
      );
      if (!confirmPurge) return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSummary(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
      const res = await api.post<{ summary: BookImportSummary }>('/library/import-csv', formData);
      setSummary(res.summary);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during CSV processing.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!summary || !summary.errors || summary.errors.length === 0) return;

    const headers = 'Row,Title,Call Number,Reason\n';
    const rows = summary.errors
      .map((e) => `${e.row},"${(e.title || '').replace(/"/g, '""')}","${(e.call_number || '').replace(/"/g, '""')}","${(e.reason || '').replace(/"/g, '""')}"`)
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'catalog_import_errors.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              Library Administration
            </span>
            <span className="text-xs text-slate-500 font-medium">OPAC Bulk Management</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Bulk Book Catalog Importer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Ingest physical library holdings via structured CSV. Replace demo/seeded items or append to the existing institutional catalog.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto min-h-[44px] cursor-pointer"
        >
          <span>📥</span>
          <span>Download Sample CSV</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-slate-700 ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Main Upload Box */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
        <form onSubmit={handleUpload} className="space-y-6">
          {/* Strategy Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Import Ingestion Strategy
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'replace'
                    ? 'border-emerald-800 bg-emerald-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-0.5 text-emerald-900 focus:ring-emerald-800"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-slate-900">
                    Replace Existing Catalog
                  </div>
                  <div className="text-xs text-slate-500 leading-normal">
                    Clears demo and seeded books first, replacing them with the uploaded records.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'append'
                    ? 'border-emerald-800 bg-emerald-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  className="mt-0.5 text-emerald-900 focus:ring-emerald-800"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-slate-900">
                    Append to Existing Catalog
                  </div>
                  <div className="text-xs text-slate-500 leading-normal">
                    Preserves current catalog holdings and appends new books alongside them.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('book-csv-input')?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/60 hover:bg-slate-50 transition-colors cursor-pointer space-y-2"
          >
            <input
              id="book-csv-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="w-12 h-12 bg-white rounded-full border border-slate-200 text-slate-600 flex items-center justify-center mx-auto text-xl shadow-xs">
              📚
            </div>

            {file ? (
              <div>
                <div className="text-sm font-bold text-emerald-900 font-mono">
                  {file.name}
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB • Ready for processing
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs sm:text-sm font-semibold text-slate-800">
                  Drag & drop your Book CSV file here, or click to browse
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Supports UTF-8 CSV with: title, author, call_number, shelf_location, department_code
                </div>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              to="/library"
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel & Return to Catalog
            </Link>

            <button
              type="submit"
              disabled={loading || !file}
              className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Processing & Streaming Ingestion...' : mode === 'replace' ? 'Replace Catalog with CSV' : 'Append Books from CSV'}
            </button>
          </div>
        </form>
      </div>

      {/* Summary Report Card */}
      {summary && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Ingestion Execution Report
            </h2>

            {summary.replacedExisting && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                Catalog Purged & Replaced
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Total Rows Processed</span>
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 block tabular-nums">{summary.totalRows}</span>
            </div>
            <div className="bg-emerald-50/70 p-4 rounded-lg border border-emerald-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">Successfully Ingested</span>
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 block tabular-nums">{summary.successfulRows}</span>
            </div>
            <div className={`p-4 rounded-lg border ${summary.failedRows > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${summary.failedRows > 0 ? 'text-rose-800' : 'text-slate-500'}`}>
                Failed Rows
              </span>
              <span className={`text-xl sm:text-2xl font-extrabold mt-1 block tabular-nums ${summary.failedRows > 0 ? 'text-rose-900' : 'text-slate-900'}`}>
                {summary.failedRows}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[40px]"
            >
              <span>📖</span>
              <span>View Physical Catalog</span>
            </Link>

            {summary.errors && summary.errors.length > 0 && (
              <button
                onClick={handleDownloadErrors}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg font-semibold text-xs sm:text-sm transition-colors cursor-pointer min-h-[40px]"
              >
                <span>⚠️</span>
                <span>Download Error CSV ({summary.errors.length})</span>
              </button>
            )}
          </div>

          {/* Error Sample Preview */}
          {summary.errors && summary.errors.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 mb-2">
                Ingestion Error Sample
              </h3>
              <div className="border border-rose-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-50/70 border-b border-rose-200 text-rose-900 font-semibold">
                    <tr>
                      <th className="py-2 px-3 w-16">Row</th>
                      <th className="py-2 px-3">Title / Call Number</th>
                      <th className="py-2 px-3">Rejection Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 bg-white">
                    {summary.errors.slice(0, 5).map((e, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 tabular-nums">{e.row}</td>
                        <td className="py-2 px-3 text-slate-700">{e.title || e.call_number || '-'}</td>
                        <td className="py-2 px-3 text-rose-700 font-medium">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
