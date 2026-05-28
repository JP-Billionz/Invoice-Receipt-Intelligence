import { redirect } from 'next/navigation';

import { auth, signIn } from '@/lib/auth';

export const metadata = {
  title: 'Sign in — Receipt Intelligence AI',
};

/**
 * Magic-link request page.
 *
 * The form posts to a server action that calls Auth.js v5's `signIn` with the
 * nodemailer provider. NextAuth sends the email via SendGrid SMTP (configured
 * in lib/auth.ts) and redirects to /verify-request.
 */
export default async function LoginPage() {
  // Already signed in? Skip the form.
  const session = await auth();
  if (session?.user) {
    redirect('/scan');
  }

  async function sendMagicLink(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!email) return;
    await signIn('nodemailer', {
      email,
      redirectTo: '/scan',
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-10 space-y-8">
        <header className="text-center space-y-3">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Receipt Intelligence AI
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Sign in with a one-time link sent to your email.
          </p>
        </header>

        <form action={sendMagicLink} className="space-y-5">
          <label className="block">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Email address
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@aisolutionsbb.com"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition"
            />
          </label>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition"
          >
            Email me a sign-in link
          </button>
        </form>

        <p className="text-[10px] text-center text-slate-400 font-medium uppercase tracking-widest">
          No password. No account form. Just click the link.
        </p>
      </div>
    </main>
  );
}
