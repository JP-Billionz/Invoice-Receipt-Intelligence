
import React, { useState, useEffect, useCallback } from 'react';

interface FolderWatcherProps {
  onFilesFound: (files: File[], source: 'folder-watcher') => void;
}

const FREQUENCY_OPTIONS = [
  { label: 'Every 1 minute', value: 60000 },
  { label: 'Every 2 hours', value: 7200000 },
  { label: 'Every 6 hours', value: 21600000 },
  { label: 'Every 12 hours', value: 43200000 },
  { label: 'Every 24 hours', value: 86400000 },
];

const FolderWatcher: React.FC<FolderWatcherProps> = ({ onFilesFound }) => {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isSupported, setIsSupported] = useState(true);
  const [frequency, setFrequency] = useState<number>(() => {
    const saved = localStorage.getItem('folderWatchInterval');
    return saved ? parseInt(saved, 10) : 7200000; // Default 2 hours
  });
  const [nextScanTime, setNextScanTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [ignoreHistory, setIgnoreHistory] = useState(() => {
    return localStorage.getItem('folderWatchIgnoreHistory') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('folderWatchIgnoreHistory', ignoreHistory.toString());
  }, [ignoreHistory]);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('folderWatchInterval', frequency.toString());
  }, [frequency]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 10));
  }, []);

  const scanFolder = useCallback(async (handle: FileSystemDirectoryHandle) => {
    addLog("Scanning folder for new invoices...");
    const processedFiles = ignoreHistory ? [] : JSON.parse(localStorage.getItem('processedFiles') || '[]');
    const newFiles: File[] = [];
    const newProcessedFiles = ignoreHistory ? [] : [...processedFiles];

    try {
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const isEligible = (file.type.startsWith('image/') || file.type === 'application/pdf');
          
          if (isEligible && (ignoreHistory || !processedFiles.includes(file.name))) {
            addLog(`Found ${file.name} — queuing...`);
            newFiles.push(file);
            if (!ignoreHistory) {
              newProcessedFiles.push(file.name);
            }
          }
        }
      }

      if (newFiles.length > 0) {
        if (!ignoreHistory) {
          localStorage.setItem('processedFiles', JSON.stringify(newProcessedFiles));
        }
        onFilesFound(newFiles, 'folder-watcher');
      } else {
        addLog("No new files found.");
      }
    } catch (err) {
      console.error(err);
      addLog("Error scanning folder.");
    }
  }, [onFilesFound, addLog]);

  useEffect(() => {
    let interval: any;
    if (isWatching && dirHandle) {
      const runScan = () => {
        scanFolder(dirHandle);
        setNextScanTime(Date.now() + frequency);
      };

      runScan();
      interval = setInterval(runScan, frequency);
    } else {
      setNextScanTime(null);
    }
    return () => clearInterval(interval);
  }, [isWatching, dirHandle, scanFolder, frequency]);

  useEffect(() => {
    let timer: any;
    if (isWatching && nextScanTime) {
      const updateCountdown = () => {
        const now = Date.now();
        const diff = nextScanTime - now;
        if (diff <= 0) {
          setCountdown('Scanning now...');
          return;
        }

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);

        setCountdown(parts.join(' '));
      };

      updateCountdown();
      timer = setInterval(updateCountdown, 1000);
    } else {
      setCountdown('');
    }
    return () => clearInterval(timer);
  }, [isWatching, nextScanTime]);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handlePickFolder = async () => {
    addLog("Requesting folder access...");
    setErrorStatus(null);
    try {
      if (!('showDirectoryPicker' in window)) {
        addLog("Error: API not supported");
        setErrorStatus("Your browser does not support the File System Access API.");
        return;
      }
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      addLog(`Selected folder: ${handle.name}`);
    } catch (err: any) {
      console.error("Folder picker error:", err);
      if (err.name === 'AbortError') {
        addLog("Selection cancelled.");
      } else if (err.name === 'SecurityError' || err.name === 'NotAllowedError' || err.message?.includes('sub frames')) {
        addLog("Iframe restriction detected.");
        setErrorStatus("Iframe restricted: Please open the app in a new tab to use Folder Watcher.");
      } else {
        addLog(`Error: ${err.message || 'Unknown error'}`);
        setErrorStatus(`Access failed: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  if (!isSupported) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800 font-medium">
          ⚠️ Folder Watch is not supported in your browser. Please use Chrome or Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Folder Watcher</h3>
        {errorStatus && (
          <p className="text-[8px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full animate-pulse max-w-[150px] truncate" title={errorStatus}>
            {errorStatus}
          </p>
        )}
        {dirHandle && (
          <button
            onClick={() => setIsWatching(!isWatching)}
            className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-black transition-all tracking-widest ${
              isWatching ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            }`}
          >
            {isWatching ? 'STOP WATCH' : 'START WATCH'}
          </button>
        )}
      </div>

      {!dirHandle ? (
        <div className="flex flex-col space-y-3">
          <button
            onClick={handlePickFolder}
            className="w-full py-4 px-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center space-x-3 active:scale-[0.98]"
          >
            <span className="text-xl">📁</span>
            <span>Connect Local Folder</span>
          </button>
          
          {isInIframe && (
            <div className={`p-4 rounded-2xl border flex flex-col items-center space-y-2 transition-all ${errorStatus && errorStatus.includes('Iframe') ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                Iframe restriction detected
              </p>
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full py-2 px-4 bg-indigo-600 text-white rounded-xl text-[10px] font-black text-center uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Open in new tab ↗
              </a>
              <p className="text-[8px] text-slate-400 font-medium text-center px-4 leading-relaxed">
                Browsers prevent folder access inside iframes for your security.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3 text-sm text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="font-black text-indigo-600">WATCHING:</span>
              <span className="truncate font-medium">{dirHandle.name}</span>
            </div>
            {isWatching && countdown && (
              <p className="text-[10px] font-black text-indigo-600 px-1 uppercase tracking-widest">
                Next scan in: {countdown}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="scan-frequency" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Scan frequency
            </label>
            <select
              id="scan-frequency"
              value={frequency}
              onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Re-scan All Files</p>
              <p className="text-[8px] text-slate-400 font-medium leading-tight">Ignore history and scan every file every time.</p>
            </div>
            <button
              onClick={() => setIgnoreHistory(!ignoreHistory)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${ignoreHistory ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ignoreHistory ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activity Log</p>
              <button 
                onClick={() => {
                  localStorage.removeItem('processedFiles');
                  addLog("Processed files history cleared.");
                }}
                className="text-[8px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
              >
                Clear History
              </button>
            </div>
            <div className="h-28 overflow-y-auto bg-slate-900 rounded-2xl p-4 font-mono text-[10px] text-emerald-400 space-y-1 shadow-inner border border-slate-800">
              {logs.length === 0 ? (
                <p className="text-slate-600 italic">Listening for new files...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex space-x-3 border-l border-white/10 pl-3">
                    <span className="text-slate-600 shrink-0">{new Date().toLocaleTimeString()}</span>
                    <span className="font-medium text-slate-300">{log}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FolderWatcher;
