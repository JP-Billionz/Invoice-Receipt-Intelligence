/**
 * Barbados-locality check for price-comparison sources.
 *
 * A source URL counts as Barbados-local if:
 *   1. Its hostname ends with the `.bb` TLD, OR
 *   2. Its hostname matches (exactly or as a subdomain of) an entry in the
 *      runtime allowlist parsed from `BB_RETAILER_ALLOWLIST`, editable in
 *      the Render dashboard without a redeploy.
 *
 * Any URL that fails both checks is treated as "not Barbados" and dropped
 * from the comparison result — per kickoff §6 and SCOPE-MVP §2.
 *
 * Pure / synchronous / no I/O.
 */

export interface LocalityCheck {
  isLocal: boolean;
  /** Lowercased hostname extracted from the URL, or null if URL was invalid. */
  hostname: string | null;
  /** Why the URL was (or wasn't) accepted — useful for logs. */
  reason: 'invalid-url' | 'bb-tld' | 'allowlist' | 'not-barbados';
}

/**
 * Parse a comma-separated allowlist string into a normalized array of
 * lowercased host suffixes. Whitespace-tolerant, dedupes.
 */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    ),
  );
}

export function checkBarbadosLocality(
  url: string,
  allowlist: readonly string[],
): LocalityCheck {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { isLocal: false, hostname: null, reason: 'invalid-url' };
  }

  if (hostname.endsWith('.bb')) {
    return { isLocal: true, hostname, reason: 'bb-tld' };
  }

  for (const entry of allowlist) {
    const e = entry.toLowerCase();
    if (hostname === e || hostname.endsWith('.' + e)) {
      return { isLocal: true, hostname, reason: 'allowlist' };
    }
  }

  return { isLocal: false, hostname, reason: 'not-barbados' };
}
