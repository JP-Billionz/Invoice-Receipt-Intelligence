'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ChartBarIcon, DocumentIcon, ExcelIcon, MoneyIcon, SpinnerIcon, UploadIcon } from '@/components/icons';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { FileUpload } from './FileUpload';
import { FolderWatcher } from './FolderWatcher';
import { JournalEntryTable } from './JournalEntryTable';
import { LineItemTable } from './LineItemTable';
import { PriceComparisonTable, type ComparisonRow } from './PriceComparisonTable';
import { QueueList, type QueueEntry } from './QueueList';

import { makeFireOnceTracker } from '@/lib/scanner/fire-once-tracker';
import type { ScanResponse } from '@/lib/scan/serialize';

interface ScannerClientProps {
  /** Tenant currency for display fallback (Plan §4.6). */
  tenantCurrency: string;
}

type LocalId = string;

interface QueueItem {
  localId: LocalId;
  fileName: string;
  fileType: string;
  /** Data URL preview, only for single-mode rendering. */
  previewSrc: string | null;
  uploadState: 'uploading' | 'submitted' | 'failed';
  uploadError?: string;
  scanId?: string;
  scan?: ScanResponse;
  comparisons?: ComparisonRow[];
  comparisonState?: 'idle' | 'loading' | 'loaded' | 'failed';
  comparisonError?: string;
}

const POLL_INTERVAL_MS = 1_500;
const TERMINAL_STATUSES: ReadonlyArray<ScanResponse['status']> = [
  'DONE',
  'ERROR',
  'DUPLICATE_DETECTED',
  'EXCLUDED',
];

