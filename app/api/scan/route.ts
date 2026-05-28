import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractReceipt } from '@/lib/gemini/extract';
import { normalizeDocumentNumber } from '@/lib/scan/normalize';
import { serializeScan } from '@/lib/scan/serialize';
import type { Prisma } from '@prisma/client';

// Allow up to ~60s for Gemini round-trip on a slow image. Render free-tier
// request timeout is generous; this just sets the Vercel/Next-side cap.
export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const sourceSchema = z.enum(['SINGLE', 'BULK', 'FOLDER_WATCHER']).default('SINGLE');

/**
 * POST /api/scan
 *
 * Multipart form fields:
 *   - file:   the receipt/invoice image or PDF
 *   - source: one of "SINGLE" | "BULK" | "FOLDER_WATCHER" (defaults to SINGLE)
 *
 * Synchronous: blocks until Gemini extraction + persistence are done. For
 * MVP this is fine — single receipt extraction takes ~5-10s. Bulk processing
 * is still done client-driven (one POST per file), the same way the prototype
 * worked. A real job queue can come later if needed.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data body.' },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing `file` form field.' },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type "${file.type}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      },
      { status: 415 },
    );
  }

  const sourceResult = sourceSchema.safeParse(formData.get('source') ?? 'SINGLE');
  if (!sourceResult.success) {
    return NextResponse.json(
      { error: 'Invalid `source` value.' },
      { status: 400 },
    );
  }
  const source = sourceResult.data;

  // Create the Scan row up front so we always have an ID — even if extraction
  // throws, the row sticks around with status=ERROR and a friendly message.
  const scan = await prisma.scan.create({
    data: {
      tenantId,
      uploadedById: userId,
      source,
      status: 'SCANNING',
      fileName: file.name,
      mimeType: file.type,
    },
  });

  const startedAt = Date.now();

  try {
    const arrayBuf = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');

    const extracted = await extractReceipt({ base64, mimeType: file.type });

    const documentNumberRaw =
      extracted.documentNumber && extracted.documentNumber !== 'N/A'
        ? extracted.documentNumber
        : null;
    const documentNumber = normalizeDocumentNumber(documentNumberRaw);

    // Cross-session dedup, tenant-scoped. Look for an existing DONE scan with
    // the same normalized documentNumber.
    let duplicateOfId: string | null = null;
    if (documentNumber) {
      const existing = await prisma.scan.findFirst({
        where: {
          tenantId,
          documentNumber,
          status: 'DONE',
          id: { not: scan.id },
        },
        select: { id: true },
      });
      if (existing) duplicateOfId = existing.id;
    }

    const transactionDate = parseTransactionDate(extracted.transactionDate);

    const result = await prisma.$transaction(async (tx) => {
      await tx.scan.update({
        where: { id: scan.id },
        data: {
          status: duplicateOfId ? 'DUPLICATE_DETECTED' : 'DONE',
          vendor: extracted.vendor,
          transactionDate,
          documentNumber,
          documentNumberRaw,
          vatAmount: extracted.vatAmount,
          vatRate: extracted.vatRate,
          expenseCategory: extracted.expenseCategory,
          subtotal: extracted.subtotal,
          totalAmount: extracted.totalAmount,
          isInvoice: extracted.isInvoice,
          duplicateOfId,
          processingTimeMs: Date.now() - startedAt,
        },
      });

      if (extracted.entries.length > 0) {
        await tx.journalEntry.createMany({
          data: extracted.entries.map((e, position) => ({
            scanId: scan.id,
            tenantId,
            account: e.account,
            debit: e.debit,
            credit: e.credit,
            description: e.description,
            position,
          })) satisfies Prisma.JournalEntryCreateManyInput[],
        });
      }

      if (extracted.lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: extracted.lineItems.map((li, position) => ({
            scanId: scan.id,
            tenantId,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            total: li.total,
            position,
          })) satisfies Prisma.LineItemCreateManyInput[],
        });
      }

      return tx.scan.findUniqueOrThrow({
        where: { id: scan.id },
        include: { lineItems: true, journalEntries: true },
      });
    });

    return NextResponse.json(serializeScan(result), { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown extraction error.';
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: 'ERROR',
        errorMessage: message,
        processingTimeMs: Date.now() - startedAt,
      },
    });
    return NextResponse.json(
      { error: message, scanId: scan.id },
      { status: 500 },
    );
  }
}

function parseTransactionDate(raw: string): Date | null {
  if (!raw) return null;
  // Gemini returns YYYY-MM-DD; treat as UTC midnight to avoid TZ drift.
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
