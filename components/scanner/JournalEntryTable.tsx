import React from 'react';

import { applyIgnoreVat, balanceDelta } from '@/lib/accounting/balance';
import { formatCurrency } from '@/lib/currency';
import type { JournalEntryResponse, ScanResponse } from '@/lib/scan/serialize';
import { ExcelIcon } from '@/components/icons';

interface JournalEntryTableProps {
  data: ScanResponse;
  /** Tenant currency fallback when scan.currency is null (Plan §4.6). */
  tenantCurrency: string;
  ignoreVat: boolean;
  /**
   * EXPLICIT user action. Pass null to hide the Download button entirely.
   *
   * REGRESSION-PROOFED: this is a callback, not a URL. A previous
   * implementation rendered `<a href={excelHref}>` which — combined with
   * the orchestrator's polling-driven re-renders — caused a runaway
   * export firing on every poll tick (hotfix on 2026-05-29). The button
   * here can ONLY fire via a user click; there is no codepath that
   * invokes the export from a useEffect.
   */
  onDownloadExcel?: (() => void) | null;
  isExportDisabled?: boolean;
}

/**
 * Display-only render of a scan's journal entry + summary. Balance logic
 * stays in `lib/accounting/balance.ts` — this component just renders what
 * `applyIgnoreVat()` returns.
 *
 * Ported from prototype `components/JournalEntryTable.tsx` with the duplicate
 * VAT-redistribution algorithm removed (it's already in lib/accounting).
 * Restyled to AISB brand: aisb-green for primary, aisb-purple for accent.
 */
export const JournalEntryTable: React.FC<JournalEntryTableProps> = ({
  data,
  tenantCurrency,
  ignoreVat,
  onDownloadExcel,
  isExportDisabled,
}) => {
  const currency = data.currency ?? tenantCurrency;

  const processedEntries: JournalEntryResponse[] = applyIgnoreVat(
    data.journalEntries.map((e) => ({
      account: e.account,
      debit: e.debit,
      credit: e.credit,
      description: e.description,
    })),
    ignoreVat,
  ).map((e, idx) => ({
    id: `${data.id}-${idx}`,
    account: e.account,
    debit: e.debit,
    credit: e.credit,
    description: e.description,
    position: idx,
  }));

  const totalDebits = processedEntries.reduce(
    (sum, e) => sum + (e.debit || 0),
    0,
  );
  const totalCredits = processedEntries.reduce(
    (sum, e) => sum + (e.credit || 0),
    0,
  );

  return (
    <div className="w-full flex flex-col space-y-8">
      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
        <SummaryCell label="Vendor" value={data.vendor ?? '—'} />
        <SummaryCell label="Date" value={data.transactionDate ?? '—'} />
        <SummaryCell label="Document #" value={data.documentNumber ?? '—'} />
        <SummaryCell
          label="Category"
          chip={
            <span className="inline-flex items-center px-4 py-1 rounded-full text-xs font-black bg-aisb-purple/10 text-aisb-purple-deep uppercase tracking-wider">
              {data.expenseCategory ?? 'Other'}
            </span>
          }
        />
        <SummaryCell
          label="Document Type"
          accentLabel
          chip={
            <span
              className={`inline-flex items-center px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                data.isInvoice
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-aisb-green/10 text-aisb-green-deep'
              }`}
            >
              {data.isInvoice ? 'Invoice (Unpaid)' : 'Receipt (Paid)'}
            </span>
          }
        />

        {!ignoreVat && (
          <>
            <SummaryCell
              label="Subtotal"
              value={formatCurrency(data.subtotal, currency)}
              numeric
            />
            <SummaryCell label="VAT Rate" value={data.vatRate ?? '—'} numeric />
            <SummaryCell
              label="VAT Amount"
              value={formatCurrency(data.vatAmount, currency)}
              numeric
            />
          </>
        )}

        <div className="space-y-1 md:col-span-2 lg:col-span-1 border-t md:border-t-0 md:pt-0 pt-4 mt-4 md:mt-0">
          <p className="text-[10px] font-black text-aisb-purple-deep uppercase tracking-[0.2em] mb-1">
            Total Amount
          </p>
          <p className="text-3xl font-black text-aisb-purple-deep">
            {formatCurrency(data.totalAmount, currency)}
          </p>
        </div>
      </div>

      {/* Journal Entry Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm bg-white">
        <div className="p-6 bg-slate-900 border-b border-slate-800">
          <h4 className="font-black text-white uppercase tracking-widest text-xs flex items-center">
            <span className="w-2 h-2 bg-aisb-green rounded-full mr-2 animate-pulse" />
            Accounting Journal Entry
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-900 border-b border-slate-200">
              <tr>
                <th className="p-5 font-black uppercase tracking-widest text-[10px]">
                  Account
                </th>
                <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">
                  Debit
                </th>
                <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {processedEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-5">
                    <p className="font-black text-slate-900 mb-1">{entry.account}</p>
                    <p className="text-slate-500 text-xs font-medium">
                      {entry.description}
                    </p>
                  </td>
                  <td className="p-5 text-right font-mono text-slate-900 font-bold">
                    {entry.debit > 0 ? formatCurrency(entry.debit, currency) : ''}
                  </td>
                  <td className="p-5 text-right font-mono text-slate-900 font-bold">
                    {entry.credit > 0 ? formatCurrency(entry.credit, currency) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 font-black text-white border-t border-slate-800">
              <tr>
                <td className="p-6 text-right uppercase tracking-[0.2em] text-[10px] opacity-70">
                  Calculated Totals
                </td>
                <td className="p-6 text-right font-mono text-lg">
                  {formatCurrency(totalDebits, currency)}
                </td>
                <td className="p-6 text-right font-mono text-lg">
                  {formatCurrency(totalCredits, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {Math.abs(balanceDelta(processedEntries)) > 0.01 && (
          <div className="p-3 text-center bg-amber-50 text-amber-800 text-xs font-bold border-t border-amber-200">
            ⚠️ Note: Entries might not balance due to complex transaction structure.
          </div>
        )}
      </div>

      {onDownloadExcel && (
        <button
          type="button"
          onClick={onDownloadExcel}
          disabled={isExportDisabled}
          className={`w-full font-black py-6 px-8 rounded-3xl transition-all flex items-center justify-center text-xl shadow-2xl active:scale-[0.99] group mt-8 ${
            isExportDisabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border-2 border-dashed border-slate-300'
              : 'bg-aisb-green text-aisb-bg hover:bg-aisb-green-deep shadow-aisb-green/20'
          }`}
        >
          {isExportDisabled ? (
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mr-4 animate-pulse">
                !
              </div>
              <span>Resolve Duplicates to Export</span>
            </div>
          ) : (
            <>
              <ExcelIcon className="w-8 h-8 mr-4 group-hover:rotate-12 transition-transform duration-300" />
              <span>Download Professional Analysis (Excel + CSV)</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

interface SummaryCellProps {
  label: string;
  value?: string;
  numeric?: boolean;
  chip?: React.ReactNode;
  accentLabel?: boolean;
}

const SummaryCell: React.FC<SummaryCellProps> = ({
  label,
  value,
  numeric,
  chip,
  accentLabel,
}) => (
  <div className="space-y-1">
    <p
      className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${
        accentLabel ? 'text-aisb-purple-deep' : 'text-slate-500'
      }`}
    >
      {label}
    </p>
    {chip ?? (
      <p
        className={
          numeric
            ? 'text-xl font-bold text-slate-800'
            : 'text-xl font-black text-slate-900'
        }
      >
        {value}
      </p>
    )}
  </div>
);
