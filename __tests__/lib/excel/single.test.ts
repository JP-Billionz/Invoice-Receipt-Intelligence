import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  buildSingleScanWorkbook,
  defaultSingleFilename,
} from '@/lib/excel/single';
import type { ExcelScan } from '@/lib/excel/types';

function sampleScan(overrides: Partial<ExcelScan> = {}): ExcelScan {
  return {
    id: 'scan-1',
    vendor: 'PriceSmart Barbados',
    transactionDate: '2026-05-28',
    documentNumber: 'INV-001',
    vatAmount: 15,
    vatRate: '15%',
    expenseCategory: 'Office Supplies',
    subtotal: 100,
    totalAmount: 115,
    isInvoice: false,
    currency: 'BBD',
    journalEntries: [
      { account: 'Office Supplies Expense', debit: 100, credit: 0, description: 'Paper' },
      { account: 'GST/VAT Paid', debit: 15, credit: 0, description: 'Input tax' },
      { account: 'Bank', debit: 0, credit: 115, description: 'Paid' },
    ],
    lineItems: [
      { description: 'A4 paper', quantity: 2, unitPrice: 50, total: 100 },
    ],
    ...overrides,
  };
}

describe('buildSingleScanWorkbook', () => {
  it('produces a 4-sheet workbook with the canonical sheet names — kickoff §9', () => {
    const buf = buildSingleScanWorkbook(sampleScan());
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Analysis Summary',
      'Journal Entries',
      'CSV Export Data',
      'Detailed Line Items',
    ]);
  });

  it('omits the Detailed Line Items sheet when there are none', () => {
    const buf = buildSingleScanWorkbook(sampleScan({ lineItems: [] }));
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Analysis Summary',
      'Journal Entries',
      'CSV Export Data',
    ]);
  });

  it('Journal Entries sheet has the canonical header row', () => {
    const buf = buildSingleScanWorkbook(sampleScan());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Journal Entries'], {
      header: 1,
    });
    expect(rows[0]).toEqual(['Date', 'Account', 'Description', 'Debit', 'Credit']);
  });

  it('CSV Export Data sheet has the canonical header row', () => {
    const buf = buildSingleScanWorkbook(sampleScan());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['CSV Export Data'], {
      header: 1,
    });
    expect(rows[0]).toEqual(['Account', 'Debit', 'Credit', 'Description']);
  });

  it('Detailed Line Items sheet has the canonical header row', () => {
    const buf = buildSingleScanWorkbook(sampleScan());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(
      wb.Sheets['Detailed Line Items'],
      { header: 1 },
    );
    expect(rows[0]).toEqual(['Description', 'Quantity', 'Unit Price', 'Total']);
    expect(rows[1]).toEqual(['A4 paper', 2, 50, 100]);
  });

  it('Analysis Summary includes the Currency row (§4.6 schema addition)', () => {
    const buf = buildSingleScanWorkbook(sampleScan({ currency: 'BBD' }));
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(
      wb.Sheets['Analysis Summary'],
      { header: 1 },
    );
    const currencyRow = rows.find((r) => r[0] === 'Currency');
    expect(currencyRow?.[1]).toBe('BBD');
  });

  it('ignoreVat mode drops the tax line + appends "(Includes Tax)"', () => {
    const buf = buildSingleScanWorkbook(sampleScan(), { ignoreVat: true });
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Journal Entries'], {
      header: 1,
    });
    // No row mentions GST/VAT Paid
    const accountCol = rows.slice(1).map((r) => r[1]);
    expect(accountCol).not.toContain('GST/VAT Paid');
    // Office Supplies line gets the merge marker
    const office = rows.find((r) => r[1] === 'Office Supplies Expense');
    expect(office?.[2]).toContain('(Includes Tax)');
  });
});

describe('defaultSingleFilename', () => {
  it('combines vendor + date with safe filename chars', () => {
    expect(defaultSingleFilename(sampleScan())).toBe(
      'Accounting_Package_pricesmart_barbados_2026-05-28.xlsx',
    );
  });

  it('handles null vendor / date', () => {
    const out = defaultSingleFilename(
      sampleScan({ vendor: null, transactionDate: null }),
    );
    expect(out).toMatch(/^Accounting_Package_document_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
