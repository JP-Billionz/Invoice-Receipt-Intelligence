import { redirect } from 'next/navigation';

import { currentTenant } from '@/lib/tenant';
import { ScannerClient } from '@/components/scanner/ScannerClient';

export const metadata = {
  title: 'Scan — Receipt Intelligence AI',
};

export const dynamic = 'force-dynamic';

/**
 * Main scanner page. Server component that resolves the tenant once, then
 * hands off to the `ScannerClient` orchestrator for the interactive UI.
 *
 * The auth-guarded `(app)` layout already redirects unauthenticated users
 * to /login; we re-check for tenantId defensively to satisfy TS narrowing
 * before passing `tenantCurrency` to the client.
 */
export default async function ScanPage() {
  const tenant = await currentTenant();
  if (!tenant) redirect('/login');

  return <ScannerClient tenantCurrency={tenant.currency} />;
}
