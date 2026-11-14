import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export const ServerWakingBanner: React.FC = () => {
  const [isWaking, setIsWaking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    return api.subscribeWakingState((waking, retries) => {
      setIsWaking(waking);
      setAttempt(retries);
    });
  }, []);

  if (!isWaking) return null;

  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#fef3c7',
        color: '#92400e',
        borderBottom: '1px solid #fde68a',
        padding: '0.75rem 1.25rem',
        fontSize: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>⏳</span>
      <div>
        <strong>Server is waking up:</strong> Our backend is running on Render free tier and spinning up after inactivity (~30-50s).
        Retrying request automatically (attempt #{attempt})...
      </div>
    </div>
  );
};

