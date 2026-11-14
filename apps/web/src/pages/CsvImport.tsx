import React, { useState } from 'react';
import { api } from '../services/api';

interface ImportSummary {
  jobId: number;
  totalRows: number;
  successfulRows: number;
  skippedDuplicates: number;
  failedRows: number;
  errorLogJson?: any[];
}

export const CsvImport: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSummary(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file to import.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/onboarding/import-csv', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `Upload failed with status ${res.status}`);
      }

      setSummary(data.summary || data);
    } catch (err: any) {
      setError(err.message || 'CSV import failed. Please verify the file formatting.');
    } finally {
      setUploading(false);
    }
  };

  const downloadErrorReport = () => {
    const errorList = summary?.errorLogJson || (summary as any)?.errors;
    if (!errorList) return;
    const blob = new Blob([JSON.stringify(errorList, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_job_${summary?.jobId || 'latest'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
            Admissions & Registry
          </span>
          <span className="text-xs text-slate-500 font-medium">Batch Roster Importer</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Registrar Student CSV Batch Importer
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
          Stream student admissions lists into the portal. Rows are processed in streaming batches of 100 with automatic course enrollment and duplicate protection.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 space-y-2">
          <div className="font-bold text-slate-900 uppercase tracking-wide">
            CSV Specification & Required Headers
          </div>
          <pre className="p-2.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-900 overflow-x-auto">
            matric_no,full_name,email,department_code,programme,level,phone
          </pre>
          <ul className="space-y-1 text-slate-600 list-disc list-inside">
            <li>Initial password is automatically assigned to the matriculation number.</li>
            <li>Users are flagged with <code className="font-mono bg-slate-200 px-1 rounded">must_change_password = true</code>.</li>
            <li>Students are automatically enrolled into active semester courses.</li>
            <li>Preexisting accounts are safely skipped without overwriting existing data.</li>
          </ul>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Student Roster (.csv) *
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-3.5 py-3 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-xs sm:text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-900 file:text-white hover:file:bg-emerald-800 cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || !file}
            className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {uploading ? 'Streaming & Processing Batches...' : 'Start Streaming Ingestion'}
          </button>
        </form>
      </div>

      {/* Summary Report */}
      {summary && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 text-emerald-900">
            <span className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-bold">✓</span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Import Completed (Job #{summary.jobId || 'N/A'})
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50/70 p-3.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">Imported</span>
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 block tabular-nums">{summary.successfulRows}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Skipped Dupes</span>
              <span className="text-xl sm:text-2xl font-extrabold text-slate-700 mt-1 block tabular-nums">{summary.skippedDuplicates || 0}</span>
            </div>
            <div className={`p-3.5 rounded-lg border text-center ${summary.failedRows > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${summary.failedRows > 0 ? 'text-rose-800' : 'text-slate-500'}`}>
                Failed
              </span>
              <span className={`text-xl sm:text-2xl font-extrabold mt-1 block tabular-nums ${summary.failedRows > 0 ? 'text-rose-900' : 'text-slate-700'}`}>
                {summary.failedRows}
              </span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Total Streamed</span>
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 block tabular-nums">{summary.totalRows}</span>
            </div>
          </div>

          {summary.failedRows > 0 && (summary.errorLogJson || (summary as any).errors) && (
            <div className="pt-2">
              <button
                onClick={downloadErrorReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[38px]"
              >
                <span>📥</span>
                <span>Download JSON Error Report ({(summary.errorLogJson || (summary as any).errors).length} issues)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
