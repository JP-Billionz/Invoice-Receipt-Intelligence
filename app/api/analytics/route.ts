import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics
 *
 * Per-tenant aggregates feeding the AnalyticsDashboard. Mirrors what the
 * prototype's localStorage analytics computed, but now backed by Postgres
 * (no per-device drift, persists across re-installs).
 *
 *   - totalInvoices         scan count (status: DONE | DUPLICATE_DETECTED)
 *   - totalSpend            sum(totalAmount)
 *   - totalVat              sum(vatAmount)
 *   - avgProcessingTime     avg(processingTimeMs)
 *   - topVendors            top 5 by total spend
 *   - categories            spend per expenseCategory
 *   - volumeLast7Days       scan count per day (last 7 days)
 *   - docTypeCounts         { invoice, receipt, unknown } counts
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  // Only count scans that landed successfully (DONE or DUPLICATE_DETECTED).
  // Excludes EXCLUDED / ERROR / PENDING / SCANNING.
  const baseWhere = {
    tenantId,
    status: { in: ['DONE', 'DUPLICATE_DETECTED'] as ('DONE' | 'DUPLICATE_DETECTED')[] },
  };

  const scans = await prisma.scan.findMany({
    where: baseWhere,
    select: {
      vendor: true,
      expenseCategory: true,
      totalAmount: true,
      vatAmount: true,
      processingTimeMs: true,
      isInvoice: true,
      createdAt: true,
    },
  });

  let totalSpend = 0;
  let totalVat = 0;
  let totalProcessingMs = 0;
  let processedCount = 0;

  const vendorTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  const docTypeCounts = { invoice: 0, receipt: 0, unknown: 0 };

  const last7Days = computeLast7DayBuckets();
  const dayBuckets = new Map(last7Days.map((d) => [d, 0]));

  for (const s of scans) {
    const total = s.totalAmount ? Number(s.totalAmount.toString()) : 0;
    const vat = s.vatAmount ? Number(s.vatAmount.toString()) : 0;
    totalSpend += total;
    totalVat += vat;

    if (s.processingTimeMs != null) {
      totalProcessingMs += s.processingTimeMs;
      processedCount += 1;
    }

    if (s.vendor) {
      vendorTotals.set(s.vendor, (vendorTotals.get(s.vendor) ?? 0) + total);
    }
    if (s.expenseCategory) {
      categoryTotals.set(
        s.expenseCategory,
        (categoryTotals.get(s.expenseCategory) ?? 0) + total,
      );
    }

    if (s.isInvoice === true) docTypeCounts.invoice += 1;
    else if (s.isInvoice === false) docTypeCounts.receipt += 1;
    else docTypeCounts.unknown += 1;

    const day = s.createdAt.toISOString().slice(0, 10);
    if (dayBuckets.has(day)) {
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    }
  }

  const topVendors = Array.from(vendorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, spend]) => ({ vendor, spend: round2(spend) }));

  const categories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, spend]) => ({ category, spend: round2(spend) }));

  const volumeLast7Days = last7Days.map((date) => ({
    date,
    count: dayBuckets.get(date) ?? 0,
  }));

  return NextResponse.json({
    totalInvoices: scans.length,
    totalSpend: round2(totalSpend),
    totalVat: round2(totalVat),
    avgProcessingTimeMs:
      processedCount === 0 ? 0 : Math.round(totalProcessingMs / processedCount),
    topVendors,
    categories,
    volumeLast7Days,
    docTypeCounts,
  });
}

function computeLast7DayBuckets(): string[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
