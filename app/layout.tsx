import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'Receipt Intelligence AI',
  description:
    'Scan receipts and invoices into balanced IFRS/GAAP journal entries with Barbados-local price comparisons.',
  applicationName: 'Receipt Intelligence AI',
  // PWA + iOS install hints. The web manifest itself lives at
  // `app/manifest.ts` and is auto-injected by Next 14's metadata system.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Receipts AI',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // AISB brand green — see memory `reference-aisb-brand`. Used by browser
  // chrome / task switcher / Android Chrome's address bar. Full PWA manifest
  // (with background_color #0A0716) ships in the PWA PR.
  themeColor: '#9BD850',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
