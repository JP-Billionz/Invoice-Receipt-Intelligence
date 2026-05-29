import React from 'react';

import { formatCurrency } from '@/lib/currency';
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
} from '@/components/icons';

/**
 * Wire shape returned by `POST /api/scan/[scanId]/comparison`. One row per
 * LineItem; mirrors `lib/gemini/comparison.ts:ComparisonResult` after the
 * route's upsert.
 */
export interface ComparisonRow {
  lineItemId: string;
  lineItemDescription: string;
  comparablePrice: number | null;
  comparableProduct: string | null;
  comparableVendor: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  skipped: boolean;
  /** "utility" | "no-source" | null when not skipped */
  skipReason: string | null;
  searchedAt: string;
}

interface PriceComparisonTableProps {
  /** Per-line-item comparison rows (utility AND no-source skips included). */
  comparisons: ComparisonRow[];
  /** Map of lineItemId → pricePaid so we can render the trend arrow. */
  lineItemTotals: Map<string, number>;
  currency: string;
}

/**
 * Three-state per-row rendering (Plan §2.3, Cowork green-light):
 *   - found              → price + cited source link, trend arrow vs paid
 *   - skipped: utility   → "—", no tooltip (utilities are intentionally out
 *                          of scope per kickoff §6 / SCOPE-MVP §2)
 *   - skipped: no-source → "—" with tooltip "Searched, no local Barbados
 *                          source found"
 *
 * Adapted from prototype `components/PriceComparisonTable.tsx` which only
 * had a single-state UI (a found row OR an empty state for "nothing
 * returned"). The empty-state copy is preserved for the truly-empty case.
 */
export const PriceComparisonTable: React.FC<PriceComparisonTableProps> = ({
  comparisons,
  lineItemTotals,
  currency,
}) => {
  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="text-center text-slate-500 p-8">
        <p>No comparable products were found for the items on this receipt.</p>
        <p className="text-xs mt-1">
          The AI may not have identified significant items or suitable
          Barbados-local alternatives.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-900 border-b border-slate-200">
            <tr>
              <th className="p-5 font-black uppercase tracking-widest text-[10px]">
                Item on Receipt
              </th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">
                Price Paid
              </th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px]">
                Barbados-Local Source
              </th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">
                Local Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparisons.map((row) => (
              <ComparisonRowView
                key={row.lineItemId}
                row={row}
                pricePaid={lineItemTotals.get(row.lineItemId) ?? 0}
                currency={currency}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 text-[10px] text-slate-400 font-medium italic text-center border-t border-slate-100">
        Comparisons sourced exclusively from Barbados retailers (Gemini Google
        Search grounding). Blank rows mean we looked and didn't find a local
        source — never an estimate.
      </p>
    </div>
  );
};

interface ComparisonRowViewProps {
  row: ComparisonRow;
  pricePaid: number;
  currency: string;
}

const ComparisonRowView: React.FC<ComparisonRowViewProps> = ({
  row,
  pricePaid,
  currency,
}) => {
  // -------------------------------------------------------------------------
  // skipped: utility — render dash, no tooltip needed (intentional exclusion)
  // -------------------------------------------------------------------------
  if (row.skipped && row.skipReason === 'utility') {
    return (
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="p-5">
          <p className="font-black text-slate-900">{row.lineItemDescription}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1">
            Utility — comparison not applicable
          </p>
        </td>
        <td className="p-5 text-right font-mono text-slate-900 font-bold">
          {formatCurrency(pricePaid, currency)}
        </td>
        <td className="p-5 text-slate-300 text-sm font-medium">—</td>
        <td className="p-5 text-right text-slate-300 text-sm">—</td>
      </tr>
    );
  }

  // -------------------------------------------------------------------------
  // skipped: no-source — render dash with tooltip (we looked, found nothing)
  // -------------------------------------------------------------------------
  if (row.skipped && row.skipReason === 'no-source') {
    return (
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="p-5">
          <p className="font-black text-slate-900">{row.lineItemDescription}</p>
        </td>
        <td className="p-5 text-right font-mono text-slate-900 font-bold">
          {formatCurrency(pricePaid, currency)}
        </td>
        <td
          className="p-5 text-slate-300 text-sm font-medium cursor-help"
          title="Searched, no local Barbados source found"
        >
          —
        </td>
        <td
          className="p-5 text-right text-slate-300 text-sm cursor-help"
          title="Searched, no local Barbados source found"
        >
          —
        </td>
      </tr>
    );
  }

  // -------------------------------------------------------------------------
  // found — full row with source link + price + trend arrow
  // -------------------------------------------------------------------------
  const comparablePrice = row.comparablePrice ?? 0;
  const difference = comparablePrice - pricePaid;

  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="p-5">
        <p className="font-black text-slate-900">{row.lineItemDescription}</p>
      </td>
      <td className="p-5 text-right font-mono text-slate-900 font-bold">
        {formatCurrency(pricePaid, currency)}
      </td>
      <td className="p-5">
        <p className="font-black text-slate-900 mb-1">
          {row.comparableProduct ?? row.lineItemDescription}
        </p>
        {row.sourceUrl ? (
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-aisb-purple hover:text-aisb-purple-deep font-black text-[10px] uppercase tracking-wider flex items-center"
            title={row.sourceTitle ?? row.sourceUrl}
          >
            Source: {row.comparableVendor ?? row.sourceTitle ?? 'Barbados retailer'}
          </a>
        ) : (
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">
            {row.comparableVendor ?? '—'}
          </span>
        )}
      </td>
      <td className="p-5 text-right font-mono font-black text-lg">
        {difference > 0.001 ? (
          <span className="flex items-center justify-end text-red-600">
            {formatCurrency(comparablePrice, currency)}
            <ArrowTrendingUpIcon className="w-4 h-4 ml-1" />
          </span>
        ) : difference < -0.001 ? (
          <span className="flex items-center justify-end text-aisb-green-deep">
            {formatCurrency(comparablePrice, currency)}
            <ArrowTrendingDownIcon className="w-4 h-4 ml-1" />
          </span>
        ) : (
          <span className="text-slate-700">
            {formatCurrency(comparablePrice, currency)}
          </span>
        )}
      </td>
    </tr>
  );
};
