export const metadata = {
  title: 'Check your email — Receipt Intelligence AI',
};

/**
 * Landing page shown after the user submits the login form. Auth.js v5
 * redirects here automatically because of `pages.verifyRequest` in
 * `lib/auth.ts`.
 */
export default function VerifyRequestPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-10 space-y-6 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-3xl">
          ✉️
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Check your email
        </h1>
        <p className="text-sm font-medium text-slate-500 leading-relaxed">
          We sent a one-time sign-in link. Click it from the same device to
          finish signing in. The link expires in 24&nbsp;hours.
        </p>
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest pt-4 border-t border-slate-100">
          Didn&apos;t arrive? Check spam, or wait a minute and try again.
        </p>
      </div>
    </main>
  );
}
