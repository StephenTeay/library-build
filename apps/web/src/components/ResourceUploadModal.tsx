import React, { useState } from 'react';
import { api } from '../services/api';
import { ResourceType, ResourceVisibility } from '../types';

interface ResourceUploadModalProps {
  courseId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResourceUploadModal: React.FC<ResourceUploadModalProps> = ({
  courseId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [tab, setTab] = useState<'FILE' | 'EXTERNAL'>('FILE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('DOCUMENT');
  const [visibility, setVisibility] = useState<ResourceVisibility>('ENROLLED_ONLY');

  // File upload state
  const [file, setFile] = useState<File | null>(null);

  // External URL state
  const [externalUrl, setExternalUrl] = useState('');
  const [startSeconds, setStartSeconds] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File exceeds maximum size limit of 50 MB.');
        setFile(null);
        return;
      }
      setError(null);
      setFile(selectedFile);
      if (!title) {
        const base = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
        setTitle(base);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'FILE') {
        if (!file) {
          setError('Please select a file to upload.');
          setLoading(false);
          return;
        }

        setProgressText('Requesting secure direct upload authorization...');
        const presignRes = await api.post<{ uploadUrl: string; r2Key: string }>('/resources/presign-upload', {
          course_id: courseId,
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        });

        setProgressText('Uploading file directly to cloud storage...');
        const uploadRes = await fetch(presignRes.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Direct upload failed with status ${uploadRes.status}`);
        }

        setProgressText('Registering resource metadata...');
        await api.post('/resources/confirm-upload', {
          course_id: courseId,
          title: title.trim(),
          description: description.trim() || null,
          resource_type: resourceType,
          visibility,
          r2_key: presignRes.r2Key,
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        });
      } else {
        if (!externalUrl.trim()) {
          setError('Please provide a valid external URL.');
          setLoading(false);
          return;
        }

        let extVideoId: string | null = null;
        if (resourceType === 'VIDEO') {
          try {
            const urlObj = new URL(externalUrl);
            if (urlObj.hostname.includes('youtube.com')) {
              extVideoId = urlObj.searchParams.get('v');
            } else if (urlObj.hostname.includes('youtu.be')) {
              extVideoId = urlObj.pathname.slice(1);
            }
          } catch {
            // invalid URL
          }
        }

        await api.post('/resources/external', {
          course_id: courseId,
          title: title.trim(),
          description: description.trim() || null,
          resource_type: resourceType,
          visibility,
          external_url: externalUrl.trim(),
          video_id: extVideoId,
          start_seconds: startSeconds || 0,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload resource. Please try again.');
    } finally {
      setLoading(false);
      setProgressText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Add Learning Material</h3>
            <p className="text-xs text-slate-500">Attach lecture notes, lab code, datasets, or video resources.</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('FILE')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'FILE'
                ? 'border-emerald-800 text-emerald-900 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Upload File (PDF, Notes, Code)
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('EXTERNAL');
              if (resourceType === 'DOCUMENT') setResourceType('VIDEO');
            }}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'EXTERNAL'
                ? 'border-emerald-800 text-emerald-900 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            External (YouTube, Colab, Portal)
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Material Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. STA 111: Normal Distribution & Confidence Intervals"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resource Type
              </label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value as ResourceType)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value="DOCUMENT">Lecture Note / Document</option>
                <option value="SLIDE">Slide Presentation</option>
                <option value="PAST_QUESTION">Past Exam Question</option>
                <option value="DATASET">Dataset (CSV, SAV, DTA)</option>
                <option value="CODE">Lab Code / Script</option>
                <option value="VIDEO">Video Lecture (YouTube)</option>
                <option value="EXTERNAL_LINK">External Web Portal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as ResourceVisibility)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value="ENROLLED_ONLY">Enrolled Students Only</option>
                <option value="DEPARTMENT_ONLY">Department Wide</option>
                <option value="PUBLIC">Public to All Portal Users</option>
              </select>
            </div>
          </div>

          {tab === 'FILE' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select File (Max 50 MB) *
              </label>
              <input
                type="file"
                required
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-slate-700 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-900 file:text-white hover:file:bg-emerald-800 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Allowed: PDF, DOCX, PPTX, TXT, PY, R, IPYNB, SQL, CSV, SAV, DTA, ZIP
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  External URL *
                </label>
                <input
                  type="url"
                  required
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://colab.research.google.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
              </div>

              {resourceType === 'VIDEO' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Timestamp (seconds, optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={startSeconds}
                    onChange={(e) => setStartSeconds(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 120"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description / Instructions (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Recommended reading, lab exercises, or context..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          {progressText && (
            <div className="text-xs text-emerald-900 font-semibold flex items-center gap-1.5 animate-pulse">
              <span>⏳</span>
              <span>{progressText}</span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Upload & Attach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
