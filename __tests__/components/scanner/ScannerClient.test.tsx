// @vitest-environment jsdom

import React from 'react';
import { act, render } from '@testing-library/react';
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
 * REGRESSION TEST for the 2026-05-29 hotfix.
 *
 * Bug: after `POST /api/scan` returned DONE, the Excel export kept firing
 * on every poll tick (16 downloads in ~24s). Two root causes:
 *   1. Polling didn't stop on terminal status.
 *   2. Auto-export `useEffect` depended on the scan object — new reference
 *      every poll → effect fired every tick → export downloaded every tick.
 *
 * This test mounts `ScannerClient`, mocks `fetch` to return 10 successive
 * DONE responses with NEW object references each tick, and asserts:
 *   - the `/api/scan/[id]/excel` endpoint is hit ZERO times (user-action
 *     only — no useEffect may invoke it)
 *   - the `/api/scan/[id]/comparison` endpoint is hit EXACTLY ONCE despite
 *     the 10 effect re-runs (guaranteed by fire-once tracker)
 *   - polling stops once status is terminal (no more GET /api/scan/[id]
 *     calls past the first DONE response)
 */

interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
}

let fetchSpy: Mock;
let calls: FetchCall[] = [];

function makeDoneScan(): Record<string, unknown> {
  // CRITICAL: returned as a fresh object literal each call so the consumer
  // sees a new reference every tick — the exact condition that triggered
  // the original runaway. The fix must survive this.
  return {
    id: 'scan-1',
    status: 'DONE',
    source: 'SINGLE',
    fileName: 'test.jpg',
    mimeType: 'image/jpeg',
    vendor: 'Test Vendor',
    transactionDate: '2026-05-29',
    documentNumber: 'INV-001',
    documentNumberRaw: 'INV-001',
    vatAmount: 5,
    vatRate: '15%',
    expenseCategory: 'Office Supplies',
    subtotal: 50,
    totalAmount: 55,
    isInvoice: false,
    currency: 'BBD',
    duplicateOfId: null,
    errorMessage: null,
    processingTimeMs: 1234,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lineItems: [
      {
        id: 'li-1',
        description: 'Paper',
        quantity: 1,
        unitPrice: 50,
        total: 50,
        position: 0,
      },
    ],
    journalEntries: [
      {
        id: 'je-1',
        account: 'Office Supplies Expense',
        debit: 50,
        credit: 0,
        description: 'Paper',
        position: 0,
      },
      {
        id: 'je-2',
        account: 'GST/VAT Paid',
        debit: 5,
        credit: 0,
        description: 'Input tax',
        position: 1,
      },
      {
        id: 'je-3',
        account: 'Bank',
        debit: 0,
        credit: 55,
        description: 'Paid',
        position: 2,
      },
    ],
  };
}

function makeFetchMock(): Mock {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: init?.body });

    // POST /api/scan (upload) → returns scanId, status: PENDING. We skip
    // the polling step here by jumping straight to DONE on next GET.
    if (method === 'POST' && url === '/api/scan') {
      return new Response(
        JSON.stringify({ scanId: 'scan-1', status: 'PENDING' }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // GET /api/scan/scan-1 — every call returns a fresh DONE object literal
    // (NEW reference each tick — this is the regression trigger).
    if (method === 'GET' && url.startsWith('/api/scan/scan-1')) {
      return new Response(JSON.stringify(makeDoneScan()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/scan/scan-1/comparison — should fire exactly once.
    if (method === 'POST' && url === '/api/scan/scan-1/comparison') {
      return new Response(
        JSON.stringify({ scanId: 'scan-1', comparisons: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ANY excel call would be the bug recurring. Return 200 anyway so the
    // count assertion below catches it.
    if (url.includes('/excel')) {
      return new Response('xlsx-bytes', { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as Mock;
}

beforeEach(() => {
  calls = [];
  fetchSpy = makeFetchMock();
  vi.stubGlobal('fetch', fetchSpy);
  // jsdom: stub URL.createObjectURL so bulk export code paths don't blow up.
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

describe('ScannerClient — runaway-export regression (hotfix 2026-05-29)', () => {
  it('does not auto-fire Excel export across 10 successive DONE polls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { unmount } = render(
      <ScannerClient tenantCurrency="BBD" />,
    );

    // Simulate an upload by directly invoking POST /api/scan through the
    // FileUpload's onFilesSelect → orchestrator handleFilesSelect path.
    // We dispatch a real File via the hidden <input type="file">.
    const file = new File(['fake-content'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector(
      'input[type="file"]#file-upload',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      // Use Object.defineProperty since files is a readonly FileList.
      Object.defineProperty(input!, 'files', {
        value: [file],
        configurable: true,
      });
      input!.dispatchEvent(new Event('change', { bubbles: true }));
      // Let the upload promise resolve.
      await vi.advanceTimersByTimeAsync(50);
    });

    // Advance through 10 poll ticks (1.5s each = 15s of simulated time).
    // Each tick triggers a GET /api/scan/scan-1 which returns a FRESH DONE
    // object literal — the precise reference-churn condition that caused
    // the original bug.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
    }

    unmount();

    // ---- Assertions ---------------------------------------------------

    const excelCalls = calls.filter((c) => c.url.includes('/excel'));
    expect(excelCalls.length, 'Excel endpoint must be user-action only').toBe(
      0,
    );

    const comparisonCalls = calls.filter((c) =>
      c.url.includes('/comparison'),
    );
    expect(
      comparisonCalls.length,
      'Comparison auto-fires exactly once per scanId despite 10 effect re-runs',
    ).toBe(1);

    // Polling-stop guarantee: once status is DONE, the GET endpoint should
    // stop being polled. We don't assert an exact upper bound (timing in
    // jsdom + fake-timers is fuzzy) but the count must stay BOUNDED rather
    // than scale with the 10 simulated ticks. A correctly-fixed scanner
    // hits the GET at most a handful of times before the pendingCount
    // useEffect tears down the interval.
    const getScanCalls = calls.filter(
      (c) => c.method === 'GET' && c.url.startsWith('/api/scan/scan-1'),
    );
    expect(
      getScanCalls.length,
      `polling should stop after DONE; got ${getScanCalls.length} GETs across 10 ticks`,
    ).toBeLessThanOrEqual(3);
  });
});
