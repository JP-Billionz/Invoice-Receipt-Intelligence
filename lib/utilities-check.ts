/**
 * Detect whether a line-item description refers to a utility bill
 * (electricity or water).
 *
 * Per SCOPE-MVP §2 and the kickoff non-negotiables: utilities are excluded
 * from price comparison entirely — we never call Gemini for them. This
 * function is the canonical detector, used by the comparison handler
 * (`lib/gemini/comparison.ts`) and by the UI to hide the comparison column
 * on utility line items.
 *
 * Conservative on false positives — better to skip a comparison call than
 * to waste tokens on "electric kettle" or "bottled water" — but not
 * aggressive: generic words like "bill" alone aren't enough.
 */
const UTILITY_PATTERNS: RegExp[] = [
  // Electricity / power
  /\belectric(?:al|ity)?\s+(?:bill|charge|usage|service)\b/i,
  /\bb\.?\s*l\.?\s*&?\s*p\.?\b/i, // BL&P / B.L.&P. / BL P (Barbados Light & Power)
  /\bbarbados\s+light\s*&?\s*power\b/i,
  /\bkwh\b/i,
  /\benergy\s+(?:bill|charge|usage)\b/i,
  /\bpower\s+(?:bill|charge|usage|consumption)\b/i,

  // Water
  /\bwater\s+(?:bill|charge|usage|service|rate)\b/i,
  /\bbwa\b/i, // Barbados Water Authority
  /\bbarbados\s+water\s+authority\b/i,
  /\bsewerage\b/i,

  // Generic "utility" phrasing
  /\butility\s+(?:bill|charge|service)\b/i,
];

export function isUtilityLineItem(description: string): boolean {
  if (!description) return false;
  return UTILITY_PATTERNS.some((re) => re.test(description));
}
