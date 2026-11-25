import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { LibraryItem } from '../types';

interface BookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bookToEdit?: LibraryItem | null;
}

const DEPARTMENTS = [
  { id: 1, code: 'CS', name: 'Computer Science' },
  { id: 2, code: 'ST', name: 'Statistics' },
  { id: 3, code: 'MTH', name: 'Mathematics' },
  { id: 4, code: 'SLT', name: 'Science Laboratory Technology' },
  { id: 5, code: 'BA', name: 'Business Administration' },
  { id: 6, code: 'ACC', name: 'Accounting' },
];

export const BookModal: React.FC<BookModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  bookToEdit,
}) => {
  const isEditing = Boolean(bookToEdit);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [callNumber, setCallNumber] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [copiesTotal, setCopiesTotal] = useState<number>(1);
  const [copiesAvailable, setCopiesAvailable] = useState<number>(1);
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bookToEdit) {
      setTitle(bookToEdit.title || '');
      setAuthor(bookToEdit.author || '');
      setIsbn(bookToEdit.isbn || '');
      setCallNumber(bookToEdit.call_number || '');
      setShelfLocation(bookToEdit.shelf_location || '');
      setCopiesTotal(bookToEdit.copies_total || 1);
      setCopiesAvailable(bookToEdit.copies_available || 1);
      setDepartmentId(bookToEdit.department_id || '');
    } else {
      setTitle('');
      setAuthor('');
      setIsbn('');
      setCallNumber('');
      setShelfLocation('Shelf A-01');
      setCopiesTotal(1);
      setCopiesAvailable(1);
      setDepartmentId('');
    }
    setError(null);
  }, [bookToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim() || !callNumber.trim() || !shelfLocation.trim()) {
      setError('Title, Author, Call Number, and Shelf Location are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || null,
      call_number: callNumber.trim(),
      shelf_location: shelfLocation.trim(),
      copies_total: Number(copiesTotal) || 1,
      copies_available: Number(copiesAvailable) || 1,
      department_id: departmentId ? Number(departmentId) : null,
    };

    try {
      if (isEditing && bookToEdit) {
        await api.put(`/library/items/${bookToEdit.id}`, payload);
      } else {
        await api.post('/library/items', payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save book record.');
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
              Library Catalog
            </span>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {isEditing ? 'Edit Book Record' : 'Add New Library Book'}
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
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Book Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Probability & Mathematical Statistics"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Author(s) *</label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. J.S. Milton & Jesse C. Arnold"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Call Number *</label>
              <input
                type="text"
                required
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                placeholder="e.g. QA273 .M55 2003"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shelf Location *</label>
              <input
                type="text"
                required
                value={shelfLocation}
                onChange={(e) => setShelfLocation(e.target.value)}
                placeholder="e.g. Shelf B-04"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">ISBN (Optional)</label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="e.g. 978-0072468366"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              >
                <option value="">General / Central Library</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Total Copies *</label>
              <input
                type="number"
                min="1"
                required
                value={copiesTotal}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCopiesTotal(val);
                  if (!isEditing) setCopiesAvailable(val);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Available Copies *</label>
              <input
                type="number"
                min="0"
                max={copiesTotal}
                required
                value={copiesAvailable}
                onChange={(e) => setCopiesAvailable(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
              />
            </div>
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
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Book' : 'Add Book'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
