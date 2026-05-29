'use client';

import React from 'react';

import { SpinnerIcon } from '@/components/icons';
import type { ScanResponse } from '@/lib/scan/serialize';

export interface QueueEntry {
  /** Server scan id once POST /api/scan returns; null while uploading. */
  scanId: string | null;
  /** Display filename so the user can recognise rows pre-upload. */
  fileName: string;
  /** Current server status, refreshed by SWR polling in the orchestrator. */
  status: ScanResponse['status'] | 'UPLOADING';
  /** Friendly error message when status is 'ERROR'. */
  errorMessage?: string | null;
}

interface QueueListProps {
  queue: QueueEntry[];
  selectedScanId: string | null;
  onSelect: (scanId: string) => void;
}

/**
 * Bulk-mode upload queue. Reads its statuses from props (the orchestrator
 * polls each scan via SWR and computes the current state).
 *
 * Ported from prototype `components/QueueList.tsx`. Restyled to AISB
 * tokens; otherwise identical visual structure.
 */
export const QueueList: React.FC<QueueListProps> = ({
  queue,
  selectedScanId,
  onSelect,
}) => {
  if (queue.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">
        Processing Queue ({queue.length})
      </h3>
      <div className="max-h-72 overflow-y-auto rounded-3xl border border-slate-100 bg-white divide-y divide-slate-50 shadow-sm">
        {queue.map((item, idx) => {
          const isSelected =
            item.scanId !== null && item.scanId === selectedScanId;
          return (
            <button
              key={item.scanId ?? `${item.fileName}-${idx}`}
              onClick={() => item.scanId && onSelect(item.scanId)}
              disabled={item.scanId === null}
              className={`w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-all ${
                isSelected
                  ? 'bg-aisb-purple/5 ring-2 ring-inset ring-aisb-purple/30'
                  : ''
              } ${item.scanId === null ? 'opacity-60 cursor-progress' : ''}`}
            >
              <div className="flex items-center space-x-4 overflow-hidden">
                <div className="flex-shrink-0">
                  {(item.status === 'UPLOADING' ||
                    item.status === 'PENDING' ||
                    item.status === 'SCANNING') && (
                    <SpinnerIcon className="w-5 h-5 text-aisb-purple" />
                  )}
                  {item.status === 'DONE' && (
                    <div className="w-6 h-6 rounded-lg bg-aisb-green/15 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-aisb-green-deep"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                  {item.status === 'DUPLICATE_DETECTED' && (
                    <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-black text-xs">
                      !
                    </div>
                  )}
                  {item.status === 'EXCLUDED' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  )}
                  {item.status === 'ERROR' && (
                    <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
                      <span className="text-red-600 font-black text-xs">!</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-black text-slate-900 truncate tracking-tight">
                  {item.fileName}
                </span>
              </div>
              <span
                className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  item.status === 'UPLOADING' || item.status === 'PENDING'
                    ? 'bg-slate-100 text-slate-500'
                    : item.status === 'SCANNING'
                      ? 'bg-aisb-purple/10 text-aisb-purple-deep'
                      : item.status === 'DONE'
                        ? 'bg-aisb-green/10 text-aisb-green-deep'
                        : item.status === 'DUPLICATE_DETECTED'
                          ? 'bg-amber-100 text-amber-700'
                          : item.status === 'EXCLUDED'
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-red-100 text-red-600'
                }`}
              >
                {item.status.toLowerCase().replace('_', ' ')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
