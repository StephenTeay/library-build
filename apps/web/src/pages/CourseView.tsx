import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { useSettings } from '../context/SettingsContext';
import { Course, LearningResource, LibraryItem, DiscussionThread, DiscussionPost, CourseReserve } from '../types';
import { api } from '../services/api';
import { YouTubeLite } from '../components/YouTubeLite';
import { extractYouTubeVideoId } from '../utils/youtube';
import { ResourceUploadModal } from '../components/ResourceUploadModal';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { ReaderModal } from '../components/ReaderModal';
import { CitationModal } from '../components/CitationModal';
import { CitationItem } from '../utils/citationFormatter';

export const CourseView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const courseId = parseInt(id || '0');
  const { user } = useAuth();
  const { saveResourceOffline, removeResourceOffline, isResourceCached } = useOffline();
  const { dataSaver } = useSettings();

  const [activeTab, setActiveTab] = useState<'RESOURCES' | 'SYLLABUS' | 'LIBRARY' | 'DISCUSSIONS'>('RESOURCES');
  const [course, setCourse] = useState<Course | null>(null);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [cachedStatusMap, setCachedStatusMap] = useState<Record<string, boolean>>({});

  // Loading & Modals
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [cachingId, setCachingId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // New Thread State
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadContent, setNewThreadContent] = useState('');
  const [isPostingThread, setIsPostingThread] = useState(false);
  const [showThreadForm, setShowThreadForm] = useState(false);

  // Selected Thread State
  const [activeThread, setActiveThread] = useState<DiscussionThread | null>(null);
  const [activeThreadPosts, setActiveThreadPosts] = useState<DiscussionPost[]>([]);
  const [newReplyContent, setNewReplyContent] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);

  // Filter state for resources
  const [resourceFilter, setResourceFilter] = useState<string>('ALL');

  // Course Reserves State
  const [reserves, setReserves] = useState<CourseReserve[]>([]);
  const [showAddReserve, setShowAddReserve] = useState(false);
  const [reserveItemType, setReserveItemType] = useState<'BOOK' | 'RESOURCE'>('BOOK');
  const [reserveItemId, setReserveItemId] = useState('');
  const [reserveRequirement, setReserveRequirement] = useState<'REQUIRED' | 'RECOMMENDED'>('REQUIRED');
  const [reserveNotes, setReserveNotes] = useState('');
  const [isAddingReserve, setIsAddingReserve] = useState(false);
  const [savedShelfIds, setSavedShelfIds] = useState<Set<string>>(new Set());

  // Reader & Citation Modals
  const [readingResource, setReadingResource] = useState<LearningResource | null>(null);
  const [citationItem, setCitationItem] = useState<CitationItem | null>(null);

  const isStaff = user && ['REGISTRAR', 'LIBRARIAN', 'HOD', 'LECTURER'].includes(user.role);

  const fetchCourseData = useCallback(async () => {
    try {
      setLoading(true);
      const courseRes = await api.get<{ course: Course }>(`/courses/${courseId}`);
      setCourse(courseRes.course);

      const resRes = await api.get<{ resources: LearningResource[] }>(`/resources/course/${courseId}`);
      setResources(resRes.resources || []);

      const statusMap: Record<string, boolean> = {};
      for (const res of resRes.resources || []) {
        if (res.r2_key) {
          statusMap[res.id] = await isResourceCached(res.id);
        }
      }
      setCachedStatusMap(statusMap);

      const libRes = await api.get<{ items: LibraryItem[] }>(`/library/course/${courseId}`);
      setLibraryItems(libRes.items || []);

      const reservesRes = await api.get<{ reserves: CourseReserve[] }>(`/courses/${courseId}/reserves`).catch(() => ({ reserves: [] }));
      setReserves(reservesRes.reserves || []);

      const discRes = await api.get<{ threads: DiscussionThread[] }>(`/discussions/course/${courseId}`);
      setThreads(discRes.threads || []);
    } catch (err) {
      console.warn('Error fetching course data', err);
    } finally {
      setLoading(false);
    }
  }, [courseId, isResourceCached]);

  const handleAddReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveItemId.trim()) return;
    setIsAddingReserve(true);
    try {
      await api.post(`/courses/${courseId}/reserves`, {
        item_type: reserveItemType,
        item_id: reserveItemId.trim(),
        requirement_level: reserveRequirement,
        notes: reserveNotes.trim() || undefined,
      });
      setShowAddReserve(false);
      setReserveItemId('');
      setReserveNotes('');
      fetchCourseData();
    } catch (err: any) {
      alert(err.message || 'Failed to add course reserve');
    } finally {
      setIsAddingReserve(false);
    }
  };

  const handleRemoveReserve = async (reserveId: string) => {
    if (!confirm('Remove this item from course reserves?')) return;
    try {
      await api.delete(`/courses/${courseId}/reserves/${reserveId}`);
      fetchCourseData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove reserve');
    }
  };

  const handleSaveToShelf = async (itemType: 'BOOK' | 'RESOURCE', itemId: string, title?: string) => {
    if (!user) {
      alert('Please sign in to save items to your personal bookshelf.');
      return;
    }
    try {
      await api.post('/bookshelf', {
        item_type: itemType,
        item_id: itemId,
        shelf_status: 'WANT_TO_READ',
      });
      setSavedShelfIds((prev) => new Set(prev).add(itemId));
      alert(`Saved "${title || 'Item'}" to your bookshelf.`);
    } catch (err: any) {
      alert(err.message || 'Failed to save to bookshelf');
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId, fetchCourseData]);

  const handleDownload = async (resourceId: string, filename: string) => {
    try {
      const res = await api.get<{ downloadUrl: string }>(`/resources/${resourceId}/download`);
      if (res && res.downloadUrl) {
        const a = document.createElement('a');
        a.href = res.downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      alert(`Download failed: ${err.message || 'Access denied'}`);
    }
  };

  const handleToggleOffline = async (resource: LearningResource) => {
    setCachingId(resource.id);
    try {
      const isCached = cachedStatusMap[resource.id];
      if (isCached) {
        await removeResourceOffline(resource.id);
        setCachedStatusMap((prev) => ({ ...prev, [resource.id]: false }));
      } else {
        const presignRes = await api.get<{ downloadUrl: string }>(`/resources/${resource.id}/download`);
        const ok = await saveResourceOffline(resource.id, presignRes.downloadUrl, resource.title);
        if (ok) {
          setCachedStatusMap((prev) => ({ ...prev, [resource.id]: true }));
        }
      }
    } catch (err) {
      console.error('Failed to toggle offline caching', err);
    } finally {
      setCachingId(null);
    }
  };

  const handleCopyCode = async (snippetId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSnippetId(snippetId);
      setTimeout(() => setCopiedSnippetId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleOpenThread = async (thread: DiscussionThread) => {
    setActiveThread(thread);
    try {
      const res = await api.get<{ thread: DiscussionThread; posts: DiscussionPost[] }>(`/discussions/thread/${thread.id}`);
      setActiveThreadPosts(res.posts || []);
    } catch (err) {
      console.error('Failed to load thread posts', err);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim() || !newThreadContent.trim()) return;

    setIsPostingThread(true);
    try {
      const res = await api.post<{ thread: DiscussionThread }>(`/discussions/course/${courseId}`, {
        title: newThreadTitle,
        content: newThreadContent,
      });
      setThreads((prev) => [res.thread, ...prev]);
      setNewThreadTitle('');
      setNewThreadContent('');
      setShowThreadForm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to post thread');
    } finally {
      setIsPostingThread(false);
    }
  };

  const handleReplyToThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !newReplyContent.trim()) return;

    setIsPostingReply(true);
    try {
      const res = await api.post<{ post: DiscussionPost }>(`/discussions/thread/${activeThread.id}/posts`, {
        content: newReplyContent,
      });
      setActiveThreadPosts((prev) => [...prev, res.post]);
      setNewReplyContent('');
    } catch (err: any) {
      alert(err.message || 'Failed to post reply');
    } finally {
      setIsPostingReply(false);
    }
  };

  const handleModeratorDeletePost = async (postId: number) => {
    if (!window.confirm('Are you sure you want to moderate and redact this post?')) return;
    try {
      await api.delete(`/discussions/posts/${postId}`);
      setActiveThreadPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, is_deleted: true, content: '[This message has been removed by a moderator]' } : p
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to moderate post');
    }
  };

  const filteredResources = resources.filter((r) => {
    if (resourceFilter === 'ALL') return true;
    if (resourceFilter === 'DOCUMENTS') return ['DOCUMENT', 'SLIDE', 'PAST_QUESTION', 'NOTEBOOK', 'SPREADSHEET', 'CASE_STUDY'].includes(r.resource_type);
    if (resourceFilter === 'LABS') return ['CODE', 'DATASET', 'TOPOLOGY'].includes(r.resource_type);
    if (resourceFilter === 'VIDEOS') return r.resource_type === 'VIDEO';
    if (resourceFilter === 'EXTERNAL') return Boolean(r.external_url) || r.resource_type === 'EXTERNAL_LINK';
    return true;
  });

  const getFormatBadge = (type: string) => {
    switch (type) {
      case 'DOCUMENT':
      case 'SLIDE':
      case 'PAST_QUESTION':
        return { label: 'PDF', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'VIDEO':
        return { label: 'VIDEO', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'CODE':
        return { label: 'CODE', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'DATASET':
      case 'SPREADSHEET':
        return { label: 'DATASET', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
      default:
        return { label: type, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Skeleton Loading State
  if (loading && !course) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
          <div className="flex gap-2 mb-3">
            <div className="h-6 w-20 bg-slate-200 rounded-sm"></div>
            <div className="h-6 w-24 bg-slate-200 rounded-sm"></div>
          </div>
          <div className="h-8 w-3/4 bg-slate-200 rounded-md mb-2"></div>
          <div className="h-4 w-1/3 bg-slate-200 rounded-md"></div>
          <div className="flex gap-4 mt-6 pt-4 border-t border-slate-100">
            <div className="h-8 w-28 bg-slate-200 rounded-md"></div>
            <div className="h-8 w-28 bg-slate-200 rounded-md"></div>
            <div className="h-8 w-28 bg-slate-200 rounded-md"></div>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse flex justify-between items-center">
              <div className="space-y-2 w-2/3">
                <div className="h-4 w-24 bg-slate-200 rounded-sm"></div>
                <div className="h-5 w-3/4 bg-slate-200 rounded-md"></div>
                <div className="h-3 w-1/2 bg-slate-200 rounded-md"></div>
              </div>
              <div className="h-9 w-24 bg-slate-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Course Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
        {/* Subtle Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-800"></div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-sm bg-emerald-900 text-white tracking-wider">
                {course?.code}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                {course?.credit_units} Credit Units
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {course?.programme} • Year {course?.level} • Semester {course?.semester}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {course?.title}
            </h1>

            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Course Lecturer:</span>
              <span>{course?.lecturer_name || 'Department Faculty'}</span>
            </div>
          </div>

          {/* Action: Add Resource for Staff */}
          {isStaff && (
            <div className="flex-shrink-0 flex items-center gap-2">
              <button
                onClick={() => setIsBulkUploadOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px]"
                title="Batch upload multiple course materials at once"
              >
                <span>⚡</span>
                <span>Bulk Upload</span>
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[44px]"
              >
                <span className="text-base font-bold">+</span>
                <span>Upload Material</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 sm:gap-4 mt-6 border-b border-slate-200 overflow-x-auto pb-px">
          {[
            { id: 'RESOURCES', label: 'Learning Materials', count: resources.length },
            { id: 'SYLLABUS', label: 'Course Syllabus' },
            { id: 'LIBRARY', label: 'Library Shelf Holdings', count: libraryItems.length },
            { id: 'DISCUSSIONS', label: 'Academic Q&A Forum', count: threads.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setActiveThread(null);
                }}
                className={`py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 min-h-[44px] cursor-pointer ${
                  isActive
                    ? 'border-emerald-800 text-emerald-900 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${
                      isActive ? 'bg-emerald-100 text-emerald-900 font-bold' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: RESOURCES */}
      {activeTab === 'RESOURCES' && (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'ALL', label: 'All Materials' },
              { id: 'DOCUMENTS', label: 'Lecture Notes & Slides' },
              { id: 'LABS', label: 'Code & Datasets' },
              { id: 'VIDEOS', label: 'Video Lectures' },
              { id: 'EXTERNAL', label: 'External Links & Portals' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setResourceFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] cursor-pointer border ${
                  resourceFilter === f.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredResources.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                📂
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">No Course Materials Found</h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                No resources match the selected filter category for this course module yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResources.map((res) => {
                const badge = getFormatBadge(res.resource_type);
                const isCached = cachedStatusMap[res.id];
                const isCodeResource = res.resource_type === 'CODE';
                const youtubeId = extractYouTubeVideoId(res.video_id) || extractYouTubeVideoId(res.external_url);
                const isExternalPdf = Boolean(
                  res.external_url?.endsWith('.pdf') ||
                  res.external_url?.includes('arxiv.org/pdf') ||
                  res.external_url?.includes('/pdf')
                );

                return (
                  <div
                    key={res.id}
                    className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm border uppercase tracking-wider ${badge.bg}`}>
                            {badge.label}
                          </span>
                          {res.size_bytes && (
                            <span className="text-xs text-slate-500 font-mono tabular-nums">
                              {(res.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                          {isCached && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              ✓ Saved Offline
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                          {res.title}
                        </h3>

                        {res.description && (
                          <p className="text-xs sm:text-sm text-slate-600 line-clamp-2">
                            {res.description}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 pt-2 sm:pt-0">
                        {youtubeId ? (
                          <>
                            <button
                              onClick={() => setReadingResource({ ...res, video_id: youtubeId })}
                              className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold transition-colors min-h-[36px] flex items-center gap-1.5 shadow-xs cursor-pointer"
                              title="Watch video in browser theater mode"
                            >
                              <span>▶</span>
                              <span>Watch in Browser</span>
                            </button>

                            <button
                              onClick={() =>
                                setCitationItem({
                                  title: res.title,
                                  courseCode: course?.code,
                                  courseTitle: course?.title,
                                  author: res.uploader_name || course?.lecturer_name,
                                  year: new Date(res.created_at).getFullYear(),
                                  resourceType: res.resource_type,
                                })
                              }
                              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-200 transition-colors min-h-[36px] flex items-center gap-1 cursor-pointer"
                              title="Generate Academic Citation"
                            >
                              <span>📜</span>
                              <span>Cite</span>
                            </button>

                            {res.external_url && (
                              <a
                                href={res.external_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-md text-xs transition-colors shrink-0"
                                title="Open in YouTube"
                              >
                                <span>↗</span>
                              </a>
                            )}
                          </>
                        ) : res.r2_key ? (
                          <>
                            <button
                              onClick={() => setReadingResource(res)}
                              className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold transition-colors min-h-[36px] flex items-center gap-1.5 shadow-xs"
                              title="Read online in browser"
                            >
                              <span>📖</span>
                              <span>Read Online</span>
                            </button>

                            <button
                              onClick={() => handleDownload(res.id, res.title)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-semibold transition-colors min-h-[36px]"
                            >
                              Download
                            </button>

                            <button
                              onClick={() => handleToggleOffline(res)}
                              disabled={cachingId === res.id}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors min-h-[36px] ${
                                isCached
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {cachingId === res.id ? 'Saving...' : isCached ? 'Remove Offline' : 'Save Offline'}
                            </button>

                            <button
                              onClick={() =>
                                setCitationItem({
                                  title: res.title,
                                  courseCode: course?.code,
                                  courseTitle: course?.title,
                                  author: res.uploader_name || course?.lecturer_name,
                                  year: new Date(res.created_at).getFullYear(),
                                  resourceType: res.resource_type,
                                })
                              }
                              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-200 transition-colors min-h-[36px] flex items-center gap-1"
                              title="Generate Academic Citation"
                            >
                              <span>📜</span>
                              <span>Cite</span>
                            </button>
                          </>
                        ) : isExternalPdf ? (
                          <>
                            <button
                              onClick={() => setReadingResource(res)}
                              className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold transition-colors min-h-[36px] flex items-center gap-1.5 shadow-xs cursor-pointer"
                              title="Read PDF in browser"
                            >
                              <span>📖</span>
                              <span>Read in Browser</span>
                            </button>

                            <button
                              onClick={() =>
                                setCitationItem({
                                  title: res.title,
                                  courseCode: course?.code,
                                  courseTitle: course?.title,
                                  author: res.uploader_name || course?.lecturer_name,
                                  year: new Date(res.created_at).getFullYear(),
                                  resourceType: res.resource_type,
                                })
                              }
                              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-200 transition-colors min-h-[36px] flex items-center gap-1 cursor-pointer"
                              title="Generate Academic Citation"
                            >
                              <span>📜</span>
                              <span>Cite</span>
                            </button>

                            {res.external_url && (
                              <a
                                href={res.external_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-md text-xs transition-colors shrink-0"
                                title="Open original document link"
                              >
                                <span>↗</span>
                              </a>
                            )}
                          </>
                        ) : res.external_url ? (
                          <>
                            <button
                              onClick={() => setReadingResource(res)}
                              className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold transition-colors min-h-[36px] flex items-center gap-1.5 shadow-xs cursor-pointer"
                              title="Read in browser"
                            >
                              <span>📖</span>
                              <span>Read in Browser</span>
                            </button>
                            <a
                              href={res.external_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-md text-xs font-semibold transition-colors min-h-[36px]"
                            >
                              <span>Open External</span>
                              <span>↗</span>
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* CS & AI Code Block Display with Language Header & Copy Button */}
                    {isCodeResource && res.description && (
                      <div className="mt-3 rounded-md overflow-hidden border border-slate-800">
                        <div className="bg-[#0F172A] px-3 py-1.5 flex items-center justify-between text-xs text-slate-300">
                          <span className="font-mono text-emerald-400 font-semibold uppercase text-[11px]">
                            {res.description.includes('import') || res.description.includes('def') ? 'Python' : 'Script'}
                          </span>
                          <button
                            onClick={() => handleCopyCode(res.id, res.description || '')}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                          >
                            {copiedSnippetId === res.id ? '✓ Copied' : 'Copy Code'}
                          </button>
                        </div>
                        <pre className="p-3 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto m-0 leading-relaxed">
                          <code>{res.description}</code>
                        </pre>
                      </div>
                    )}

                    {/* Inline Video Player (Plays directly in the browser card) */}
                    {youtubeId && (
                      <div className="mt-4 max-w-2xl">
                        <YouTubeLite
                          videoId={youtubeId}
                          title={res.title}
                          startSeconds={res.start_seconds}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SYLLABUS */}
      {activeTab === 'SYLLABUS' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Official Course Syllabus & Instructional Plan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Approved curriculum guideline for Federal School of Statistics, Ibadan
              </p>
            </div>
            <button
              onClick={() => alert('Syllabus cached in local storage for offline reference.')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-xs font-semibold transition-colors self-start sm:self-auto min-h-[36px]"
            >
              <span>💾</span>
              <span>Save Syllabus Offline</span>
            </button>
          </div>

          <div className="space-y-5 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm uppercase tracking-wide mb-1">
                Course Description
              </h3>
              <p className="text-slate-600">
                {course?.description || 'Foundational curriculum course for Federal School of Statistics, Ibadan.'}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-bold text-slate-900 text-sm border-b border-slate-200 pb-2">
                Weekly Module Breakdown
              </h3>
              <div className="grid gap-2.5">
                {[
                  { weeks: 'Weeks 1 - 2', title: 'Orientation & Theoretical Foundations', desc: 'Introduction to foundational terminology, mathematical underpinnings, and historical context.' },
                  { weeks: 'Weeks 3 - 5', title: 'Core Principles & Structural Implementation', desc: 'In-depth conceptual study, structural data methods, and laboratory exercises.' },
                  { weeks: 'Weeks 6 - 7', title: 'Continuous Assessment Test (CAT) & Mid-Term Lab', desc: 'Practical lab examination and individual progress evaluation.' },
                  { weeks: 'Weeks 8 - 11', title: 'Advanced Applications & Empirical Case Studies', desc: 'Industry standards, applied statistics/computational techniques, and real-world datasets.' },
                  { weeks: 'Weeks 12 - 13', title: 'Revision & Practical Examination Defense', desc: 'Comprehensive curriculum review and final exam readiness.' },
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 bg-white border border-slate-200 rounded-lg">
                    <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-sm shrink-0 whitespace-nowrap">
                      {item.weeks}
                    </span>
                    <div>
                      <strong className="text-slate-900 block text-xs sm:text-sm">{item.title}</strong>
                      <span className="text-slate-500 text-xs">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
              <h3 className="font-bold text-emerald-950 text-xs sm:text-sm uppercase tracking-wide mb-2">
                Grading & Assessment Framework
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded border border-emerald-100">
                  <span className="text-xs text-slate-500 block">Attendance & Lab Work</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">20%</span>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100">
                  <span className="text-xs text-slate-500 block">Continuous Assessment Test</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">20%</span>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100">
                  <span className="text-xs text-slate-500 block">Semester Examination</span>
                  <span className="text-lg font-bold text-emerald-900 tabular-nums">60%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COURSE RESERVES & LIBRARY READINGS */}
      {activeTab === 'LIBRARY' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Syllabus Course Reserves & Library Collection
              </h2>
              <p className="text-xs text-slate-500">
                Mandatory textbook reserves, recommended readings, and real-time shelf availability for {course?.code}.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {isStaff && (
                <button
                  onClick={() => setShowAddReserve(!showAddReserve)}
                  className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>➕</span>
                  <span>{showAddReserve ? 'Close Reserve Form' : 'Assign Reserve'}</span>
                </button>
              )}
              <Link
                to="/library"
                className="text-xs font-semibold text-emerald-900 hover:text-emerald-800 underline px-2 py-1"
              >
                Full Catalog →
              </Link>
            </div>
          </div>

          {/* Staff Assign Course Reserve Form */}
          {showAddReserve && isStaff && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 space-y-4">
              <h3 className="text-xs sm:text-sm font-bold text-emerald-950 uppercase tracking-wide">
                Assign Reading to Course Reserves
              </h3>
              <form onSubmit={handleAddReserve} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Item Type</label>
                  <select
                    value={reserveItemType}
                    onChange={(e) => setReserveItemType(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md p-2"
                  >
                    <option value="BOOK">Physical Library Book</option>
                    <option value="RESOURCE">Digital Course Resource</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {reserveItemType === 'BOOK' ? 'Select Book / Enter ID' : 'Select Resource'}
                  </label>
                  {reserveItemType === 'BOOK' ? (
                    <select
                      value={reserveItemId}
                      onChange={(e) => setReserveItemId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-md p-2"
                      required
                    >
                      <option value="">-- Choose Library Book --</option>
                      {libraryItems.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title} ({b.call_number})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={reserveItemId}
                      onChange={(e) => setReserveItemId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-md p-2"
                      required
                    >
                      <option value="">-- Choose Uploaded Resource --</option>
                      {resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.resource_type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Requirement Level</label>
                  <select
                    value={reserveRequirement}
                    onChange={(e) => setReserveRequirement(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md p-2"
                  >
                    <option value="REQUIRED">🌟 REQUIRED (Mandatory)</option>
                    <option value="RECOMMENDED">📖 RECOMMENDED (Supplemental)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Instructor Syllabus Notes</label>
                  <input
                    type="text"
                    value={reserveNotes}
                    onChange={(e) => setReserveNotes(e.target.value)}
                    placeholder="e.g. Read Chapters 1-3 before Week 4"
                    className="w-full text-xs bg-white border border-slate-300 rounded-md p-2"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddReserve(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingReserve || !reserveItemId}
                    className="px-4 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-xs"
                  >
                    {isAddingReserve ? 'Assigning...' : 'Pin to Course Reserves'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Section 1: Official Course Reserves */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <span>🌟</span>
              <span>Official Syllabus Reserves ({reserves.length})</span>
            </h3>

            {reserves.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                No formal syllabus reserves pinned yet. Lecturers can assign required books from the catalog above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reserves.map((resItem) => {
                  const isRequired = resItem.requirement_level === 'REQUIRED';
                  return (
                    <div
                      key={resItem.id}
                      className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors ${
                        isRequired ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded tracking-wide ${
                              isRequired
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}
                          >
                            {resItem.requirement_level}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">
                            {resItem.item_type}
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1">
                          {resItem.title}
                        </h4>
                        <p className="text-xs text-slate-600 mb-2">By: {resItem.author}</p>

                        {resItem.call_number && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {resItem.call_number}
                            </span>
                            {typeof resItem.copies_available === 'number' && (
                              <span className="text-[11px] text-emerald-800 font-medium">
                                • {resItem.copies_available} on Central Library Shelf
                              </span>
                            )}
                          </div>
                        )}

                        {resItem.notes && (
                          <div className="bg-slate-50 border-l-2 border-amber-500 p-2 text-xs text-slate-700 italic my-2">
                            "{resItem.notes}"
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setCitationItem({
                                title: resItem.title || 'Course Reserve',
                                author: resItem.author,
                                courseCode: resItem.call_number || course?.code,
                                institution: 'Central Library, Federal School of Statistics, Ibadan',
                              })
                            }
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>📜</span>
                            <span>Cite</span>
                          </button>

                          <button
                            onClick={() => handleSaveToShelf(resItem.item_type, resItem.item_id, resItem.title)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>📌</span>
                            <span>{savedShelfIds.has(resItem.item_id) ? 'Saved' : 'Save'}</span>
                          </button>
                        </div>

                        {isStaff && (
                          <button
                            onClick={() => handleRemoveReserve(resItem.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: General Department Catalog Holdings */}
          {libraryItems.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                Additional Recommended Print Holdings in Library ({libraryItems.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {libraryItems.map((item) => {
                  const isAvailable = item.copies_available > 0;
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-sm bg-slate-900 text-white tracking-wider">
                            {item.call_number || 'QA276 .A45'}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 tabular-nums ${
                              isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                            <span>{item.copies_available} of {item.copies_total} Available</span>
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                          {item.title}
                        </h4>

                        <p className="text-xs text-slate-600 mb-3">
                          <span className="font-semibold text-slate-700">Author:</span> {item.author}
                        </p>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-700">
                        <span className="font-medium text-slate-500">
                          Shelf: <strong className="text-slate-800">{item.shelf_location || 'Central Library'}</strong>
                        </span>
                        <button
                          onClick={() => handleSaveToShelf('BOOK', String(item.id), item.title)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold"
                        >
                          📌 Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DISCUSSIONS */}
      {activeTab === 'DISCUSSIONS' && (
        <div>
          {activeThread ? (
            /* Thread Detail & Reply View */
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
              <button
                onClick={() => setActiveThread(null)}
                className="text-xs font-semibold text-emerald-900 hover:text-emerald-800 flex items-center gap-1 min-h-[36px] cursor-pointer"
              >
                ← Back to Discussion Threads
              </button>

              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mb-1">
                  {activeThread.title}
                </h2>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>Started by <strong className="text-slate-700">{activeThread.author_name}</strong></span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-semibold text-slate-600 uppercase">
                    {activeThread.author_role}
                  </span>
                  <span>• {new Date(activeThread.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Initial Post Body */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {activeThread.content}
              </div>

              {/* Replies Section */}
              <div className="space-y-3">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Responses ({activeThreadPosts.length})
                </h3>

                {activeThreadPosts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No replies yet. Be the first to share an answer or perspective.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {activeThreadPosts.map((post) => (
                      <div
                        key={post.id}
                        className={`p-3.5 rounded-lg border text-xs sm:text-sm ${
                          post.is_deleted
                            ? 'bg-rose-50 border-rose-200 text-rose-700 italic'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 text-xs">
                              {post.author_name}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded uppercase">
                              {post.author_role}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isStaff && !post.is_deleted && (
                              <button
                                onClick={() => handleModeratorDeletePost(post.id)}
                                className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                              >
                                Redact
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="leading-relaxed whitespace-pre-wrap">
                          {post.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply Composer */}
              <form onSubmit={handleReplyToThread} className="space-y-3 pt-2 border-t border-slate-100">
                <textarea
                  rows={3}
                  required
                  placeholder="Contribute an academic reply or answer..."
                  value={newReplyContent}
                  onChange={(e) => setNewReplyContent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                />
                <button
                  type="submit"
                  disabled={isPostingReply}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[40px] cursor-pointer disabled:opacity-50"
                >
                  {isPostingReply ? 'Submitting...' : 'Post Reply'}
                </button>
              </form>
            </div>
          ) : (
            /* Threads Overview */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Course Discussions & Academic Q&A
                  </h2>
                  <p className="text-xs text-slate-500">
                    Collaborate on lecture concepts, practical code assignments, and faculty questions.
                  </p>
                </div>
                <button
                  onClick={() => setShowThreadForm((prev) => !prev)}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors self-start sm:self-auto min-h-[40px] cursor-pointer"
                >
                  {showThreadForm ? 'Cancel' : '+ New Question / Thread'}
                </button>
              </div>

              {/* Thread Composer Form */}
              {showThreadForm && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Start a New Discussion</h3>
                  <form onSubmit={handleCreateThread} className="space-y-3">
                    <input
                      type="text"
                      required
                      placeholder="Title or summary of your question..."
                      value={newThreadTitle}
                      onChange={(e) => setNewThreadTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                    />
                    <textarea
                      rows={3}
                      required
                      placeholder="Describe your question or discussion topic in detail..."
                      value={newThreadContent}
                      onChange={(e) => setNewThreadContent(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                    />
                    <button
                      type="submit"
                      disabled={isPostingThread}
                      className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs sm:text-sm shadow-xs transition-colors min-h-[40px] cursor-pointer disabled:opacity-50"
                    >
                      {isPostingThread ? 'Publishing...' : 'Publish Thread'}
                    </button>
                  </form>
                </div>
              )}

              {/* Threads List */}
              {threads.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                    💬
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">No Discussion Threads Yet</h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                    Be the first student or faculty member to ask a question or start an academic conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {threads.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleOpenThread(t)}
                      className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                          {t.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>By <strong className="text-slate-700">{t.author_name}</strong></span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded uppercase">
                            {t.author_role}
                          </span>
                          <span>• {new Date(t.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-900 whitespace-nowrap">
                        View Thread →
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload Modal for Lecturers */}
      <ResourceUploadModal
        courseId={courseId}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => fetchCourseData()}
      />

      {/* Bulk Upload Modal for Lecturers/Admins */}
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={() => fetchCourseData()}
        defaultCourseId={courseId}
      />

      {/* In-Browser Reader Modal */}
      <ReaderModal
        isOpen={Boolean(readingResource)}
        resource={readingResource}
        onClose={() => setReadingResource(null)}
        onOpenCitation={(res) => {
          setCitationItem({
            title: res.title,
            courseCode: course?.code,
            courseTitle: course?.title,
            author: res.uploader_name || course?.lecturer_name,
            year: new Date(res.created_at).getFullYear(),
            resourceType: res.resource_type,
          });
        }}
      />

      {/* Academic Citation Modal */}
      <CitationModal
        isOpen={Boolean(citationItem)}
        item={citationItem}
        onClose={() => setCitationItem(null)}
      />
    </div>
  );
};
