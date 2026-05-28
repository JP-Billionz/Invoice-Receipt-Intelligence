import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import type { Provider } from 'next-auth/providers';

import { prisma } from '@/lib/db';
import { sendMagicLinkViaSendGrid } from '@/lib/email/sendgrid';

/**
 * Wrap the default PrismaAdapter so that creating a User also creates a
 * Tenant in the SAME transaction. This is the kickoff requirement
 * (CLAUDE-CODE-KICKOFF §4): "custom `createUser` that provisions a Tenant in
 * one transaction".
 *
 * If we instead used the `events.createUser` callback, the User would be
 * committed first and the tenant created in a separate transaction — leaving a
 * window where a User exists without a tenant. Doing both inside one
 * `prisma.$transaction` guarantees atomicity.
 */
function tenantAwarePrismaAdapter(): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,
    createUser: async (user): Promise<AdapterUser> => {
      const fallbackName =
        user.name ?? user.email?.split('@')[0] ?? 'My Workspace';

      const created = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `${fallbackName}'s Workspace`,
          },
        });
        return tx.user.create({
          data: {
            email: user.email!,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            tenantId: tenant.id,
          },
        });
      });

      // Coerce Prisma's User shape into the AdapterUser shape Auth.js expects.
      return {
        id: created.id,
        email: created.email,
        emailVerified: created.emailVerified,
        name: created.name,
        image: created.image,
      };
    },
  };
}

/**
 * Custom email provider using SendGrid's HTTPS API.
 *
 * Replaces the default Nodemailer SMTP provider because Render's free tier
 * blocks outbound SMTP — Nodemailer hangs ~3 min then `Error: Connection
 * timeout`. HTTPS to api.sendgrid.com works fine.
 *
 * See `feedback-render-deploy-lessons` memory file (lesson #7).
 * Sending logic lives in `lib/email/sendgrid.ts` — pure / testable.
 */
const httpEmailProvider: Provider = {
  id: 'http-email',
  name: 'Email',
  type: 'email',
  // `from` is unused at runtime (sendVerificationRequest reads EMAIL_FROM
  // directly from env) but Auth.js asserts the field is set, so mirror it.
  from: process.env.EMAIL_FROM,
  maxAge: 24 * 60 * 60, // 24h, matches old Nodemailer default
  // `server` MUST be present because the EmailConfig type requires it, even
  // though our sendVerificationRequest never reads it. Set to a sentinel so
  // any code path that does try to use it fails loudly rather than silently.
  server: 'http+sendgrid://unused',
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    const host = new URL(url).host;
    await sendMagicLinkViaSendGrid({ to: identifier, url, host });
  },
};

const config: NextAuthConfig = {
  adapter: tenantAwarePrismaAdapter(),
  providers: [httpEmailProvider],
  session: {
    // Required when using an email provider with a database adapter.
    strategy: 'database',
  },
  pages: {
    signIn: '/login',
    verifyRequest: '/verify-request',
  },
  // Also set AUTH_TRUST_HOST=true in render.yaml (AISB deploy lesson #4).
  trustHost: true,
  callbacks: {
    /**
     * Expose tenantId on the session object so server components can do
     * tenant-scoped queries without a second DB round-trip.
     */
    async session({ session, user }) {
      if (session.user && user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { tenantId: true },
        });
        session.user.id = user.id;
        session.user.tenantId = dbUser?.tenantId ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
