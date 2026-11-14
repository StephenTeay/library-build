import React, { useState } from 'react';
import { useOffline } from '../context/OfflineContext';

export const StorageGauge: React.FC = () => {
  const { storage, clearOfflineStorage } = useOffline();
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to delete all cached offline lecture notes and resources?')) {
      setClearing(true);
      await clearOfflineStorage();
      setClearing(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.125rem' }}>💾</span>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>Offline Device Storage</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {storage.usageFormatted} of {storage.quotaFormatted}
        </span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#f1f5f9',
          borderRadius: '9999px',
          overflow: 'hidden',
          marginBottom: '0.75rem',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, storage.percent)}%`,
            height: '100%',
            backgroundColor: storage.percent > 85 ? '#ef4444' : '#0f766e',
            borderRadius: '9999px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          Saved materials remain accessible without mobile data.
        </span>
        {storage.usageBytes > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            style={{
              fontSize: '0.75rem',
              color: '#dc2626',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              fontWeight: 500,
            }}
          >
            {clearing ? 'Clearing...' : 'Clear Storage'}
          </button>
        )}
      </div>
    </div>
  );
};

