import React, { createContext, useContext, useState, useEffect } from 'react';

type DatabaseMode = 'supabase' | 'firebase' | 'both';
type DatabaseReadMode = 'supabase' | 'firebase';

interface DatabaseContextType {
  writeMode: DatabaseMode;
  setWriteMode: (mode: DatabaseMode) => void;
  readMode: DatabaseReadMode;
  setReadMode: (mode: DatabaseReadMode) => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [writeMode, setWriteModeState] = useState<DatabaseMode>(() => {
    const saved = localStorage.getItem('db_write_mode');
    return (saved as DatabaseMode) || 'both'; // Default to both as user requested
  });

  const [readMode, setReadModeState] = useState<DatabaseReadMode>(() => {
    const saved = localStorage.getItem('db_read_mode');
    return (saved as DatabaseReadMode) || 'supabase';
  });

  const setWriteMode = (mode: DatabaseMode) => {
    setWriteModeState(mode);
    localStorage.setItem('db_write_mode', mode);
  };

  const setReadMode = (mode: DatabaseReadMode) => {
    setReadModeState(mode);
    localStorage.setItem('db_read_mode', mode);
  };

  return (
    <DatabaseContext.Provider value={{ writeMode, setWriteMode, readMode, setReadMode }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabaseConfig = () => {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabaseConfig must be used within a DatabaseProvider');
  }
  return context;
};
