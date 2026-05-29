import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildBulkScanWorkbook, defaultBulkFilename } from '@/lib/excel/bulk';
import type { ExcelScan } from '@/lib/excel/types';

function s(i: number): ExcelScan {
  return {
    id: `scan-${i}`,
    vendor: `Vendor ${i}`,
    transactionDate: '2026-05-28',
    documentNumber: `INV-${i}`,
    vatAmount: 5,
    vatRate: '15%',
    expenseCategory: 'Office Supplies',
    subtotal: 50,
    totalAmount: 55,
    isInvoice: i % 2 === 0,
    currency: 'BBD',
    journalEntries: [
      { account: 'Office Supplies Expense', debit: 50, credit: 0, description: 'Paper' },
      { account: 'GST Paid', debit: 5, credit: 0, description: 'Input tax' },
      {
        account: i % 2 === 0 ? 'Accounts Payable' : 'Bank',
        debit: 0,
        credit: 55,
        description: 'Owed',
      },
    ],
    lineItems: [
      {
        description: `Item ${i}`,
        quantity: 1,
        unitPrice: 50,
        total: 50,
      },
    ],
  };
}

describe('buildBulkScanWorkbook', () => {
  it('produces the canonical 3-sheet workbook — kickoff §9', () => {
    const buf = buildBulkScanWorkbook([s(1), s(2)]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Bulk Summary',
      'Combined Journals',
      'Combined Line Items',
    ]);
  });

  it('Bulk Summary uses the canonical column set', () => {
    const buf = buildBulkScanWorkbook([s(1)]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['Bulk Summary'],
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['Category', 'Currency', 'Date', 'Doc #', 'Total', 'Type', 'Vendor'].sort(),
    );
  });

  it('Combined Journals has the canonical header row', () => {
    const buf = buildBulkScanWorkbook([s(1), s(2)]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Combined Journals'], {
      header: 1,
    });
    expect(rows[0]).toEqual([
      'Document',
      'Date',
      'Account',
      'Description',
      'Debit',
      'Credit',
    ]);
    // One entry per (scan × journal line) — 2 scans × 3 lines = 6 entries plus header
    expect(rows).toHaveLength(7);
  });

  it('Combined Line Items has the canonical header row', () => {
    const buf = buildBulkScanWorkbook([s(1), s(2)]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(
      wb.Sheets['Combined Line Items'],
      { header: 1 },
    );
    expect(rows[0]).toEqual([
      'Vendor',
      'Date',
      'Description',
      'Quantity',
      'Unit Price',
      'Total',
    ]);
  });

  it('omits Combined Line Items when none of the scans have line items', () => {
    const buf = buildBulkScanWorkbook([{ ...s(1), lineItems: [] }]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Bulk Summary', 'Combined Journals']);
  });
});

describe('defaultBulkFilename', () => {
  it('contains the current ISO date', () => {
    expect(defaultBulkFilename()).toMatch(
      /^Bulk_Financial_Export_\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });
});
