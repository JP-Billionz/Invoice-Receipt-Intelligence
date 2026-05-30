import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { currentTenant } from '@/lib/tenant';
import { serializeScan } from '@/lib/scan/serialize';
import { JournalEntryTable } from '@/components/scanner/JournalEntryTable';
import { LineItemTable } from '@/components/scanner/LineItemTable';
import { ScanDetailDownloadButton } from '@/components/scanner/ScanDetailDownloadButton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { scanId: string };
  searchParams: { ignoreVat?: string };
}

/**
 * Single-scan detail page. Server-rendered: fetches the scan directly via
 * Prisma (tenant-scoped) and renders the same JournalEntryTable /
 * LineItemTable used by the live scanner. Image is fetched lazily via
 * /api/scan/[scanId]/image (separate request — keeps the HTML small).
 */
export default async function ScanDetailPage({ params, searchParams }: PageProps) {
  const tenant = await currentTenant();
  if (!tenant) redirect('/login');

  const scan = await prisma.scan.findFirst({
    where: { id: params.scanId, tenantId: tenant.id },
    include: {
      lineItems: { orderBy: { position: 'asc' } },
      journalEntries: { orderBy: { position: 'asc' } },
    },
  });
  if (!scan) notFound();

  const data = serializeScan(scan);
  const ignoreVat = searchParams.ignoreVat === 'true';

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <nav className="mb-6 text-xs font-black uppercase tracking-widest text-slate-500">
        <Link
          href="/scans"
          className="hover:text-aisb-purple transition-colors"
        >
          ← Back to records
        </Link>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {data.mimeType === 'application/pdf' ? (
              <object
                data={`/api/scan/${data.id}/image`}
                type="application/pdf"
                className="w-full h-[600px] bg-slate-50"
              >
                <p className="p-6 text-sm text-slate-500">
                  PDF preview not supported in this browser.{' '}
                  <a
                    className="text-aisb-purple underline"
                    href={`/api/scan/${data.id}/image`}
                  >
                    Open file
                  </a>
                </p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/scan/${data.id}/image`}
                alt={`Receipt ${data.fileName}`}
                className="w-full object-contain bg-slate-50"
              />
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-mono text-center break-all">
            {data.fileName}
          </p>
        </aside>

        <main className="lg:col-span-2">
          <JournalEntryTable
            data={data}
            tenantCurrency={tenant.currency}
            ignoreVat={ignoreVat}
            onDownloadExcel={null}
          />
          {data.lineItems.length > 0 && (
            <LineItemTable
              items={data.lineItems}
              currency={data.currency ?? tenant.currency}
            />
          )}
          <ScanDetailDownloadButton scanId={data.id} ignoreVat={ignoreVat} />
        </main>
      </div>
    </div>
  );
}
