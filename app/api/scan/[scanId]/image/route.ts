import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { imageStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scan/[scanId]/image
 *
 * Re-fetch the original uploaded image via lib/storage (Postgres bytea
 * today, R2 later). Tenant-scoped — 404 on any scan outside the caller's
 * tenant.
 *
 * Used by the scan-detail page to render the image alongside the extracted
 * journal entries.
 */
export async function GET(
  _req: Request,
  { params }: { params: { scanId: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Tenant-scoped existence check before pulling the bytes — never serve
  // images across tenant boundaries.
  const owned = await prisma.scan.findFirst({
    where: { id: params.scanId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!owned) {
    return new Response('Not found', { status: 404 });
  }

  const image = await imageStorage().get(params.scanId);
  if (!image) {
    return new Response('Image not stored for this scan', { status: 404 });
  }

  // ArrayBuffer required by the Response constructor; the Uint8Array's
  // underlying buffer may be larger than its view, so slice precisely.
  const ab = image.bytes.buffer.slice(
    image.bytes.byteOffset,
    image.bytes.byteOffset + image.bytes.byteLength,
  );

  return new Response(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': image.mimeType,
      // Allow browser caching since (a) tenant-scoped fetch is already
      // enforced, (b) image bytes for a given scanId never change.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
