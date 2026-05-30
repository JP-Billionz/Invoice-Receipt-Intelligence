// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { ScannerClient } from '@/components/scanner/ScannerClient';

/**
 * REGRESSION TEST for the 2026-05-30 OOM hotfix.
 *
 * Bug: Folder Watcher discovered 4 files; client fired 4 parallel
 * POST /api/scan calls; server kicked off 4 unawaited runExtractJobs
 * simultaneously, each holding ~MB of image bytes + Gemini state.
 * Render free tier (512 MB) OOM'd, instance auto-restarted.
 *
 * The prototype had a client-side processingRef lock that serialized the
 * queue. That intent didn't survive the port — POST /api/scan became
 * fire-and-forget with no client-side serialization in bulk mode.
 *
 * This test mounts ScannerClient, switches to bulk mode, drops 5 files,
 * and asserts at most ONE POST /api/scan is in flight at any moment —
 * i.e. the upload loop awaits each scan reaching terminal status before
 * issuing the next POST.
 */

interface FetchCall {
  url: string;
  method: string;
  startedAt: number;
}

let calls: FetchCall[] = [];
let inFlightPosts = 0;
let maxInFlightPosts = 0;
let scanCounter = 0;

function makeDoneScan(id: string): Record<string, unknown> {
  return {
    id,
    status: 'DONE',
    source: 'BULK',
    fileName: `bulk-${id}.jpg`,
    mimeType: 'image/jpeg',
    vendor: 'Vendor',
    transactionDate: '2026-05-30',
    documentNumber: id,
    documentNumberRaw: id,
    vatAmount: 0,
    vatRate: '0%',
    expenseCategory: 'Office Supplies',
    subtotal: 10,
    totalAmount: 10,
    isInvoice: false,
    currency: 'BBD',
    duplicateOfId: null,
    errorMessage: null,
    processingTimeMs: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lineItems: [],
    journalEntries: [],
  };
}

function makeFetchMock(): Mock {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, startedAt: Date.now() });

    // POST /api/scan — count concurrency precisely. The mock holds for
    // a beat so a buggy parallel implementation would record multiple
    // simultaneous in-flight requests.
    if (method === 'POST' && url === '/api/scan') {
      inFlightPosts++;
      maxInFlightPosts = Math.max(maxInFlightPosts, inFlightPosts);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        scanCounter++;
        const scanId = `scan-${scanCounter}`;
        return new Response(
          JSON.stringify({ scanId, status: 'PENDING' }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      } finally {
        inFlightPosts--;
      }
    }

    // GET /api/scan/[id] — return DONE so the polling effect immediately
    // marks the item terminal and unblocks the serial uploader.
    if (method === 'GET' && /^\/api\/scan\/scan-\d+$/.test(url)) {
      const id = url.split('/').pop()!;
      return new Response(JSON.stringify(makeDoneScan(id)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/scan/[id]/comparison — bulk mode doesn't auto-fire it but
    // single mode does; respond cleanly either way.
    if (method === 'POST' && url.includes('/comparison')) {
      return new Response(JSON.stringify({ scanId: '', comparisons: [] }), {
        status: 200,
      });
    }

    return new Response('not found', { status: 404 });
  }) as Mock;
}

beforeEach(() => {
  calls = [];
  inFlightPosts = 0;
  maxInFlightPosts = 0;
  scanCounter = 0;
  vi.stubGlobal('fetch', makeFetchMock());
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ScannerClient — bulk upload serializes (OOM hotfix 2026-05-30)', () => {
  it('drops 5 files in bulk mode → at most ONE POST /api/scan in flight at a time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { container } = render(<ScannerClient tenantCurrency="BBD" />);

    // Switch to bulk mode. The header has two toggle buttons; pick "Bulk".
    const bulkButton = Array.from(
      container.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim().toUpperCase() === 'BULK');
    expect(bulkButton, 'bulk-mode toggle button must exist').not.toBeNull();
    await act(async () => {
      bulkButton!.click();
    });

    // Find the file input and drop 5 files on it.
    const input = container.querySelector(
      'input[type="file"]#file-upload',
    ) as HTMLInputElement | null;
    expect(input, 'file input must exist').not.toBeNull();

    const files = Array.from({ length: 5 }, (_, i) =>
      new File([`file-${i}-content`], `receipt-${i}.jpg`, {
        type: 'image/jpeg',
      }),
    );

    await act(async () => {
      Object.defineProperty(input!, 'files', {
        value: files,
        configurable: true,
      });
      fireEvent.change(input!);
      // Let the upload loop run — advance generously through polling ticks
      // so all 5 uploads sequentially complete.
      await vi.advanceTimersByTimeAsync(20_000);
    });

    // -------------------------------------------------------------------
    // Assertions
    // -------------------------------------------------------------------

    const postCalls = calls.filter(
      (c) => c.method === 'POST' && c.url === '/api/scan',
    );
    // All 5 uploads should have happened.
    expect(
      postCalls.length,
      `expected 5 POST /api/scan calls; got ${postCalls.length}`,
    ).toBe(5);

    // The OOM-prevention contract: at no point did more than ONE POST sit
    // in flight at once. A buggy parallel implementation would see this
    // spike to 5 (matching the original Folder Watcher 4-file incident).
    expect(
      maxInFlightPosts,
      `bulk uploads must serialize; max concurrent POSTs was ${maxInFlightPosts}`,
    ).toBe(1);
  });
});
