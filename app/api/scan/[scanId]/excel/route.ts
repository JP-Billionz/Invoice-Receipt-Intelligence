import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  buildSingleScanWorkbook,
  defaultSingleFilename,
} from '@/lib/excel/single';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scan/[scanId]/excel
 *
 * Streams the single-scan Excel workbook (4 sheets — see
 * `lib/excel/single.ts`). Tenant-scoped; 404 on any cross-tenant scan ID.
 *
 * Query param `ignoreVat=true` applies the redistribution mode at export
 * time, matching the prototype's toggle.
 */
export async function GET(
  req: Request,
  { params }: { params: { scanId: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const ignoreVat = url.searchParams.get('ignoreVat') === 'true';

  const scan = await prisma.scan.findFirst({
    where: { id: params.scanId, tenantId: session.user.tenantId },
    include: {
      journalEntries: { orderBy: { position: 'asc' } },
      lineItems: { orderBy: { position: 'asc' } },
    },
  });
  if (!scan) {
    return new Response('Not found', { status: 404 });
  }

  const excelScan = {
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
    subtotal: scan.subtotal === null ? null : Number(scan.subtotal.toString()),
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
  };

  const buffer = buildSingleScanWorkbook(excelScan, { ignoreVat });
  const filename = defaultSingleFilename(excelScan);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
