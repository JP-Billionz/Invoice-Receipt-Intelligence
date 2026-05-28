import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { readTenantSettings, type TenantSettings } from './settings';

/**
 * Server-side tenant resolution from the current session. Returns null if the
 * caller isn't signed in OR has no tenantId attached.
 *
 * Use this in API routes + server components instead of touching `auth()`
 * directly when you need the tenant — it bundles the settings read through
 * the Zod validator.
 */
export interface ResolvedTenant {
  id: string;
  name: string;
  currency: string;
  settings: TenantSettings;
}

export async function currentTenant(): Promise<ResolvedTenant | null> {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  const row = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { id: true, name: true, currency: true, settings: true },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    settings: readTenantSettings(row.settings),
  };
}
