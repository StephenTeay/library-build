import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CACHE_NAME = 'fss-offline-resources-v1';

export interface StorageEstimate {
  usageBytes: number;
  quotaBytes: number;
  usageFormatted: string;
  quotaFormatted: string;
  percent: number;
}

interface OfflineContextType {
  isOnline: boolean;
  storage: StorageEstimate;
  refreshStorageEstimate: () => Promise<void>;
  saveResourceOffline: (resourceId: string, downloadUrl: string, filename: string) => Promise<boolean>;
  removeResourceOffline: (resourceId: string) => Promise<void>;
  isResourceCached: (resourceId: string) => Promise<boolean>;
  clearOfflineStorage: () => Promise<void>;
}

const defaultStorage: StorageEstimate = {
  usageBytes: 0,
  quotaBytes: 0,
  usageFormatted: '0 MB',
  quotaFormatted: '0 MB',
  percent: 0,
};

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  storage: defaultStorage,
  refreshStorageEstimate: async () => {},
  saveResourceOffline: async () => false,
  removeResourceOffline: async () => {},
  isResourceCached: async () => false,
  clearOfflineStorage: async () => {},
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [storage, setStorage] = useState<StorageEstimate>(defaultStorage);

  const refreshStorageEstimate = useCallback(async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 1;
        const percent = Math.min(100, Math.round((usage / quota) * 100));

        setStorage({
          usageBytes: usage,
          quotaBytes: quota,
          usageFormatted: formatBytes(usage),
          quotaFormatted: formatBytes(quota),
          percent,
        });
      } catch (err) {
        console.warn('Could not read storage estimate', err);
      }
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshStorageEstimate();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshStorageEstimate]);

  const saveResourceOffline = async (resourceId: string, downloadUrl: string, filename: string): Promise<boolean> => {
    try {
      if (!('caches' in window)) return false;
      const cache = await caches.open(CACHE_NAME);
      const res = await fetch(downloadUrl);
      if (!res.ok) return false;

      // Store with custom header for original filename
      const blob = await res.blob();
      const customResponse = new Response(blob, {
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
          'X-Original-Filename': filename,
          'X-Resource-Id': resourceId,
          'X-Cached-Date': new Date().toISOString(),
        },
      });

      await cache.put(`/offline/resource/${resourceId}`, customResponse);
      await refreshStorageEstimate();
      return true;
    } catch (err) {
      console.error('Failed to cache resource offline', err);
      return false;
    }
  };

  const removeResourceOffline = async (resourceId: string): Promise<void> => {
    try {
      if (!('caches' in window)) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(`/offline/resource/${resourceId}`);
      await refreshStorageEstimate();
    } catch (err) {
      console.error('Failed to delete cached resource', err);
    }
  };

  const isResourceCached = async (resourceId: string): Promise<boolean> => {
    try {
      if (!('caches' in window)) return false;
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(`/offline/resource/${resourceId}`);
      return !!match;
    } catch {
      return false;
    }
  };

  const clearOfflineStorage = async (): Promise<void> => {
    try {
      if ('caches' in window) {
        await caches.delete(CACHE_NAME);
      }
      await refreshStorageEstimate();
    } catch (err) {
      console.error('Failed to clear offline storage', err);
    }
  };

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        storage,
        refreshStorageEstimate,
        saveResourceOffline,
        removeResourceOffline,
        isResourceCached,
        clearOfflineStorage,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);

