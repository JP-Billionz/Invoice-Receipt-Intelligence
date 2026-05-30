'use client';

import React from 'react';

import { ExcelIcon } from '@/components/icons';

interface ScanDetailDownloadButtonProps {
  scanId: string;
  ignoreVat: boolean;
}

/**
 * Explicit user-action Excel download for the static scan-detail page.
 * Click-only — no useEffect ever invokes the export endpoint. Mirrors the
 * post-hotfix `JournalEntryTable` API where Excel is a callback, not a URL.
 */
export const ScanDetailDownloadButton: React.FC<
  ScanDetailDownloadButtonProps
> = ({ scanId, ignoreVat }) => {
  const handleClick = () => {
    const url = `/api/scan/${scanId}/excel?ignoreVat=${ignoreVat}`;
    // Use window.location to trigger the download with the server's
    // Content-Disposition: attachment header. Stays on the current page.
    window.location.href = url;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-8 w-full font-black py-6 px-8 rounded-3xl flex items-center justify-center text-xl shadow-2xl shadow-aisb-green/20 bg-aisb-green text-aisb-bg hover:bg-aisb-green-deep active:scale-[0.99] transition-all group"
    >
      <ExcelIcon className="w-8 h-8 mr-4 group-hover:rotate-12 transition-transform duration-300" />
      <span>Download Professional Analysis (Excel + CSV)</span>
    </button>
  );
};
