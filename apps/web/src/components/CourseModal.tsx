import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Course } from '../types';
import { useAuth } from '../context/AuthContext';

interface CourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  courseToEdit?: Course | null;
}

const DEPARTMENTS = [
  { id: 1, code: 'CS', name: 'Computer Science' },
  { id: 2, code: 'ST', name: 'Statistics' },
  { id: 3, code: 'MTH', name: 'Mathematics' },
  { id: 4, code: 'SLT', name: 'Science Laboratory Technology' },
  { id: 5, code: 'BA', name: 'Business Administration' },
  { id: 6, code: 'ACC', name: 'Accounting' },
];

export const CourseModal: React.FC<CourseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  courseToEdit,
}) => {
  const { user } = useAuth();
  const isEditing = Boolean(courseToEdit);

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [programme, setProgramme] = useState<'ND' | 'HND'>('ND');
  const [level, setLevel] = useState<number>(1);
  const [semester, setSemester] = useState<number>(1);
  const [creditUnits, setCreditUnits] = useState<number>(2);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseToEdit) {
      setCode(courseToEdit.code || '');
      setTitle(courseToEdit.title || '');
      setDepartmentId(courseToEdit.department_id || '');
      setProgramme(courseToEdit.programme || 'ND');
      setLevel(courseToEdit.level || 1);
      setSemester(courseToEdit.semester || 1);
      setCreditUnits(courseToEdit.credit_units || 2);
      setDescription(courseToEdit.description || '');
    } else {
      setCode('');
      setTitle('');
      // If user is HOD, default to their department
      setDepartmentId(user?.department_id || 1);
      setProgramme('ND');
      setLevel(1);
      setSemester(1);
      setCreditUnits(2);
      setDescription('');
    }
    setError(null);
  }, [courseToEdit, isOpen, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      setError('Course code and title are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      department_id: departmentId ? Number(departmentId) : undefined,
      programme,
      level: Number(level),
      semester: Number(semester),
      credit_units: Number(creditUnits),
      description: description.trim() || null,
    };

    try {
      if (isEditing && courseToEdit) {
        await api.put(`/courses/${courseToEdit.id}`, payload);
      } else {
        await api.post('/courses', payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save course.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white tracking-widest uppercase">
              Curriculum Management
            </span>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {isEditing ? `Edit Course ${courseToEdit?.code}` : 'Add New Academic Course'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Course Code *</label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. COM 111"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 disabled:bg-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Course Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Introduction to Computing"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Academic Department *</label>
              <select
                value={departmentId}
                disabled={user?.role === 'HOD'}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800 disabled:bg-slate-100"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Programme *</label>
              <select
                value={programme}
                onChange={(e) => setProgramme(e.target.value as 'ND' | 'HND')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value="ND">National Diploma (ND)</option>
                <option value="HND">Higher National Diploma (HND)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Year / Level *</label>
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Semester *</label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value={1}>1st Semester</option>
                <option value={2}>2nd Semester</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Credit Units *</label>
              <input
                type="number"
                min="1"
                max="6"
                required
                value={creditUnits}
                onChange={(e) => setCreditUnits(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Course Description (Optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline syllabus, prerequisites, and learning objectives..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Course' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
