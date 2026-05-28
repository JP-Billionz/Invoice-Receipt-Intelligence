import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/**
 * Landing route. Server-side auth check, then redirect:
 * - signed in   → /scan (the working surface)
 * - signed out  → /login (magic-link request)
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect('/scan');
  }
  redirect('/login');
}
