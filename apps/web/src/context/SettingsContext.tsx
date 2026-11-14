import React, { createContext, useContext, useState, useEffect } from 'react';

interface SettingsContextType {
  dataSaver: boolean;
  toggleDataSaver: () => void;
  setDataSaver: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  dataSaver: false,
  toggleDataSaver: () => {},
  setDataSaver: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dataSaver, setDataSaverState] = useState<boolean>(() => {
    return localStorage.getItem('fss_data_saver') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('fss_data_saver', String(dataSaver));
  }, [dataSaver]);

  const toggleDataSaver = () => {
    setDataSaverState((prev) => !prev);
  };

  const setDataSaver = (value: boolean) => {
    setDataSaverState(value);
  };

  return (
    <SettingsContext.Provider value={{ dataSaver, toggleDataSaver, setDataSaver }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

