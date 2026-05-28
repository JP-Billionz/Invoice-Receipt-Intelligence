import { describe, expect, it, vi } from 'vitest';

import {
  TenantSettingsSchema,
  defaultTenantSettings,
  readTenantSettings,
  writeTenantSettings,
} from '@/lib/tenant/settings';

describe('TenantSettingsSchema', () => {
  it('parses an empty object into safe defaults', () => {
    const parsed = TenantSettingsSchema.parse({});
    expect(parsed.defaultCreditAccountInvoice).toBe('Accounts Payable');
    expect(parsed.defaultCreditAccountReceipt).toBe('Bank');
    expect(parsed.coaMapping).toBeUndefined();
    expect(parsed.defaultExpenseAccount).toBeUndefined();
  });

  it('parses a complete COA mapping', () => {
    const parsed = TenantSettingsSchema.parse({
      coaMapping: {
        'Office Supplies': '5100 — Office Supplies Expense',
        Travel: '5200 — Travel',
      },
      defaultExpenseAccount: '9999 — Miscellaneous',
    });
    expect(parsed.coaMapping?.['Office Supplies']).toBe('5100 — Office Supplies Expense');
    expect(parsed.defaultExpenseAccount).toBe('9999 — Miscellaneous');
  });

  it('rejects unknown keys (strict mode)', () => {
    const result = TenantSettingsSchema.safeParse({
      coaMapping: {},
      mysteryField: 'oops',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong types', () => {
    const result = TenantSettingsSchema.safeParse({
      coaMapping: 'not an object',
    });
    expect(result.success).toBe(false);
  });
});

describe('defaultTenantSettings', () => {
  it('is what readTenantSettings(null) returns', () => {
    expect(readTenantSettings(null)).toEqual(defaultTenantSettings);
  });

  it('has Accrual-rule defaults baked in', () => {
    expect(defaultTenantSettings.defaultCreditAccountInvoice).toBe('Accounts Payable');
    expect(defaultTenantSettings.defaultCreditAccountReceipt).toBe('Bank');
  });
});

describe('readTenantSettings', () => {
  it('returns defaults for null / undefined', () => {
    expect(readTenantSettings(null)).toEqual(defaultTenantSettings);
    expect(readTenantSettings(undefined)).toEqual(defaultTenantSettings);
  });

  it('parses valid stored JSON', () => {
    const result = readTenantSettings({
      coaMapping: { Travel: '5200' },
      defaultExpenseAccount: '9999',
    });
    expect(result.coaMapping?.Travel).toBe('5200');
  });

  it('falls back to defaults on corrupted JSON without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = readTenantSettings({ mystery: 'corrupt' });
    expect(result).toEqual(defaultTenantSettings);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('falls back to defaults on type mismatch', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = readTenantSettings('not an object');
    expect(result).toEqual(defaultTenantSettings);
    consoleSpy.mockRestore();
  });
});

describe('writeTenantSettings', () => {
  it('round-trips a valid value', () => {
    const input = TenantSettingsSchema.parse({
      coaMapping: { Travel: '5200' },
    });
    const stored = writeTenantSettings(input);
    expect(readTenantSettings(stored as unknown)).toEqual(input);
  });

  it('throws on invalid input rather than writing junk', () => {
    expect(() =>
      writeTenantSettings({
        // @ts-expect-error — deliberately wrong shape to verify throw
        coaMapping: 'not an object',
      }),
    ).toThrow();
  });
});
