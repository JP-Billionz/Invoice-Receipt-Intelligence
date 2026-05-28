import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  runComparison,
  type ComparisonLineItem,
  type ComparisonResult,
} from '@/lib/gemini/comparison';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scan/[scanId]/comparison
 *
 * Runs Barbados-local price comparisons for every line item on the scan, with
 * full guardrails (utilities excluded, sources Barbados-only, no fabricated
 * prices). Persists one Comparison row per LineItem — `skipped: true` for
 * utilities, `comparablePrice: null` for the "no Barbados source" case,
 * full data for the "found" case.
 *
 * Tenant-scoped. 404s for any scan ID outside the caller's tenant.
 *
 * Re-running on a scan with existing Comparison rows upserts them — useful
 * once the BB_RETAILER_ALLOWLIST is expanded or comparison logic is tuned.
 */
export async function POST(
  _req: Request,
  { params }: { params: { scanId: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const scan = await prisma.scan.findFirst({
    where: { id: params.scanId, tenantId },
    include: { lineItems: { orderBy: { position: 'asc' } } },
  });
  if (!scan) {
    return NextResponse.json({ error: 'Scan not found.' }, { status: 404 });
  }

  if (scan.lineItems.length === 0) {
    return NextResponse.json({ scanId: scan.id, comparisons: [] });
  }

  const input: ComparisonLineItem[] = scan.lineItems.map((li) => ({
    id: li.id,
    description: li.description,
    total: Number(li.total.toString()),
  }));

  const results = await runComparison({
    lineItems: input,
    allowlist: process.env.BB_RETAILER_ALLOWLIST ?? '',
  });

  // Upsert every result into the Comparison table. Each LineItem can have at
  // most one Comparison row (`lineItemId` is unique). Keeps the API
  // idempotent — re-running is safe.
  await prisma.$transaction(async (tx) => {
    for (const li of scan.lineItems) {
      const result = results.get(li.id);
      if (!result) continue; // shouldn't happen — runComparison emits a result for every input

      const base = {
        tenantId,
        searchedAt: result.searchedAt,
      };

      const data =
        result.kind === 'skipped'
          ? {
              ...base,
              comparablePrice: null,
              comparableProduct: null,
              comparableVendor: null,
              sourceUrl: null,
              sourceTitle: null,
              skipped: true,
              skipReason: result.reason,
            }
          : {
              ...base,
              comparablePrice: result.comparablePrice,
              comparableProduct: result.comparableProduct,
              comparableVendor: result.comparableVendor,
              sourceUrl: result.sourceUrl,
              sourceTitle: result.sourceTitle,
              skipped: false,
              skipReason: null,
            };

      await tx.comparison.upsert({
        where: { lineItemId: li.id },
        create: { lineItemId: li.id, ...data },
        update: data,
      });
    }
  });

  // Return the scan's comparisons for the client.
  const persisted = await prisma.comparison.findMany({
    where: {
      lineItem: { scanId: scan.id, tenantId },
    },
    include: { lineItem: { select: { id: true, description: true } } },
    orderBy: { lineItem: { position: 'asc' } },
  });

  return NextResponse.json({
    scanId: scan.id,
    comparisons: persisted.map((c) => ({
      lineItemId: c.lineItemId,
      lineItemDescription: c.lineItem.description,
      comparablePrice:
        c.comparablePrice === null ? null : Number(c.comparablePrice.toString()),
      comparableProduct: c.comparableProduct,
      comparableVendor: c.comparableVendor,
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      skipped: c.skipped,
      skipReason: c.skipReason,
      searchedAt: c.searchedAt.toISOString(),
    })),
  });
}
