import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/**
 * Validated shape of `Tenant.settings` (stored as JSONB).
 *
 * Per Plan §5.2 (Cowork addition). `Tenant.settings` is `Json?` in Prisma — DB
 * stores anything, but every read/write at the app layer goes through this
 * Zod schema so the COA mapping (and any future tenant-level config) stays
 * type-safe.
 *
 * Add new fields by extending the schema below and providing a sensible
 * default. Don't rename or remove fields without a migration step that reads
 * old rows and rewrites them through the new schema.
 */
export const TenantSettingsSchema = z
  .object({
    /**
     * Maps "natural" expense category (the strings Gemini returns — "Office
     * Supplies", "Travel", etc.) → AISB chart-of-accounts account name.
     * Populated when Jamai provides the AISB COA (Plan §4.2).
     */
    coaMapping: z.record(z.string(), z.string()).optional(),

    /**
     * Account to debit when Gemini can't classify confidently. Falls back to
     * "Miscellaneous Expense" if unset.
     */
    defaultExpenseAccount: z.string().optional(),

    /**
     * Default credit accounts for the accrual rule applied in the extraction
     * prompt. Cf. `lib/gemini/prompts.ts`. Overridable per-tenant for orgs
     * with non-standard chart of accounts.
     */
    defaultCreditAccountInvoice: z.string().default('Accounts Payable'),
    defaultCreditAccountReceipt: z.string().default('Bank'),
  })
  .strict();

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

/**
 * Default settings used when a Tenant row's `settings` is null. Returned by
 * `readTenantSettings(null)` so callers never need a null check.
 */
export const defaultTenantSettings: TenantSettings = TenantSettingsSchema.parse({});

/**
 * Validate and coerce raw `Tenant.settings` JSON into a typed `TenantSettings`.
 *
 * Logs and falls back to defaults on parse failure rather than throwing — a
 * tenant with corrupted settings should still be able to use the app; an
 * admin can fix settings via a separate flow.
 */
export function readTenantSettings(raw: Prisma.JsonValue | null | undefined): TenantSettings {
  if (raw === null || raw === undefined) {
    return defaultTenantSettings;
  }
  const result = TenantSettingsSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      '[tenant] settings JSON failed validation, falling back to defaults:',
      result.error.flatten(),
    );
    return defaultTenantSettings;
  }
  return result.data;
}

/**
 * Validate before writing to `Tenant.settings`. Throws on invalid input —
 * callers SHOULD catch and surface a 400 to the user; corrupted writes
 * shouldn't happen silently.
 */
export function writeTenantSettings(settings: TenantSettings): Prisma.JsonObject {
  // .parse() throws on invalid; that's the intended behavior for writes.
  const parsed = TenantSettingsSchema.parse(settings);
  // Prisma's JsonValue type accepts plain objects.
  return parsed as unknown as Prisma.JsonObject;
}
