
import React from 'react';
import { JournalData } from '../types';
import { ExcelIcon } from './icons/ExcelIcon';

interface JournalEntryTableProps {
  data: JournalData;
  ignoreVat: boolean;
  onDownloadExcel?: () => void;
  isExportDisabled?: boolean;
}

const JournalEntryTable: React.FC<JournalEntryTableProps> = ({ data, ignoreVat, onDownloadExcel, isExportDisabled }) => {
  const processedEntries = React.useMemo(() => {
    if (!ignoreVat) return data.entries;

    // Gross Accounting: Merge tax into expense items to keep entry balanced
    const taxEntries = data.entries.filter(e => {
      const lower = e.account.toLowerCase();
      return lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
    });

    if (taxEntries.length === 0) return data.entries;

    // Tax is usually a debit in expense transactions
    const totalTaxDebit = taxEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalTaxCredit = taxEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
    
    // Find expense entries (usually debits to non-tax accounts)
    const expenseEntries = data.entries.filter(e => {
      const lower = e.account.toLowerCase();
      const isTax = lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
      return !isTax && e.debit > 0;
    });

    if (expenseEntries.length === 0) {
      // Fallback: strictly filter out tax entries
      return data.entries.filter(e => {
        const lower = e.account.toLowerCase();
        return !lower.includes('tax') && !lower.includes('vat') && !lower.includes('gst');
      });
    }

    const totalBaseExpense = expenseEntries.reduce((sum, e) => sum + e.debit, 0);
    
    return data.entries.map(e => {
      const lower = e.account.toLowerCase();
      const isTax = lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
      
      if (isTax) return null;
      
      if (e.debit > 0) {
        const ratio = totalBaseExpense > 0 ? e.debit / totalBaseExpense : 1 / expenseEntries.length;
        // Distribute debit tax to debits
        return {
          ...e,
          debit: Number((e.debit + (totalTaxDebit * ratio)).toFixed(2)),
          description: e.description + " (Includes Tax)"
        };
      }

      if (e.credit > 0 && totalTaxCredit > 0) {
         // This is rare for a simple receipt but handling for completeness
         // If there's a tax credit, we don't distribute it to expense debits usually, 
         // but if the whole entry needs to balance and we removed a credit, we'd need to reduce expense debits
         // However, standard receipts have Tax as Debit and Cash as Credit.
         // If we have Tax as Credit, it means it's likely a complex entry.
      }
      
      return e;
    }).filter(p => p !== null) as any[];
  }, [data.entries, ignoreVat]);

  const totalDebits = processedEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredits = processedEntries.reduce((sum, entry) => sum + (entry.credit || 0), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="w-full flex flex-col space-y-8">
      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Vendor</p>
          <p className="text-xl font-black text-slate-900">{data.vendor}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Date</p>
          <p className="text-xl font-black text-slate-900">{data.transactionDate}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Document #</p>
          <p className="text-xl font-black text-slate-900">{data.documentNumber}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Category</p>
          <span className="inline-flex items-center px-4 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-700 uppercase tracking-wider">
            {data.expenseCategory}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Document Type</p>
          <span className={`inline-flex items-center px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider ${data.isInvoice ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {data.isInvoice ? 'Invoice (Unpaid)' : 'Receipt (Paid)'}
          </span>
        </div>
        
        {!ignoreVat && (
          <>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Subtotal</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(data.subtotal)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">VAT Rate</p>
              <p className="text-xl font-bold text-slate-800">{data.vatRate}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">VAT Amount</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(data.vatAmount)}</p>
            </div>
          </>
        )}
        
        <div className="space-y-1 md:col-span-2 lg:col-span-1 border-t md:border-t-0 md:pt-0 pt-4 mt-4 md:mt-0">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Total Amount</p>
          <p className="text-3xl font-black text-indigo-600">
            {formatCurrency(ignoreVat ? data.totalAmount : data.totalAmount)}
          </p>
        </div>
      </div>

      {/* Journal Entry Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm bg-white">
        <div className="p-6 bg-slate-900 border-b border-slate-800">
            <h4 className="font-black text-white uppercase tracking-widest text-xs flex items-center">
              <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2 animate-pulse" />
              Accounting Journal Entry
            </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-900 border-b border-slate-200">
              <tr>
                <th className="p-5 font-black uppercase tracking-widest text-[10px]">Account</th>
                <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">Debit</th>
                <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {processedEntries.map((entry, index) => (
                <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-5">
                    <p className="font-black text-slate-900 mb-1">{entry.account}</p>
                    <p className="text-slate-500 text-xs font-medium">{entry.description}</p>
                  </td>
                  <td className="p-5 text-right font-mono text-slate-900 font-bold">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : ''}
                  </td>
                  <td className="p-5 text-right font-mono text-slate-900 font-bold">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 font-black text-white border-t border-slate-800">
               <tr>
                  <td className="p-6 text-right uppercase tracking-[0.2em] text-[10px] opacity-70">Calculated Totals</td>
                  <td className="p-6 text-right font-mono text-lg">{formatCurrency(totalDebits)}</td>
                  <td className="p-6 text-right font-mono text-lg">{formatCurrency(totalCredits)}</td>
               </tr>
            </tfoot>
          </table>
        </div>
         {Math.abs(totalDebits - totalCredits) > 0.01 && (
          <div className="p-3 text-center bg-amber-50 text-amber-800 text-xs font-bold border-t border-amber-200">
            ⚠️ Note: Entries might not balance due to complex transaction structure.
          </div>
        )}
      </div>
      
      {onDownloadExcel && (
        <button
          onClick={onDownloadExcel}
          disabled={isExportDisabled}
          className={`w-full font-black py-6 px-8 rounded-3xl transition-all flex items-center justify-center text-xl shadow-2xl active:scale-[0.99] group mt-8 ${
            isExportDisabled 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border-2 border-dashed border-slate-300' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
          }`}
        >
          {isExportDisabled ? (
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mr-4 animate-pulse">!</div>
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

export default JournalEntryTable;