function isTerminal(status: ScanResponse['status']): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function makeLocalId(): LocalId {
  return Math.random().toString(36).slice(2);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Main scanner orchestrator. Handles:
 *   - single + bulk + folder-watcher modes
 *   - upload (POST /api/scan, gets {scanId, status: PENDING})
 *   - async polling per scan (GET /api/scan/[scanId] every 1.5s until terminal)
 *   - auto-firing POST /api/scan/[scanId]/comparison after DONE in single mode
 *   - rendering JournalEntryTable / LineItemTable / PriceComparisonTable
 *   - Excel download links (single + bulk)
 *   - ignoreVat toggle (persisted to localStorage like the prototype did)
 *   - duplicate-detection report banner
 *
 * Per Cowork's scope: NO synchronous fallback — always polls.
 * Brand: AISB tokens throughout, no indigo/emerald carryover.
 */
export const ScannerClient: React.FC<ScannerClientProps> = ({
  tenantCurrency,
}) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedLocalId, setSelectedLocalId] = useState<LocalId | null>(null);
  const [activeTab, setActiveTab] = useState<
    'journal' | 'comparison' | 'analytics'
  >('journal');
  const [ignoreVat, setIgnoreVat] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ignoreVat') === 'true';
  });
  const [showDuplicateReport, setShowDuplicateReport] = useState(true);

  // Persist ignoreVat to localStorage like the prototype.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ignoreVat', String(ignoreVat));
    }
  }, [ignoreVat]);

  // -----------------------------------------------------------------------
  // Upload: POST /api/scan per file. Adds queue rows synchronously; the
  // POST resolves later with scanId.
  // -----------------------------------------------------------------------
  const handleFilesSelect = useCallback(
    async (files: File[], opts: { force?: 'single' | 'bulk' } = {}) => {
      if (files.length === 0) return;

      // Mode switching: a single file in single mode does single; multiple
      // files OR explicit bulk force → bulk.
      const targetMode =
        opts.force ?? (files.length === 1 && mode === 'single' ? 'single' : 'bulk');
      setMode(targetMode);

      const newItems: QueueItem[] = await Promise.all(
        files.map(async (file) => {
          let previewSrc: string | null = null;
          if (
            targetMode === 'single' &&
            (file.type.startsWith('image/') || file.type === 'application/pdf')
          ) {
            try {
              previewSrc = await readFileAsDataUrl(file);
            } catch {
              previewSrc = null;
            }
          }
          return {
            localId: makeLocalId(),
            fileName: file.name,
            fileType: file.type,
            previewSrc,
            uploadState: 'uploading' as const,
          };
        }),
      );

      setQueue((prev) => [...prev, ...newItems]);
      if (targetMode === 'single' || !selectedLocalId) {
        setSelectedLocalId(newItems[0].localId);
      }

      // Fire uploads in parallel. The per-tenant rate limit will 429 a hot
      // tenant — we surface it on the item without blocking the queue.
      await Promise.all(
        newItems.map(async (item, idx) => {
          const file = files[idx];
          try {
            const form = new FormData();
            form.append('file', file);
            form.append(
              'source',
              targetMode === 'bulk' ? 'BULK' : 'SINGLE',
            );
            const res = await fetch('/api/scan', {
              method: 'POST',
              body: form,
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(
                res.status === 429
                  ? 'Rate-limited by your workspace bucket. Retry shortly.'
                  : text || `Upload failed (${res.status})`,
              );
            }
            const body = (await res.json()) as {
              scanId: string;
              status: ScanResponse['status'];
            };
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? {
                      ...q,
                      scanId: body.scanId,
                      uploadState: 'submitted',
                      scan: undefined,
                      comparisonState: 'idle',
                    }
                  : q,
              ),
            );
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : 'Upload failed.';
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId
                  ? { ...q, uploadState: 'failed', uploadError: message }
                  : q,
              ),
            );
          }
        }),
      );
    },
    [mode, selectedLocalId],
  );

  // -----------------------------------------------------------------------
  // Polling — interval starts/stops based on whether any scan is still
  // non-terminal. When the queue is empty or every scan is terminal, the
  // interval is cleared (no wasted fetches, no surface for runaway bugs).
  //
  // Re-armed automatically the next time `pendingCount` flips above zero
  // (e.g. user uploads another file).
  // -----------------------------------------------------------------------
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const pendingCount = useMemo(
    () =>
      queue.reduce(
        (n, q) =>
          q.scanId && (q.scan == null || !isTerminal(q.scan.status))
            ? n + 1
            : n,
        0,
      ),
    [queue],
  );

  useEffect(() => {
    if (pendingCount === 0) return; // No interval armed.

    const tick = async () => {
      const itemsToPoll = queueRef.current.filter(
        (q) =>
          q.scanId &&
          (q.scan == null || !isTerminal(q.scan.status)),
      );
      if (itemsToPoll.length === 0) return;

      await Promise.all(
        itemsToPoll.map(async (item) => {
          try {
            const res = await fetch(`/api/scan/${item.scanId}`);
            if (!res.ok) return;
            const fresh = (await res.json()) as ScanResponse;
            setQueue((prev) =>
              prev.map((q) =>
                q.localId === item.localId ? { ...q, scan: fresh } : q,
              ),
            );
          } catch {
            /* transient; next tick retries */
          }
        }),
      );
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pendingCount]);

  // -----------------------------------------------------------------------
  // Auto-fire comparison once the SELECTED single-mode scan transitions to
  // DONE. Bulk mode keeps comparisons off-by-default (matches prototype).
  // -----------------------------------------------------------------------
  const selectedItem = useMemo(
    () => queue.find((q) => q.localId === selectedLocalId) ?? null,
    [queue, selectedLocalId],
  );

  // Fire-once tracker — guarantees the comparison POST is sent at most
  // ONCE per scanId, regardless of how many times the effect below re-runs
  // due to `selectedItem` reference churn from polling. Hotfix 2026-05-29:
  // without this, a stale-closure / state-batching race could let the
  // effect re-fire on every poll tick. See `lib/scanner/fire-once-tracker.ts`.
  const comparisonFireTracker = useRef(makeFireOnceTracker());

  useEffect(() => {
    if (mode !== 'single') return;
    if (!selectedItem?.scanId || !selectedItem.scan) return;
    if (selectedItem.scan.status !== 'DONE') return;
    // Cross-render guard: if we've ever fired for this scanId, never again.
    if (!comparisonFireTracker.current.tryFire(selectedItem.scanId)) return;

    const scanId = selectedItem.scanId;
    const localId = selectedItem.localId;
    setQueue((prev) =>
      prev.map((q) =>
        q.localId === localId ? { ...q, comparisonState: 'loading' } : q,
      ),
    );

    (async () => {
      try {
        const res = await fetch(`/api/scan/${scanId}/comparison`, {
          method: 'POST',
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            res.status === 429
              ? 'Comparison rate-limited. Retry in a moment.'
              : text || `Comparison failed (${res.status})`,
          );
        }
        const body = (await res.json()) as { comparisons: ComparisonRow[] };
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === localId
              ? {
                  ...q,
                  comparisons: body.comparisons,
                  comparisonState: 'loaded',
                }
              : q,
          ),
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Comparison failed.';
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === localId
              ? {
                  ...q,
                  comparisonState: 'failed',
                  comparisonError: message,
                }
              : q,
          ),
        );
      }
    })();
  }, [mode, selectedItem]);

  // -----------------------------------------------------------------------
  // Duplicate report — group by documentNumber
  // -----------------------------------------------------------------------
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const q of queue) {
      if (
        q.scan?.status === 'DUPLICATE_DETECTED' &&
        q.scan.documentNumber
      ) {
        const key = q.scan.documentNumber;
        const existing = map.get(key) ?? [];
        if (!existing.includes(q.fileName)) existing.push(q.fileName);
        map.set(key, existing);
      }
    }
    return Array.from(map.entries());
  }, [queue]);

  const hasPendingDuplicates = duplicateGroups.length > 0;

  // -----------------------------------------------------------------------
  // Excel — STRICTLY USER ACTION. Hotfix 2026-05-29: previous version
  // rendered `<a href={url}>` and (combined with polling re-renders) caused
  // a runaway export firing on every poll tick. Now: an explicit callback
  // passed to JournalEntryTable's button. No useEffect, no anchor, no
  // automatic invocation. The callback below is the ONLY codepath that
  // hits `/api/scan/[id]/excel`.
  // -----------------------------------------------------------------------
  const handleSingleExcelDownload = useCallback(() => {
    if (!selectedItem?.scanId || selectedItem.scan?.status !== 'DONE') return;
    // window.location lets the server's Content-Disposition: attachment
    // header trigger the download without navigating away from the SPA.
    window.location.href = `/api/scan/${selectedItem.scanId}/excel?ignoreVat=${ignoreVat}`;
  }, [selectedItem, ignoreVat]);

  const canDownloadSingleExcel =
    selectedItem?.scanId != null && selectedItem.scan?.status === 'DONE';

  const exportableScanIds = useMemo(
    () =>
      queue
        .filter((q) => q.scanId && q.scan?.status === 'DONE')
        .map((q) => q.scanId as string),
    [queue],
  );

  const handleBulkExport = useCallback(async () => {
    if (hasPendingDuplicates || exportableScanIds.length === 0) return;
    const res = await fetch('/api/scans/bulk-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanIds: exportableScanIds, ignoreVat }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bulk_Financial_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [exportableScanIds, hasPendingDuplicates, ignoreVat]);

  const resetState = () => {
    setQueue([]);
    setSelectedLocalId(null);
    setMode('single');
    setShowDuplicateReport(true);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const queueEntries: QueueEntry[] = queue.map((q) => ({
    scanId: q.scanId ?? null,
    fileName: q.fileName,
    status:
      q.uploadState === 'uploading' || !q.scan
        ? q.uploadState === 'failed'
          ? 'ERROR'
          : 'UPLOADING'
        : q.scan.status,
    errorMessage: q.uploadError ?? q.scan?.errorMessage ?? null,
  }));

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <header className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-aisb-purple/10 text-aisb-purple-deep text-xs font-bold uppercase tracking-widest mb-6 border border-aisb-purple/20">
            AI-Powered Accounting
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter mb-4 leading-tight">
            <span className="text-aisb-purple-deep">Receipt Intelligence</span>{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-aisb-green to-aisb-purple">
              AI
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto font-medium leading-relaxed">
            Scan receipts. Get balanced IFRS/GAAP journal entries. Find local
            Barbados prices.
          </p>
        </header>

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Upload & Controls */}
            <div className="lg:col-span-4 flex flex-col space-y-6 lg:sticky lg:top-8">
              <div className="bg-white rounded-[2rem] shadow-2xl shadow-aisb-purple/5 p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-slate-900 flex items-center">
                    <span className="w-10 h-10 rounded-xl bg-aisb-purple text-white flex items-center justify-center mr-4 text-sm font-bold shadow-lg shadow-aisb-purple/20">
                      1
                    </span>
                    Upload
                  </h2>
                  <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
                    <button
                      onClick={() => setMode('single')}
                      className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all tracking-widest uppercase ${mode === 'single' ? 'bg-white text-aisb-purple-deep shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setMode('bulk')}
                      className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all tracking-widest uppercase ${mode === 'bulk' ? 'bg-white text-aisb-purple-deep shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Bulk
                    </button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-black text-slate-900 block">
                          Ignore VAT
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                          Hide tax from output
                        </span>
                      </div>
                      <button
                        onClick={() => setIgnoreVat(!ignoreVat)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-4 focus:ring-aisb-purple/20 ${
                          ignoreVat ? 'bg-aisb-purple' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                            ignoreVat ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <FileUpload
                    onFilesSelect={(files) => handleFilesSelect(files)}
                    previewSrc={
                      mode === 'single' ? selectedItem?.previewSrc ?? null : null
                    }
                    previewName={
                      mode === 'single' ? selectedItem?.fileName ?? null : null
                    }
                    isBulk={mode === 'bulk'}
                  />

                  {mode === 'single' && selectedItem && (
                    <button
                      onClick={resetState}
                      className="w-full text-sm font-black text-slate-500 hover:text-aisb-purple transition-colors py-2"
                    >
                      Clear Selection
                    </button>
                  )}

                  {mode === 'bulk' && queue.length > 0 && (
                    <div className="space-y-4">
                      <QueueList
                        queue={queueEntries}
                        selectedScanId={selectedItem?.scanId ?? null}
                        onSelect={(scanId) => {
                          const target = queue.find((q) => q.scanId === scanId);
                          if (target) setSelectedLocalId(target.localId);
                        }}
                      />
                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={handleBulkExport}
                          disabled={
                            exportableScanIds.length === 0 || hasPendingDuplicates
                          }
                          className="w-full bg-aisb-green text-aisb-bg font-black py-4 px-6 rounded-2xl hover:bg-aisb-green-deep transition-all disabled:bg-slate-100 disabled:text-slate-400 flex items-center justify-center text-sm shadow-xl shadow-aisb-green/10 active:scale-[0.98]"
                        >
                          <ExcelIcon className="w-5 h-5 mr-3" /> EXPORT ALL TO EXCEL
                        </button>
                        <button
                          onClick={resetState}
                          className="w-full text-xs font-black text-slate-500 hover:text-red-500 transition-colors text-center py-2 uppercase tracking-widest"
                        >
                          Reset Queue
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <FolderWatcher
                onFilesFound={(files) =>
                  handleFilesSelect(files, { force: 'bulk' })
                }
              />
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-8 flex flex-col space-y-6">
              <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 min-h-[600px] flex flex-col border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                  <h2 className="text-2xl font-black text-slate-900 flex items-center">
                    <span className="w-10 h-10 rounded-xl bg-aisb-purple text-white flex items-center justify-center mr-4 text-sm font-bold shadow-lg shadow-aisb-purple/20">
                      2
                    </span>
                    Analysis Results
                  </h2>
                  {mode === 'bulk' && selectedItem && (
                    <div className="text-xs font-black text-aisb-purple-deep bg-aisb-purple/10 px-4 py-1.5 rounded-full border border-aisb-purple/20 uppercase tracking-widest">
                      Viewing: {selectedItem.fileName}
                    </div>
                  )}
                </div>

                <div className="flex-grow flex flex-col p-8">
                  {/* Empty states */}
                  {queue.length === 0 && (
                    <div className="text-center p-12 m-auto">
                      <div className="w-24 h-24 bg-aisb-purple/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <UploadIcon className="w-12 h-12 text-aisb-purple" />
                      </div>
                      <h3 className="font-black text-2xl text-slate-900 tracking-tight">
                        Ready to Scan
                      </h3>
                      <p className="text-slate-600 mt-3 max-w-sm mx-auto font-medium text-lg leading-relaxed">
                        Upload a receipt or invoice to see AI-generated journal entries.
                      </p>
                    </div>
                  )}

                  {/* Loading: upload still in flight OR scan PENDING/SCANNING */}
                  {selectedItem &&
                    (selectedItem.uploadState === 'uploading' ||
                      (selectedItem.scan &&
                        !isTerminal(selectedItem.scan.status))) && (
                      <div className="text-center p-12 m-auto">
                        <SpinnerIcon className="h-16 w-16 text-aisb-purple mx-auto" />
                        <h3 className="mt-6 font-black text-2xl text-slate-900 tracking-tight">
                          {selectedItem.uploadState === 'uploading'
                            ? 'Uploading…'
                            : selectedItem.scan?.status === 'PENDING'
                              ? 'Queued for extraction…'
                              : 'Extracting…'}
                        </h3>
                        <p className="text-slate-500 mt-2 font-medium">
                          {selectedItem.fileName}
                        </p>
                      </div>
                    )}

                  {/* Failed upload */}
                  {selectedItem?.uploadState === 'failed' && (
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-100 m-auto">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl font-bold">!</span>
                      </div>
                      <h3 className="font-bold text-red-800">Upload Failed</h3>
                      <p className="text-sm text-red-600 mt-1">
                        {selectedItem.uploadError ?? 'Unknown error'}
                      </p>
                    </div>
                  )}

                  {/* Error during extraction */}
                  {selectedItem?.scan?.status === 'ERROR' && (
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-100 m-auto">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl font-bold">!</span>
                      </div>
                      <h3 className="font-bold text-red-800">Extraction Failed</h3>
                      <p className="text-sm text-red-600 mt-1">
                        {selectedItem.scan.errorMessage ?? 'Unknown error'}
                      </p>
                    </div>
                  )}

                  {/* Duplicate report banner */}
                  {mode === 'bulk' &&
                    showDuplicateReport &&
                    hasPendingDuplicates && (
                      <div className="mb-8 p-6 bg-amber-50 rounded-3xl border border-amber-200">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-700">
                              <span className="font-black text-sm">!</span>
                            </div>
                            <h3 className="font-black text-amber-900 tracking-tight">
                              Duplicate Detection Report
                            </h3>
                          </div>
                          <button
                            onClick={() => setShowDuplicateReport(false)}
                            className="p-2 hover:bg-amber-100 rounded-xl text-amber-600 transition-all"
                          >
                            ×
                          </button>
                        </div>
                        <div className="space-y-3">
                          {duplicateGroups.map(([docNum, files]) => (
                            <div
                              key={docNum}
                              className="text-sm bg-white/50 p-3 rounded-xl border border-amber-100/50"
                            >
                              <p className="font-black text-amber-800">
                                Doc #{docNum} appears multiple times:
                              </p>
                              <ul className="mt-2 space-y-1">
                                {files.map((f) => (
                                  <li
                                    key={f}
                                    className="text-amber-600 font-mono text-[10px] flex items-center"
                                  >
                                    <span className="w-1 h-1 rounded-full bg-amber-400 mr-2" />
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Results with tabs */}
                  {selectedItem?.scan &&
                    (selectedItem.scan.status === 'DONE' ||
                      selectedItem.scan.status === 'DUPLICATE_DETECTED') && (
                      <div className="space-y-8">
                        <div className="flex bg-slate-100/50 p-1 rounded-2xl self-start w-fit">
                          <TabButton
                            active={activeTab === 'journal'}
                            onClick={() => setActiveTab('journal')}
                            icon={<MoneyIcon className="w-4 h-4 mr-2" />}
                            label="Journal Entry"
                            accent="purple"
                          />
                          {mode === 'single' && (
                            <TabButton
                              active={activeTab === 'comparison'}
                              onClick={() => setActiveTab('comparison')}
                              icon={<DocumentIcon className="w-4 h-4 mr-2" />}
                              label="Price Comparison"
                              accent="green"
                              loading={
                                selectedItem.comparisonState === 'loading'
                              }
                            />
                          )}
                          <TabButton
                            active={activeTab === 'analytics'}
                            onClick={() => setActiveTab('analytics')}
                            icon={<ChartBarIcon className="w-4 h-4 mr-2" />}
                            label="Analytics"
                            accent="purple"
                          />
                        </div>

                        {activeTab === 'journal' && (
                          <div className="space-y-8">
                            <JournalEntryTable
                              data={selectedItem.scan}
                              tenantCurrency={tenantCurrency}
                              ignoreVat={ignoreVat}
                              onDownloadExcel={
                                canDownloadSingleExcel
                                  ? handleSingleExcelDownload
                                  : null
                              }
                            />
                            {selectedItem.scan.lineItems.length > 0 && (
                              <LineItemTable
                                items={selectedItem.scan.lineItems}
                                currency={
                                  selectedItem.scan.currency ?? tenantCurrency
                                }
                              />
                            )}
                          </div>
                        )}

                        {activeTab === 'comparison' && mode === 'single' && (
                          <div className="space-y-4">
                            {selectedItem.comparisonState === 'loading' ? (
                              <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 border-dashed text-center">
                                <SpinnerIcon className="h-8 w-8 text-aisb-purple mx-auto mb-4" />
                                <p className="text-slate-500 font-bold">
                                  Researching Barbados-local prices…
                                </p>
                              </div>
                            ) : selectedItem.comparisonState === 'failed' ? (
                              <div className="p-8 bg-red-50 rounded-2xl border border-red-100 text-center">
                                <p className="text-sm text-red-700 font-bold">
                                  {selectedItem.comparisonError}
                                </p>
                              </div>
                            ) : (
                              <PriceComparisonTable
                                comparisons={selectedItem.comparisons ?? []}
                                lineItemTotals={
                                  new Map(
                                    selectedItem.scan.lineItems.map((li) => [
                                      li.id,
                                      li.total,
                                    ]),
                                  )
                                }
                                currency={
                                  selectedItem.scan.currency ?? tenantCurrency
                                }
                              />
                            )}
                          </div>
                        )}

                        {activeTab === 'analytics' && (
                          <AnalyticsDashboard tenantCurrency={tenantCurrency} />
                        )}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center mt-16 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
          <p>© 2026 AISB Receipt Intelligence AI</p>
        </footer>
      </main>
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: 'purple' | 'green';
  loading?: boolean;
}> = ({ active, onClick, icon, label, accent, loading }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center py-3 px-8 rounded-xl font-black text-sm transition-all ${
      active
        ? `bg-white shadow-md scale-100 ${accent === 'green' ? 'text-aisb-green-deep' : 'text-aisb-purple-deep'}`
        : 'text-slate-500 hover:text-slate-700 scale-95 opacity-70 hover:opacity-100'
    }`}
  >
    {icon}
    <span className="uppercase tracking-wider">{label}</span>
    {loading && (
      <span className="absolute -top-1 -right-1 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aisb-green opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-aisb-green-deep" />
      </span>
    )}
  </button>
);
