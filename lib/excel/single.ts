import * as XLSX from 'xlsx';

import { applyIgnoreVat } from '@/lib/accounting/balance';
import type { ExcelScan } from './types';

/**
 * Build the single-scan workbook.
 *
 * Sheet structure preserved VERBATIM from the prototype's
 * `handleDownloadExcel` (App.tsx:331-401) per kickoff §9 — any export from
 * the old prototype must still re-import cleanly under the same column
 * positions.
 *
 *   1. Analysis Summary — core fields + financial breakdown
 *   2. Journal Entries  — Date / Account / Description / Debit / Credit
 *   3. CSV Export Data  — Account / Debit / Credit / Description
 *   4. Detailed Line Items — Description / Quantity / Unit Price / Total
 *
 * Returns a Node Buffer ready to send as a file body. The route handler
 * sets the filename in the Content-Disposition header.
 */
export function buildSingleScanWorkbook(
  scan: ExcelScan,
  options: { ignoreVat: boolean } = { ignoreVat: false },
): Buffer {
  const workbook = XLSX.utils.book_new();

  // 1. ANALYSIS SHEET
  const analysisAoa = [
    ['DOCUMENT ANALYSIS REPORT'],
    [`Generated on ${new Date().toLocaleString()}`],
    [],
    ['CORE INFORMATION'],
    ['Vendor', scan.vendor ?? ''],
    ['Document Number', scan.documentNumber ?? ''],
    ['Document Date', scan.transactionDate ?? ''],
    ['Expense Category', scan.expenseCategory ?? ''],
    [
      'Document Type',
      scan.isInvoice == null
        ? ''
        : scan.isInvoice
          ? 'INVOICE (Unpaid)'
          : 'RECEIPT (Paid)',
    ],
    ['Currency', scan.currency ?? ''],
    [],
    ['FINANCIAL BREAKDOWN'],
    ['Subtotal', scan.subtotal ?? 0],
    ['Tax Rate', (scan.vatRate ?? '') + (scan.vatRate ? '' : '')],
    ['Tax Amount', scan.vatAmount ?? 0],
    ['TOTAL AMOUNT', scan.totalAmount ?? 0],
    [],
    [
      'Notes',
      'Automated accounting classification using IFRS/GAAP standards.',
    ],
  ];
  const analysisSheet = XLSX.utils.aoa_to_sheet(analysisAoa);
  analysisSheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, analysisSheet, 'Analysis Summary');

  // Apply ignoreVat redistribution once; reused for sheets 2 + 3.
  const entriesToExport = applyIgnoreVat(scan.journalEntries, options.ignoreVat);

  // 2. JOURNAL ENTRIES SHEET
  const journalHeader = ['Date', 'Account', 'Description', 'Debit', 'Credit'];
  const journalRows = entriesToExport.map((entry) => [
    scan.transactionDate ?? '',
    entry.account,
    entry.description,
    entry.debit || 0,
    entry.credit || 0,
  ]);
  const journalSheet = XLSX.utils.aoa_to_sheet([journalHeader, ...journalRows]);
  journalSheet['!cols'] = [
    { wch: 15 },
    { wch: 25 },
    { wch: 40 },
    { wch: 12 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, journalSheet, 'Journal Entries');

  // 3. CSV COMPATIBLE SHEET
  const csvHeader = ['Account', 'Debit', 'Credit', 'Description'];
  const csvRows = entriesToExport.map((e) => [
    e.account,
    e.debit || 0,
    e.credit || 0,
    e.description,
  ]);
  const csvSheet = XLSX.utils.aoa_to_sheet([csvHeader, ...csvRows]);
  XLSX.utils.book_append_sheet(workbook, csvSheet, 'CSV Export Data');

  // 4. LINE ITEMS SHEET
  if (scan.lineItems.length > 0) {
    const lineItemHeader = ['Description', 'Quantity', 'Unit Price', 'Total'];
    const lineItemRows = scan.lineItems.map((item) => [
      item.description,
      item.quantity,
      item.unitPrice,
      item.total,
    ]);
    const lineItemSheet = XLSX.utils.aoa_to_sheet([
      lineItemHeader,
      ...lineItemRows,
    ]);
    lineItemSheet['!cols'] = [
      { wch: 40 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, lineItemSheet, 'Detailed Line Items');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Generate the default filename the prototype used. Caller can override.
 */
export function defaultSingleFilename(scan: ExcelScan): string {
  const safeVendor = (scan.vendor ?? 'document')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  const date = scan.transactionDate ?? new Date().toISOString().split('T')[0];
  return `Accounting_Package_${safeVendor}_${date}.xlsx`;
}
