import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Course } from '../types';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCourseId?: number;
}

interface QueuedFile {
  id: string;
  file: File;
  title: string;
  courseId: number | null;
  detectedCode: string | null;
  resourceType: 'DOCUMENT' | 'NOTEBOOK' | 'CODE' | 'DATASET' | 'SPREADSHEET' | 'VIDEO' | 'AUDIO';
  status: 'PENDING' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  progressPercent: number;
}

interface PresignResponse {
  uploadUrl: string;
  r2Key: string;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultCourseId,
}) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [batchCourseId, setBatchCourseId] = useState<number | ''>(defaultCourseId || '');
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available courses for matching
  useEffect(() => {
    if (!isOpen) return;

    const fetchCourses = async () => {
      try {
        const res = await api.get<{ courses: Course[] }>('/courses');
        setCourses(res.courses || []);
      } catch (err) {
        console.warn('Could not load course list for bulk upload matching', err);
      }
    };

    fetchCourses();
  }, [isOpen]);

  useEffect(() => {
    if (defaultCourseId) {
      setBatchCourseId(defaultCourseId);
    }
  }, [defaultCourseId]);

  if (!isOpen) return null;

  // Detect Resource Type from MIME / Extension
  const detectResourceType = (file: File): QueuedFile['resourceType'] => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'ipynb') return 'NOTEBOOK';
    if (['py', 'sql', 'java', 'c', 'cpp', 'r', 'js', 'ts'].includes(ext)) return 'CODE';
    if (['csv', 'sav'].includes(ext)) return 'DATASET';
    if (['xlsx', 'xls'].includes(ext)) return 'SPREADSHEET';
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'VIDEO';
    if (['mp3', 'wav', 'm4a'].includes(ext)) return 'AUDIO';
    return 'DOCUMENT'; // default for PDF, DOCX, PPTX, etc.
  };

  // Match Course Code using RegEx (e.g. COM 111, STA212, MTH 111)
  const detectCourseCode = (filename: string, availableCourses: Course[]): { courseId: number | null; code: string | null } => {
    const cleanName = filename.replace(/[_-]/g, ' ');
    const match = cleanName.match(/\b([A-Za-z]{2,4})\s*([0-9]{3})\b/i);

    if (match) {
      const parsedCode = `${match[1].toUpperCase()} ${match[2]}`.replace(/\s+/g, ' ').trim();
      const compactCode = `${match[1].toUpperCase()}${match[2]}`;

      const found = availableCourses.find(
        (c) =>
          c.code.replace(/\s+/g, '').toUpperCase() === compactCode ||
          c.code.toUpperCase() === parsedCode
      );

      if (found) {
        return { courseId: found.id, code: found.code };
      }
      return { courseId: null, code: parsedCode };
    }

    return { courseId: null, code: null };
  };

  // Extract clean title from filename
  const extractTitle = (filename: string): string => {
    return filename
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[_-]/g, ' ')   // replace underscores/hyphens with spaces
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const newItems: QueuedFile[] = Array.from(files).map((f) => {
      const { courseId, code } = detectCourseCode(f.name, courses);
      const chosenCourseId = courseId || (batchCourseId ? Number(batchCourseId) : null);

      return {
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        title: extractTitle(f.name),
        courseId: chosenCourseId,
        detectedCode: code,
        resourceType: detectResourceType(f),
        status: 'PENDING',
        progressPercent: 0,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleApplyBatchCourse = () => {
    if (!batchCourseId) return;
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        courseId: Number(batchCourseId),
      }))
    );
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    if (isUploading) return;
    setQueue([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // High-speed parallel batch upload
  const handleStartBatchUpload = async () => {
    const pendingItems = queue.filter((i) => i.status === 'PENDING');
    if (pendingItems.length === 0) return;

    // Verify all items have an assigned course
    const missingCourse = pendingItems.find((i) => !i.courseId);
    if (missingCourse) {
      alert(`Please assign a course for "${missingCourse.file.name}" before starting upload.`);
      return;
    }

    setIsUploading(true);
    setStatusMessage('Uploading digital materials directly to cloud storage...');

    let completed = 0;
    const total = pendingItems.length;

    // Process files sequentially or in pairs to prevent browser socket exhaustion
    for (const item of pendingItems) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'UPLOADING', progressPercent: 20 } : q))
      );

      try {
        // Step 1: Presign upload
        const presignRes = await api.post<PresignResponse>('/resources/presign-upload', {
          course_id: item.courseId,
          filename: item.file.name,
          mime_type: item.file.type || 'application/octet-stream',
          size_bytes: item.file.size,
        });

        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progressPercent: 50 } : q))
        );

        // Step 2: Direct PUT to Cloudflare R2 / S3 storage
        const uploadRes = await fetch(presignRes.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': item.file.type || 'application/octet-stream',
          },
          body: item.file,
        });

        if (!uploadRes.ok) {
          throw new Error(`S3 direct upload failed with HTTP ${uploadRes.status}`);
        }

        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progressPercent: 85 } : q))
        );

        // Step 3: Confirm upload & register metadata + trigger text indexing
        await api.post('/resources/confirm', {
          course_id: item.courseId,
          title: item.title,
          description: null,
          resource_type: item.resourceType,
          visibility: 'ENROLLED_ONLY',
          r2_key: presignRes.r2Key,
          filename: item.file.name,
          mime_type: item.file.type || 'application/octet-stream',
          size_bytes: item.file.size,
        });

        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'SUCCESS', progressPercent: 100 } : q))
        );
      } catch (err: any) {
        console.error(`Failed to upload ${item.file.name}:`, err);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: 'ERROR', errorMessage: err.message || 'Upload failed' }
              : q
          )
        );
      }

      completed++;
      setOverallProgress(Math.round((completed / total) * 100));
    }

    setIsUploading(false);
    setStatusMessage(`Batch completed: ${completed} of ${total} files processed.`);
    onSuccess();
  };

  const totalFiles = queue.length;
  const successCount = queue.filter((i) => i.status === 'SUCCESS').length;
  const errorCount = queue.filter((i) => i.status === 'ERROR').length;
  const pendingCount = queue.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 shadow-xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
                Digital Repository Ingestion
              </span>
              <span className="text-xs text-slate-500 font-medium">Batch Direct-to-Storage</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
              <span>⚡</span>
              <span>Bulk Digital Content Uploader</span>
            </h3>
            <p className="text-xs text-slate-500">
              Drag and drop lecture PDFs, slides, datasets, or lab code. The system parses course codes from filenames automatically.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-emerald-800/40 hover:border-emerald-800 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-xl p-6 text-center cursor-pointer transition-all space-y-2 shrink-0"
        >
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
            className="hidden"
          />
          <div className="text-3xl">📁</div>
          <div className="text-xs font-bold text-emerald-950">
            Click to browse or drop up to 50 files here
          </div>
          <div className="text-[11px] text-slate-500">
            Supports PDF, DOCX, PPTX, IPYNB, Python, SQL, CSV, XLSX, MP4 (Direct Cloud Storage presigned upload)
          </div>
        </div>

        {/* Batch Defaults Controls */}
        {queue.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="font-bold text-slate-700 whitespace-nowrap">Default Target Course:</span>
              <select
                value={batchCourseId}
                onChange={(e) => setBatchCourseId(e.target.value ? Number(e.target.value) : '')}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 bg-white font-medium text-xs w-full sm:w-56"
              >
                <option value="">Select course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBatchCourse}
                disabled={!batchCourseId || isUploading}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Apply to All
              </button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <span className="text-slate-500 font-semibold tabular-nums">
                {totalFiles} file(s) queued
              </span>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isUploading}
                className="text-rose-700 hover:text-rose-900 font-semibold text-xs cursor-pointer disabled:opacity-50"
              >
                Clear Queue
              </button>
            </div>
          </div>
        )}

        {/* Queue Items Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-[160px]">
          {queue.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No files queued yet. Drop lecture materials above to begin.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase sticky top-0">
                  <th className="py-2.5 px-3">File & Title</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Target Course</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={item.title}
                        disabled={isUploading}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) => (q.id === item.id ? { ...q, title: e.target.value } : q))
                          )
                        }
                        className="w-full px-2 py-1 border border-slate-200 rounded font-semibold text-slate-900 text-xs bg-white"
                      />
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5 max-w-xs">
                        {item.file.name}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-slate-600">
                      {formatFileSize(item.file.size)}
                    </td>

                    <td className="py-2.5 px-3">
                      <select
                        value={item.resourceType}
                        disabled={isUploading}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.id === item.id
                                ? { ...q, resourceType: e.target.value as QueuedFile['resourceType'] }
                                : q
                            )
                          )
                        }
                        className="px-2 py-1 border border-slate-200 rounded text-xs text-slate-800 bg-white"
                      >
                        <option value="DOCUMENT">DOCUMENT (PDF/Doc)</option>
                        <option value="NOTEBOOK">NOTEBOOK (.ipynb)</option>
                        <option value="CODE">CODE (py/sql/r)</option>
                        <option value="DATASET">DATASET (csv/sav)</option>
                        <option value="SPREADSHEET">SPREADSHEET (xlsx)</option>
                        <option value="VIDEO">VIDEO</option>
                        <option value="AUDIO">AUDIO</option>
                      </select>
                    </td>

                    <td className="py-2.5 px-3">
                      <select
                        value={item.courseId || ''}
                        disabled={isUploading}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.id === item.id
                                ? { ...q, courseId: e.target.value ? Number(e.target.value) : null }
                                : q
                            )
                          )
                        }
                        className={`px-2 py-1 border rounded text-xs font-semibold ${
                          !item.courseId
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        <option value="">Select Course *</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} - {c.title}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {item.status === 'PENDING' && (
                        <span className="text-slate-400 font-semibold text-[11px]">Ready</span>
                      )}
                      {item.status === 'UPLOADING' && (
                        <span className="text-emerald-700 font-bold text-[11px] animate-pulse">
                          Uploading ({item.progressPercent}%)
                        </span>
                      )}
                      {item.status === 'SUCCESS' && (
                        <span className="text-emerald-800 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ Published
                        </span>
                      )}
                      {item.status === 'ERROR' && (
                        <span
                          className="text-rose-800 font-bold text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
                          title={item.errorMessage}
                        >
                          ❌ Error
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={isUploading}
                        className="text-slate-400 hover:text-rose-600 text-sm cursor-pointer disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Progress Bar & Footer */}
        {isUploading && (
          <div className="space-y-1.5 shrink-0">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>{statusMessage}</span>
              <span className="tabular-nums">{overallProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-emerald-900 h-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {successCount > 0 && <span className="text-emerald-800 font-bold mr-2">✓ {successCount} Uploaded</span>}
            {errorCount > 0 && <span className="text-rose-800 font-bold mr-2">❌ {errorCount} Failed</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
            >
              {successCount > 0 ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleStartBatchUpload}
              disabled={isUploading || pendingCount === 0}
              className="px-5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <span>🚀</span>
              <span>{isUploading ? 'Uploading Batch...' : `Upload All (${pendingCount})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
