// Augment the default Auth.js session/user types with the multi-tenant fields
// we expose from the `session` callback in `lib/auth.ts`.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      tenantId: string | null;
    };
  }
}
