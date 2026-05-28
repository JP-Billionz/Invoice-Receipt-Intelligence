// Re-export Auth.js v5 route handlers. All the actual config lives in
// `lib/auth.ts`. See https://authjs.dev/getting-started/installation for the
// canonical v5 pattern.
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
