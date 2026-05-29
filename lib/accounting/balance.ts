import type { ExtractedJournalLine } from '@/lib/gemini/schema';

/**
 * Re-balance a journal entry under the "Ignore VAT" mode.
 *
 * Ported from prototype `App.tsx:74-118` (with duplicate implementation in
 * `components/JournalEntryTable.tsx:14-72`). One canonical implementation
 * lives here, used by both the API layer (Excel export) and the UI.
 *
 * Algorithm:
 *   - When `ignoreVat` is false → return entries unchanged.
 *   - When `ignoreVat` is true:
 *       1. Find all "tax" entries (account name matching /tax|vat|gst/i).
 *       2. Find all expense-debit entries (debit > 0, non-tax).
 *       3. Distribute total tax-debit across expense entries pro-rata by their
 *          existing debit weight, append " (Includes Tax)" to descriptions.
 *       4. Drop the tax entries themselves.
 *   - Edge case: if there are tax entries but no expense entries, just drop
 *     the tax lines without redistribution (a partial fallback the prototype
 *     has — prevents an empty result, but the entry will no longer balance).
 *
 * Returns a NEW array; the input is not mutated.
 */
export function applyIgnoreVat(
  entries: readonly ExtractedJournalLine[],
  ignoreVat: boolean,
): ExtractedJournalLine[] {
  if (!ignoreVat) return [...entries];

  const isTax = (account: string) => {
    const lower = account.toLowerCase();
    return (
      lower.includes('tax') ||
      lower.includes('vat') ||
      lower.includes('gst')
    );
  };

  const taxEntries = entries.filter((e) => isTax(e.account));
  if (taxEntries.length === 0) return [...entries];

  const totalTaxDebit = taxEntries.reduce(
    (sum, e) => sum + (e.debit || 0),
    0,
  );

  const expenseEntries = entries.filter(
    (e) => !isTax(e.account) && e.debit > 0,
  );

  if (expenseEntries.length === 0) {
    // No expense lines to redistribute into — just drop the tax lines.
    // Result will no longer balance; the UI surfaces a warning.
    return entries.filter((e) => !isTax(e.account));
  }

  const totalBaseExpense = expenseEntries.reduce((sum, e) => sum + e.debit, 0);

  return entries
    .filter((e) => !isTax(e.account))
    .map((e) => {
      if (e.debit <= 0) return { ...e };
      const ratio =
        totalBaseExpense > 0
          ? e.debit / totalBaseExpense
          : 1 / expenseEntries.length;
      return {
        ...e,
        debit: round2(e.debit + totalTaxDebit * ratio),
        description: `${e.description} (Includes Tax)`,
      };
    });
}

/** Test helper — sum of debits minus sum of credits, rounded to cents. */
export function balanceDelta(
  entries: readonly ExtractedJournalLine[],
): number {
  const debits = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const credits = entries.reduce((s, e) => s + (e.credit || 0), 0);
  return round2(debits - credits);
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
