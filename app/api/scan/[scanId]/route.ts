import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { serializeScan } from '@/lib/scan/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scan/[scanId]
 *
 * Returns a single scan with its line items + journal entries, scoped to the
 * caller's tenant. 404s for any scan outside the tenant — never leak existence
 * of cross-tenant rows.
 */
export async function GET(
  _req: Request,
  { params }: { params: { scanId: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scan = await prisma.scan.findFirst({
    where: {
      id: params.scanId,
      tenantId: session.user.tenantId,
    },
    include: { lineItems: true, journalEntries: true },
  });

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found.' }, { status: 404 });
  }

  return NextResponse.json(serializeScan(scan));
}
