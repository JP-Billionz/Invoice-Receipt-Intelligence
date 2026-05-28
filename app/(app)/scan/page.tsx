export const metadata = {
  title: 'Scan — Receipt Intelligence AI',
};

/**
 * Scanner page placeholder. The real UI lands in PR #2 (Plan §2.6 step 2:
 * "Port the scanner") — ports the prototype's two-column layout, drag-and-drop
 * upload, camera capture, and queue list into Next.js client components, with
 * all Gemini calls moved behind /api/scan.
 */
export default function ScanPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 p-12 text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-4xl">
          📄
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Scanner coming soon
        </h1>
        <p className="text-sm font-medium text-slate-500 leading-relaxed">
          App shell is live. The scanner UI, Gemini extraction, journal entries,
          line items, Barbados-local price comparisons, and Excel export land in
          subsequent PRs &mdash; see{' '}
          <a
            href="https://github.com/JP-Billionz/Invoice-Receipt-Intelligence/pull/1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline font-bold"
          >
            PR #1 (Productionization Plan)
          </a>
          .
        </p>
      </div>
    </div>
  );
}
