import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { extractReceipt } from '@/lib/gemini/extract';
import { normalizeDocumentNumber } from './normalize';

/**
 * Background extraction worker.
 *
 * Invoked from `POST /api/scan` as an UNAWAITED promise — the route returns
 * `{ scanId }` immediately and this function continues running in the
 * process. Per Plan §5.4 (Cowork addition) — Render free tier's 30s request
 * limit + Gemini latency would time out a synchronous flow.
 *
 * Updates the Scan row through its lifecycle:
 *   PENDING  → SCANNING  (job picks it up)
 *           → DONE       (extraction succeeded)
 *           → DUPLICATE_DETECTED (matched an existing tenant scan)
 *           → ERROR      (extraction failed; errorMessage populated)
 *
 * Caveat: if the Node process restarts mid-extraction, the row stays at
 * SCANNING. A reaper that marks SCANNING-older-than-N-minutes as ERROR will
 * land in a follow-up PR — not a blocker for the internal pilot since the
 * client polls and a stale SCANNING just shows as a perpetual spinner that
 * the user can manually reset.
 */
export interface ExtractJobInput {
  scanId: string;
  tenantId: string;
  base64: string;
  mimeType: string;
  startedAt: number;
}

export async function runExtractJob(input: ExtractJobInput): Promise<void> {
  const { scanId, tenantId, base64, mimeType, startedAt } = input;

  try {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: 'SCANNING' },
    });

    const extracted = await extractReceipt({ base64, mimeType });

    const documentNumberRaw =
      extracted.documentNumber && extracted.documentNumber !== 'N/A'
        ? extracted.documentNumber
        : null;
    const documentNumber = normalizeDocumentNumber(documentNumberRaw);

    // Cross-session dedup, tenant-scoped. Look for an existing DONE scan with
    // the same normalized documentNumber. Excludes the current scan itself.
    let duplicateOfId: string | null = null;
    if (documentNumber) {
      const existing = await prisma.scan.findFirst({
        where: {
          tenantId,
          documentNumber,
          status: 'DONE',
          id: { not: scanId },
        },
        select: { id: true },
      });
      if (existing) duplicateOfId = existing.id;
    }

    const transactionDate = parseTransactionDate(extracted.transactionDate);
    const currency = normalizeCurrency(extracted.currency);

    await prisma.$transaction(async (tx) => {
      await tx.scan.update({
        where: { id: scanId },
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
          currency,
          duplicateOfId,
          processingTimeMs: Date.now() - startedAt,
        },
      });

      if (extracted.entries.length > 0) {
        await tx.journalEntry.createMany({
          data: extracted.entries.map((e, position) => ({
            scanId,
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
            scanId,
            tenantId,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            total: li.total,
            position,
          })) satisfies Prisma.LineItemCreateManyInput[],
        });
      }
    });
  } catch (error: unknown) {
    console.error(`[scan ${scanId}] extraction failed:`, error);
    const message =
      error instanceof Error ? error.message : 'Unknown extraction error.';

    // Best-effort: mark the scan as errored so the UI can surface the message.
    // Swallow any error in THIS update — we don't want a DB blip to cause an
    // unhandled rejection that crashes the process.
    await prisma.scan
      .update({
        where: { id: scanId },
        data: {
          status: 'ERROR',
          errorMessage: message,
          processingTimeMs: Date.now() - startedAt,
        },
      })
      .catch((updateError) => {
        console.error(
          `[scan ${scanId}] failed to mark ERROR after extraction failure:`,
          updateError,
        );
      });
  }
}

function parseTransactionDate(raw: string): Date | null {
  if (!raw) return null;
  // Gemini returns YYYY-MM-DD; treat as UTC midnight to avoid TZ drift.
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Trim + uppercase. Return null if the extractor reported "" (the schema
 * convention for "no currency visible on the document"). We fall back to
 * `Tenant.currency` at display time when this is null.
 */
function normalizeCurrency(raw: string): string | null {
  const trimmed = (raw ?? '').trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}
