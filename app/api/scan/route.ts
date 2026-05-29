import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkGeminiRateLimit } from '@/lib/ratelimit/tenant';
import { runExtractJob } from '@/lib/scan/extract-job';
import { imageStorage } from '@/lib/storage';

// Foreground budget is small — we return scanId fast and let the background
// job run after the response. The job itself doesn't have a hard limit; it
// finishes when Gemini responds (typically 5-10s).
export const maxDuration = 15;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const sourceSchema = z
  .enum(['SINGLE', 'BULK', 'FOLDER_WATCHER'])
  .default('SINGLE');

/**
 * POST /api/scan — ASYNC upload + extract.
 *
 * Per Plan §5.4 (Cowork addition). Render free tier's 30s request limit +
 * Gemini's 5-10s latency would time out a synchronous flow, so:
 *
 *   1. Auth + rate-limit gate (per-tenant Gemini bucket — §5.3)
 *   2. Validate file
 *   3. Create Scan row with status: PENDING
 *   4. Store image bytes via lib/storage (Postgres bytea for MVP)
 *   5. Kick off runExtractJob(scanId) as an unawaited promise
 *   6. Return { scanId, status: PENDING } within ~50-200ms
 *
 * Client then polls GET /api/scan/[scanId] until status is terminal.
 *
 * Multipart form fields:
 *   - file:   the receipt/invoice image or PDF
 *   - source: "SINGLE" | "BULK" | "FOLDER_WATCHER" (default SINGLE)
 */
export async function POST(req: Request): Promise<Response> {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  // 2. Per-tenant Gemini rate limit (§5.3) — checked BEFORE doing any expensive
  // work so a hot tenant doesn't drain the bucket and starve everyone else.
  const rate = checkGeminiRateLimit(tenantId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Gemini rate limit exceeded for your workspace. Please retry shortly.',
        retryAfterMs: rate.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      },
    );
  }

  // 3. Parse multipart
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
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).` },
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

  const sourceResult = sourceSchema.safeParse(
    formData.get('source') ?? 'SINGLE',
  );
  if (!sourceResult.success) {
    return NextResponse.json(
      { error: 'Invalid `source` value.' },
      { status: 400 },
    );
  }
  const source = sourceResult.data;

  // 4. Read bytes once — we use them for both storage write and the Gemini
  // call so we don't pay the IO twice.
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  const base64 = Buffer.from(arrayBuf).toString('base64');

  // 5. Create Scan PENDING. We have an ID immediately so polling can start.
  const scan = await prisma.scan.create({
    data: {
      tenantId,
      uploadedById: userId,
      source,
      status: 'PENDING',
      fileName: file.name,
      mimeType: file.type,
    },
  });

  // 6. Persist image bytes via the storage abstraction (Postgres bytea now,
  // R2-ready). Best-effort: if storage write fails the scan still works for
  // extraction, but later re-OCR / image viewing won't have the bytes.
  await imageStorage()
    .put(scan.id, { bytes, mimeType: file.type })
    .catch((err) => {
      console.error(`[scan ${scan.id}] image storage put failed:`, err);
    });

  // 7. Kick off extraction in the background. The route returns BEFORE the
  // job completes — see runExtractJob's caveats about process restarts.
  void runExtractJob({
    scanId: scan.id,
    tenantId,
    base64,
    mimeType: file.type,
    startedAt: Date.now(),
  }).catch((err) => {
    // runExtractJob already catches internally + marks ERROR; this is a
    // belt-and-braces guard against any unhandled rejection escaping.
    console.error(
      `[scan ${scan.id}] runExtractJob threw outside its handler:`,
      err,
    );
  });

  return NextResponse.json(
    {
      scanId: scan.id,
      status: 'PENDING' as const,
    },
    { status: 202 },
  );
}
