/**
 * Normalize a document number for tenant-scoped, cross-session duplicate
 * detection.
 *
 * Mirrors the prototype's in-session dedup logic (`App.tsx:189`): strip
 * non-alphanumerics, uppercase. So `INV-2024/01`, `inv2024-01`, and
 * `INV 202401` all collide and map to the same key.
 *
 * Returns `null` for empty / "N/A" input — callers should not run a dedup
 * lookup against null.
 */
export function normalizeDocumentNumber(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'N/A') return null;
  const normalized = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
