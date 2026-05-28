/**
 * Image-blob storage abstraction.
 *
 * Per Plan §5.1 (Cowork resolution of §4.7). MVP impl writes to Postgres
 * `Scan.fileBlob` (bytea) — works on Render free tier which has no persistent
 * disk. Cloudflare R2 adapter ships later; the swap is a one-line change in
 * this file, no app-code changes.
 *
 * Keys are opaque strings (the API uses `Scan.id`). The interface intentionally
 * does NOT leak the underlying storage shape — callers just `put` and `get`.
 */

export interface StoredImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageStorage {
  put(key: string, image: StoredImage): Promise<void>;
  get(key: string): Promise<StoredImage | null>;
  delete(key: string): Promise<void>;
}

import { postgresStorage } from './postgres';

let _instance: ImageStorage | undefined;

export function imageStorage(): ImageStorage {
  if (_instance) return _instance;

  // Single env-driven switch — when r2.ts ships, this is the only branch
  // to add: `if (process.env.IMAGE_STORAGE === 'r2') _instance = r2Storage();`
  _instance = postgresStorage();
  return _instance;
}

/** Test-only — reset the singleton between test runs. */
export function __resetImageStorageForTests(): void {
  _instance = undefined;
}
