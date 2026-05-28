import { describe, expect, it } from 'vitest';

import { applyIgnoreVat, balanceDelta } from '@/lib/accounting/balance';
import type { ExtractedJournalLine } from '@/lib/gemini/schema';

// Sample receipt: $100 office supplies + $15 VAT, paid by bank.
const sampleEntries: ExtractedJournalLine[] = [
  {
    account: 'Office Supplies Expense',
    debit: 100,
    credit: 0,
    description: 'Pens, paper, toner',
  },
  {
    account: 'GST/VAT Paid',
    debit: 15,
    credit: 0,
    description: 'Input tax',
  },
  {
    account: 'Bank',
    debit: 0,
    credit: 115,
    description: 'Paid via bank transfer',
  },
];

describe('applyIgnoreVat', () => {
  it('returns entries unchanged when ignoreVat is false', () => {
    const result = applyIgnoreVat(sampleEntries, false);
    expect(result).toEqual(sampleEntries);
  });

  it('removes tax entries and merges tax into expense lines when ignoreVat is true', () => {
    const result = applyIgnoreVat(sampleEntries, true);

    // Tax entry should be gone
    expect(result.find((e) => e.account === 'GST/VAT Paid')).toBeUndefined();

    // Office Supplies expense should now carry the full $115 debit
    const office = result.find((e) => e.account === 'Office Supplies Expense');
    expect(office).toBeDefined();
    expect(office!.debit).toBe(115);
    expect(office!.description).toBe('Pens, paper, toner (Includes Tax)');

    // Credit entry untouched
    const bank = result.find((e) => e.account === 'Bank');
    expect(bank).toBeDefined();
    expect(bank!.credit).toBe(115);
  });

  it('preserves balance after redistribution', () => {
    const result = applyIgnoreVat(sampleEntries, true);
    expect(balanceDelta(result)).toBe(0);
  });

  it('distributes tax pro-rata across multiple expense entries', () => {
    const entries: ExtractedJournalLine[] = [
      // $80 expense + $20 expense = $100 base, $15 tax
      { account: 'Office Supplies', debit: 80, credit: 0, description: 'paper' },
      { account: 'Software', debit: 20, credit: 0, description: 'license' },
      { account: 'VAT Paid', debit: 15, credit: 0, description: 'input tax' },
      { account: 'Bank', debit: 0, credit: 115, description: 'paid' },
    ];

    const result = applyIgnoreVat(entries, true);

    const office = result.find((e) => e.account === 'Office Supplies');
    const software = result.find((e) => e.account === 'Software');

    // 80/100 = 80% of $15 tax → +$12.00 → debit becomes $92.00
    expect(office!.debit).toBe(92);
    // 20/100 = 20% of $15 tax → +$3.00 → debit becomes $23.00
    expect(software!.debit).toBe(23);

    expect(balanceDelta(result)).toBe(0);
  });

  it('matches tax accounts case-insensitively and on partial words', () => {
    const entries: ExtractedJournalLine[] = [
      { account: 'Office', debit: 100, credit: 0, description: 'x' },
      { account: 'Sales TAX Paid', debit: 10, credit: 0, description: 'x' },
      { account: 'Cash', debit: 0, credit: 110, description: 'x' },
    ];
    const result = applyIgnoreVat(entries, true);
    expect(result.find((e) => e.account === 'Sales TAX Paid')).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const before = JSON.parse(JSON.stringify(sampleEntries));
    applyIgnoreVat(sampleEntries, true);
    expect(sampleEntries).toEqual(before);
  });

  it('falls back to just dropping tax lines when no expense entries exist', () => {
    // Degenerate case: only credit + tax, no expense debit to redistribute into.
    const entries: ExtractedJournalLine[] = [
      { account: 'VAT Paid', debit: 15, credit: 0, description: 'tax' },
      { account: 'Bank', debit: 0, credit: 15, description: 'paid' },
    ];
    const result = applyIgnoreVat(entries, true);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe('Bank');
  });
});
