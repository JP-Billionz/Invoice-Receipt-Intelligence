'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Folder Watcher — desktop-only feature ported from prototype's
 * `components/FolderWatcher.tsx`.
 *
 * Uses the File System Access API (`window.showDirectoryPicker`) which is
 * Chromium-only (desktop Chrome / Edge / Brave). Per Plan §3.8 / §4.8: gate
 * behind a capability check + show a clear "Desktop browser only" banner
 * on iOS / Safari / Firefox / mobile so users understand why it's missing.
 *
 * Periodically scans the selected folder for new image/PDF files and
 * dispatches them to the parent. Dedup history lives in localStorage so a
 * file scanned once doesn't get re-processed every interval.
 */

interface FolderWatcherProps {
  onFilesFound: (files: File[]) => void;
}

const FREQUENCY_OPTIONS = [
  { label: 'Every 1 minute', value: 60_000 },
  { label: 'Every 2 hours', value: 7_200_000 },
  { label: 'Every 6 hours', value: 21_600_000 },
  { label: 'Every 12 hours', value: 43_200_000 },
  { label: 'Every 24 hours', value: 86_400_000 },
];

export const FolderWatcher: React.FC<FolderWatcherProps> = ({
  onFilesFound,
}) => {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(
    null,
  );
  const [isWatching, setIsWatching] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isSupported, setIsSupported] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<number>(() => {
    if (typeof window === 'undefined') return 7_200_000;
    const saved = localStorage.getItem('folderWatchInterval');
    return saved ? parseInt(saved, 10) : 7_200_000;
  });
  const [nextScanTime, setNextScanTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [ignoreHistory, setIgnoreHistory] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('folderWatchIgnoreHistory') === 'true';
  });

  // Capability check on mount.
  useEffect(() => {
    if (typeof window !== 'undefined' && !('showDirectoryPicker' in window)) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('folderWatchInterval', String(frequency));
    }
  }, [frequency]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'folderWatchIgnoreHistory',
        String(ignoreHistory),
      );
    }
  }, [ignoreHistory]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [msg, ...prev].slice(0, 10));
  }, []);

  const scanFolder = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      addLog('Scanning folder for new invoices...');
      const processedFiles = ignoreHistory
        ? []
        : (JSON.parse(localStorage.getItem('processedFiles') || '[]') as string[]);
      const newFiles: File[] = [];
      const newProcessedFiles = ignoreHistory ? [] : [...processedFiles];

      try {
        // FileSystemDirectoryHandle.values() exists at runtime; TS lib types are stale.
        for await (const entry of (handle as unknown as {
          values: () => AsyncIterable<FileSystemHandle>;
        }).values()) {
          if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            const isEligible =
              file.type.startsWith('image/') ||
              file.type === 'application/pdf';

            if (
              isEligible &&
              (ignoreHistory || !processedFiles.includes(file.name))
            ) {
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
            localStorage.setItem(
              'processedFiles',
              JSON.stringify(newProcessedFiles),
            );
          }
          onFilesFound(newFiles);
        } else {
          addLog('No new files found.');
        }
      } catch (err) {
        console.error(err);
        addLog('Error scanning folder.');
      }
    },
    [onFilesFound, addLog, ignoreHistory],
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
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
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWatching, dirHandle, scanFolder, frequency]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isWatching && nextScanTime) {
      const updateCountdown = () => {
        const now = Date.now();
        const diff = nextScanTime - now;
        if (diff <= 0) {
          setCountdown('Scanning now...');
          return;
        }
        const hours = Math.floor(diff / 3_600_000);
        const minutes = Math.floor((diff % 3_600_000) / 60_000);
        const seconds = Math.floor((diff % 60_000) / 1000);
        const parts: string[] = [];
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
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isWatching, nextScanTime]);

  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  const handlePickFolder = async () => {
    addLog('Requesting folder access...');
    setErrorStatus(null);
    try {
      if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
        addLog('Error: API not supported');
        setErrorStatus(
          'Your browser does not support the File System Access API.',
        );
        return;
      }
      const handle = await (
        window as unknown as {
          showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker();
      setDirHandle(handle);
      addLog(`Selected folder: ${handle.name}`);
    } catch (err: unknown) {
      console.error('Folder picker error:', err);
      const e = err as { name?: string; message?: string };
      if (e.name === 'AbortError') {
        addLog('Selection cancelled.');
      } else if (
        e.name === 'SecurityError' ||
        e.name === 'NotAllowedError' ||
        e.message?.includes('sub frames')
      ) {
        addLog('Iframe restriction detected.');
        setErrorStatus(
          'Iframe restricted: Please open the app in a new tab to use Folder Watcher.',
        );
      } else {
        addLog(`Error: ${e.message || 'Unknown error'}`);
        setErrorStatus(`Access failed: ${e.message || 'Unknown error'}`);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Capability gate — render a clear "desktop only" notice on unsupported
  // browsers (Safari, Firefox, mobile) instead of a broken-looking widget.
  // -------------------------------------------------------------------------
  if (!isSupported) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800 font-medium">
          ⚠️ Folder Watcher requires desktop Chrome or Edge. Use the upload box
          above on this device.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
          Folder Watcher
        </h3>
        {errorStatus && (
          <p
            className="text-[8px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full animate-pulse max-w-[150px] truncate"
            title={errorStatus}
          >
            {errorStatus}
          </p>
        )}
        {dirHandle && (
          <button
            onClick={() => setIsWatching(!isWatching)}
            className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-black transition-all tracking-widest ${
              isWatching
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-aisb-green/10 text-aisb-green-deep hover:bg-aisb-green/20'
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
            className="w-full py-4 px-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:border-aisb-purple hover:text-aisb-purple transition-all flex items-center justify-center space-x-3 active:scale-[0.98]"
          >
            <span className="text-xl">📁</span>
            <span>Connect Local Folder</span>
          </button>

          {isInIframe && (
            <div
              className={`p-4 rounded-2xl border flex flex-col items-center space-y-2 transition-all ${
                errorStatus?.includes('Iframe')
                  ? 'bg-aisb-purple/5 border-aisb-purple/30'
                  : 'bg-slate-50 border-slate-100'
              }`}
            >
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                Iframe restriction detected
              </p>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-4 bg-aisb-purple text-white rounded-xl text-[10px] font-black text-center uppercase tracking-widest hover:bg-aisb-purple-deep transition-colors shadow-sm"
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
              <span className="font-black text-aisb-purple-deep">WATCHING:</span>
              <span className="truncate font-medium">{dirHandle.name}</span>
            </div>
            {isWatching && countdown && (
              <p className="text-[10px] font-black text-aisb-purple-deep px-1 uppercase tracking-widest">
                Next scan in: {countdown}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="scan-frequency"
              className="text-[10px] font-black text-slate-500 uppercase tracking-widest"
            >
              Scan frequency
            </label>
            <select
              id="scan-frequency"
              value={frequency}
              onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 font-black focus:outline-none focus:ring-2 focus:ring-aisb-purple cursor-pointer appearance-none"
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
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                Re-scan All Files
              </p>
              <p className="text-[8px] text-slate-400 font-medium leading-tight">
                Ignore history and scan every file every time.
              </p>
            </div>
            <button
              onClick={() => setIgnoreHistory(!ignoreHistory)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                ignoreHistory ? 'bg-aisb-purple' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  ignoreHistory ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Activity Log
              </p>
              <button
                onClick={() => {
                  localStorage.removeItem('processedFiles');
                  addLog('Processed files history cleared.');
                }}
                className="text-[8px] font-black text-slate-400 hover:text-aisb-purple uppercase tracking-widest transition-colors"
              >
                Clear History
              </button>
            </div>
            <div className="h-28 overflow-y-auto bg-slate-900 rounded-2xl p-4 font-mono text-[10px] text-aisb-green space-y-1 shadow-inner border border-slate-800">
              {logs.length === 0 ? (
                <p className="text-slate-600 italic">Listening for new files...</p>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className="flex space-x-3 border-l border-white/10 pl-3"
                  >
                    <span className="text-slate-600 shrink-0">
                      {new Date().toLocaleTimeString()}
                    </span>
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
