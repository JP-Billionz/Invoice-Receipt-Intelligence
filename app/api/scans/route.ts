import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .preprocess((v) => (typeof v === 'string' ? parseInt(v, 10) : v), z.number().int().min(1).max(100))
    .default(25),
  vendor: z.string().optional(),
  account: z.string().optional(),
  minAmount: z
    .preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number())
    .optional(),
  maxAmount: z
    .preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number())
    .optional(),
  // ISO date strings (YYYY-MM-DD), inclusive.
  from: z.string().optional(),
  to: z.string().optional(),
});

/**
 * GET /api/scans
 *
 * Paginated records list, tenant-scoped. Cursor-based pagination keyed by
 * scan id (createdAt-desc). Supports filters: vendor (icontains), account
 * (matches any journal entry), amount range, date range.
 *
 * Returns lightweight rows — no lineItems/journalEntries/fileBlob. The
 * client fetches the full scan via GET /api/scan/[scanId] when the user
 * clicks through.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const q = parsed.data;

  const where: Record<string, unknown> = { tenantId };
  if (q.vendor) where.vendor = { contains: q.vendor, mode: 'insensitive' };
  if (q.from || q.to) {
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (q.from) {
      const d = new Date(`${q.from}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) dateRange.gte = d;
    }
    if (q.to) {
      const d = new Date(`${q.to}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) dateRange.lte = d;
    }
    where.transactionDate = dateRange;
  }
  if (q.minAmount !== undefined || q.maxAmount !== undefined) {
    const amt: { gte?: number; lte?: number } = {};
    if (q.minAmount !== undefined) amt.gte = q.minAmount;
    if (q.maxAmount !== undefined) amt.lte = q.maxAmount;
    where.totalAmount = amt;
  }
  if (q.account) {
    where.journalEntries = {
      some: {
        account: { contains: q.account, mode: 'insensitive' },
      },
    };
  }

  const scans = await prisma.scan.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: q.limit + 1, // peek for next-cursor
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      source: true,
      vendor: true,
      transactionDate: true,
      documentNumber: true,
      expenseCategory: true,
      totalAmount: true,
      currency: true,
      isInvoice: true,
      duplicateOfId: true,
      createdAt: true,
    },
  });

  const hasMore = scans.length > q.limit;
  const page = hasMore ? scans.slice(0, q.limit) : scans;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    items: page.map((s) => ({
      id: s.id,
      status: s.status,
      source: s.source,
      vendor: s.vendor,
      transactionDate: s.transactionDate
        ? s.transactionDate.toISOString().slice(0, 10)
        : null,
      documentNumber: s.documentNumber,
      expenseCategory: s.expenseCategory,
      totalAmount:
        s.totalAmount === null ? null : Number(s.totalAmount.toString()),
      currency: s.currency,
      isInvoice: s.isInvoice,
      duplicateOfId: s.duplicateOfId,
      createdAt: s.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
