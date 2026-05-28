import { describe, expect, it } from 'vitest';

import { normalizeDocumentNumber } from '@/lib/scan/normalize';

describe('normalizeDocumentNumber', () => {
  it('returns null for empty / nullish input', () => {
    expect(normalizeDocumentNumber(null)).toBeNull();
    expect(normalizeDocumentNumber(undefined)).toBeNull();
    expect(normalizeDocumentNumber('')).toBeNull();
    expect(normalizeDocumentNumber('   ')).toBeNull();
  });

  it('returns null for "N/A" sentinel (any case)', () => {
    expect(normalizeDocumentNumber('N/A')).toBeNull();
    expect(normalizeDocumentNumber('n/a')).toBeNull();
    expect(normalizeDocumentNumber('  N/A  ')).toBeNull();
  });

  it('strips non-alphanumerics and uppercases', () => {
    expect(normalizeDocumentNumber('INV-2024/01')).toBe('INV202401');
    expect(normalizeDocumentNumber('inv 2024-01')).toBe('INV202401');
    expect(normalizeDocumentNumber('inv2024_01')).toBe('INV202401');
  });

  it('collapses different formatting of the same doc number to the same key', () => {
    const variants = [
      'INV-2024/01',
      'inv 2024 01',
      'INV2024.01',
      '  inv-2024-01  ',
    ];
    const normalized = variants.map((v) => normalizeDocumentNumber(v));
    expect(new Set(normalized).size).toBe(1);
  });

  it('returns null when the result would be empty after stripping', () => {
    expect(normalizeDocumentNumber('---')).toBeNull();
    expect(normalizeDocumentNumber('   / / ')).toBeNull();
  });
});
