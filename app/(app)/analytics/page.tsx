import { redirect } from 'next/navigation';

import { currentTenant } from '@/lib/tenant';
import { AnalyticsDashboard } from '@/components/scanner/AnalyticsDashboard';

export const metadata = {
  title: 'Analytics — Receipt Intelligence AI',
};

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const tenant = await currentTenant();
  if (!tenant) redirect('/login');

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">
          Analytics
        </h1>
        <p className="text-sm text-slate-500">
          Aggregated spend across your workspace, refreshed every 30 seconds.
        </p>
      </header>
      <AnalyticsDashboard tenantCurrency={tenant.currency} />
    </div>
  );
}
