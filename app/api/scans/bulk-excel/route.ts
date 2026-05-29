import { z } from 'zod';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildBulkScanWorkbook, defaultBulkFilename } from '@/lib/excel/bulk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  scanIds: z.array(z.string()).min(1).max(500),
  ignoreVat: z.boolean().optional().default(false),
});

/**
 * POST /api/scans/bulk-excel
 *
 * Body: { scanIds: string[], ignoreVat?: boolean }
 *
 * Streams the 3-sheet bulk Excel workbook for the given scan IDs. Filters
 * the requested IDs to the caller's tenant + only those that successfully
 * extracted — cross-tenant or never-extracted IDs are silently dropped
 * (no 4xx for partials, matches the prototype's behavior of just exporting
 * what's available).
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const tenantId = session.user.tenantId;

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    parsedBody = bodySchema.parse(await req.json());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body', details: String(err) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const scans = await prisma.scan.findMany({
    where: {
      id: { in: parsedBody.scanIds },
      tenantId,
      // Match prototype: only export rows that actually extracted.
      status: { in: ['DONE', 'DUPLICATE_DETECTED'] },
    },
    include: {
      journalEntries: { orderBy: { position: 'asc' } },
      lineItems: { orderBy: { position: 'asc' } },
    },
  });

  if (scans.length === 0) {
    return new Response('No exportable scans found.', { status: 404 });
  }

  const excelScans = scans.map((scan) => ({
    id: scan.id,
    vendor: scan.vendor,
    transactionDate: scan.transactionDate
      ? scan.transactionDate.toISOString().slice(0, 10)
      : null,
    documentNumber: scan.documentNumber,
    vatAmount:
      scan.vatAmount === null ? null : Number(scan.vatAmount.toString()),
    vatRate: scan.vatRate,
    expenseCategory: scan.expenseCategory,
    subtotal:
      scan.subtotal === null ? null : Number(scan.subtotal.toString()),
    totalAmount:
      scan.totalAmount === null ? null : Number(scan.totalAmount.toString()),
    isInvoice: scan.isInvoice,
    currency: scan.currency,
    journalEntries: scan.journalEntries.map((e) => ({
      account: e.account,
      debit: Number(e.debit.toString()),
      credit: Number(e.credit.toString()),
      description: e.description,
    })),
    lineItems: scan.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity.toString()),
      unitPrice: Number(li.unitPrice.toString()),
      total: Number(li.total.toString()),
    })),
  }));

  const buffer = buildBulkScanWorkbook(excelScans, {
    ignoreVat: parsedBody.ignoreVat,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${defaultBulkFilename()}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
