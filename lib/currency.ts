/**
 * Currency formatting helper. Respects tenant currency (default BBD per
 * Plan §4.6). Used everywhere money is rendered — UI, Excel, emails.
 *
 * The prototype hardcoded 'en-US' + 'USD' throughout — DO NOT reintroduce.
 * Always pass an explicit currency code or fall back to BBD here.
 */

const FALLBACK_CURRENCY = 'BBD';
const LOCALE = 'en-BB';

/**
 * Format a number as currency.
 *
 * @param amount - numeric amount in major units (e.g. 22.50 means $22.50)
 * @param currency - ISO 4217 code (e.g. "BBD", "USD"). Defaults to "BBD".
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined = FALLBACK_CURRENCY,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }
  const code = (currency ?? FALLBACK_CURRENCY).trim().toUpperCase() || FALLBACK_CURRENCY;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Invalid currency code (e.g. corrupt DB value) — fall back to a plain
    // number with the code prefixed so the value is still readable.
    return `${code} ${amount.toFixed(2)}`;
  }
}

/**
 * Resolve the effective currency for a scan — Scan.currency overrides
 * Tenant.currency per Plan §4.6 (Cowork resolution).
 */
export function effectiveCurrency(
  scanCurrency: string | null | undefined,
  tenantCurrency: string | null | undefined,
): string {
  return (
    (scanCurrency ?? '').trim().toUpperCase() ||
    (tenantCurrency ?? '').trim().toUpperCase() ||
    FALLBACK_CURRENCY
  );
}
