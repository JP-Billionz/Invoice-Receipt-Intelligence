import * as XLSX from 'xlsx';

import { applyIgnoreVat } from '@/lib/accounting/balance';
import type { ExcelScan } from './types';

/**
 * Build the bulk-export workbook.
 *
 * Sheet structure preserved VERBATIM from the prototype's
 * `handleDownloadBulkExcel` (App.tsx:403-467) per kickoff §9.
 *
 *   1. Bulk Summary       — one row per scan: Vendor / Doc # / Date / Type
 *                           / Category / Total
 *   2. Combined Journals  — Document / Date / Account / Description / Debit
 *                           / Credit
 *   3. Combined Line Items — Vendor / Date / Description / Qty / Unit Price
 *                            / Total
 *
 * Caller is responsible for pre-filtering scans (e.g. dropping
 * status: EXCLUDED / DUPLICATE_DETECTED that the user chose to exclude) —
 * the builder consumes whatever it's given.
 */
export function buildBulkScanWorkbook(
  scans: ExcelScan[],
  options: { ignoreVat: boolean } = { ignoreVat: false },
): Buffer {
  const workbook = XLSX.utils.book_new();

  // 1. BULK SUMMARY
  const summaryData = scans.map((s) => ({
    Vendor: s.vendor ?? '',
    'Doc #': s.documentNumber ?? '',
    Date: s.transactionDate ?? '',
    Type:
      s.isInvoice == null ? '' : s.isInvoice ? 'Invoice' : 'Receipt',
    Category: s.expenseCategory ?? '',
    Currency: s.currency ?? '',
    Total: s.totalAmount ?? 0,
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Bulk Summary');

  // 2. CONSOLIDATED JOURNAL
  const consolidatedHeader = [
    'Document',
    'Date',
    'Account',
    'Description',
    'Debit',
    'Credit',
  ];
  const consolidatedRows = scans.flatMap((s) => {
    const entries = applyIgnoreVat(s.journalEntries, options.ignoreVat);
    return entries.map((e) => [
      s.vendor ?? '',
      s.transactionDate ?? '',
      e.account,
      e.description,
      e.debit || 0,
      e.credit || 0,
    ]);
  });
  const consolidatedSheet = XLSX.utils.aoa_to_sheet([
    consolidatedHeader,
    ...consolidatedRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, consolidatedSheet, 'Combined Journals');

  // 3. COMBINED LINE ITEMS
  const allLineItemsHeader = [
    'Vendor',
    'Date',
    'Description',
    'Quantity',
    'Unit Price',
    'Total',
  ];
  const allLineItemsRows = scans.flatMap((s) =>
    s.lineItems.map((li) => [
      s.vendor ?? '',
      s.transactionDate ?? '',
      li.description,
      li.quantity,
      li.unitPrice,
      li.total,
    ]),
  );
  if (allLineItemsRows.length > 0) {
    const allLineItemsSheet = XLSX.utils.aoa_to_sheet([
      allLineItemsHeader,
      ...allLineItemsRows,
    ]);
    allLineItemsSheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 40 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      allLineItemsSheet,
      'Combined Line Items',
    );
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function defaultBulkFilename(): string {
  return `Bulk_Financial_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
}
