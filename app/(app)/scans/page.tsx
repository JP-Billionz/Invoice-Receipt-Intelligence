import { redirect } from 'next/navigation';

import { currentTenant } from '@/lib/tenant';
import { ScansListClient } from '@/components/scans/ScansListClient';

export const metadata = {
  title: 'Records — Receipt Intelligence AI',
};

export const dynamic = 'force-dynamic';

export default async function ScansListPage() {
  const tenant = await currentTenant();
  if (!tenant) redirect('/login');
  return <ScansListClient tenantCurrency={tenant.currency} />;
}
