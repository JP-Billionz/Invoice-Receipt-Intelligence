import { describe, expect, it } from 'vitest';

import { effectiveCurrency, formatCurrency } from '@/lib/currency';

describe('formatCurrency', () => {
  it('renders BBD by default (en-BB locale uses the local dollar sign)', () => {
    const out = formatCurrency(22.5);
    // BBD in en-BB renders as "$22.50" because the local currency uses an
    // unambiguous dollar sign in this locale. The important contract is
    // that some currency mark + the cents-precise amount appear.
    expect(out).toMatch(/22\.50/);
    expect(out).toMatch(/[$£€]|BBD|BDS/);
  });

  it('renders the provided currency code', () => {
    const usd = formatCurrency(100, 'USD');
    expect(usd).toMatch(/100\.00/);
    expect(usd).toMatch(/\$/);

    const eur = formatCurrency(50, 'EUR');
    expect(eur).toMatch(/50\.00/);
  });

  it('returns "—" for null / undefined / non-finite', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('falls back gracefully on an invalid currency code', () => {
    const out = formatCurrency(10, 'NOTREAL');
    expect(out).toContain('10.00');
    expect(out).toContain('NOTREAL');
  });

  it('lowercases / whitespace-tolerant on currency code', () => {
    expect(formatCurrency(10, '  bbd  ')).toMatch(/10\.00/);
  });

  it('treats empty / whitespace currency as the default', () => {
    const out = formatCurrency(10, '   ');
    expect(out).toMatch(/10\.00/);
    expect(out).toMatch(/[$£€]|BBD|BDS/);
  });
});

describe('effectiveCurrency', () => {
  it('prefers scan currency when set', () => {
    expect(effectiveCurrency('USD', 'BBD')).toBe('USD');
  });

  it('falls back to tenant currency when scan currency is null', () => {
    expect(effectiveCurrency(null, 'BBD')).toBe('BBD');
    expect(effectiveCurrency(undefined, 'EUR')).toBe('EUR');
    expect(effectiveCurrency('', 'BBD')).toBe('BBD');
    expect(effectiveCurrency('   ', 'BBD')).toBe('BBD');
  });

  it('falls back to BBD when both are missing', () => {
    expect(effectiveCurrency(null, null)).toBe('BBD');
    expect(effectiveCurrency(null, '')).toBe('BBD');
  });

  it('uppercases', () => {
    expect(effectiveCurrency('usd', null)).toBe('USD');
  });
});
