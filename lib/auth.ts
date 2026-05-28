import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

import { prisma } from '@/lib/db';

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

const config: NextAuthConfig = {
  adapter: tenantAwarePrismaAdapter(),
  providers: [
    Nodemailer({
      server: {
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          // SendGrid SMTP: literal string "apikey" as the username, API key as
          // the password. Documented at:
          //   https://www.twilio.com/docs/sendgrid/for-developers/sending-email/getting-started-smtp
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY!,
        },
      },
      from: process.env.EMAIL_FROM!,
    }),
  ],
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
