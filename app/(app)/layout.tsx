import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth, signOut } from '@/lib/auth';

/**
 * Authenticated shell. Every page under `app/(app)/` is guarded by the
 * session check below — unauthenticated requests are redirected to /login
 * before the route renders.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/scan"
            className="text-lg font-black tracking-tight text-slate-900 hover:text-indigo-600 transition"
          >
            Receipt Intelligence AI
          </Link>
          <div className="flex items-center space-x-4">
            <span className="text-xs font-bold text-slate-500 hidden sm:inline">
              {session.user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-[10px] font-black text-slate-500 hover:text-red-500 uppercase tracking-widest transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
