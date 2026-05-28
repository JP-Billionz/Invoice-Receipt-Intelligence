import { prisma } from '@/lib/db';
import type { ImageStorage, StoredImage } from './index';

/**
 * Postgres-backed implementation of ImageStorage.
 *
 * Writes/reads `Scan.fileBlob` (Bytes / bytea). The `key` IS the Scan ID —
 * keeps lookups O(1) on the primary key and avoids a separate index.
 *
 * `Scan.fileBlob` is excluded from default Prisma SELECTs throughout the app
 * (it's large). Only the `get` method here pulls it down explicitly.
 */
export function postgresStorage(): ImageStorage {
  return {
    async put(key: string, image: StoredImage): Promise<void> {
      await prisma.scan.update({
        where: { id: key },
        data: {
          fileBlob: Buffer.from(image.bytes),
          // mimeType is stored on the Scan row itself (`Scan.mimeType`) — we
          // don't redundantly store it here. Callers persist mimeType when
          // creating the Scan row.
        },
      });
    },

    async get(key: string): Promise<StoredImage | null> {
      const row = await prisma.scan.findUnique({
        where: { id: key },
        select: { fileBlob: true, mimeType: true },
      });
      if (!row?.fileBlob) return null;
      return {
        bytes: new Uint8Array(row.fileBlob),
        mimeType: row.mimeType,
      };
    },

    async delete(key: string): Promise<void> {
      await prisma.scan.update({
        where: { id: key },
        data: { fileBlob: null },
      });
    },
  };
}
