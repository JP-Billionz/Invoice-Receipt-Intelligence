import React from 'react';
import { LineItem } from '../types';

interface LineItemTableProps {
  items: LineItem[];
}

const LineItemTable: React.FC<LineItemTableProps> = ({ items }) => {
  if (!items || items.length === 0) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="mt-8">
      <div className="flex items-center space-x-3 mb-4">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Detailed Line Item Breakdown</h3>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      
      <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Item Description</th>
                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Qty</th>
                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Unit Price</th>
                <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <p className="font-black text-slate-900 text-sm">{item.description}</p>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black">
                      {item.quantity}
                    </span>
                  </td>
                  <td className="p-4 text-right font-mono text-xs text-slate-600">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="p-4 text-right font-black text-slate-900 text-sm">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-[10px] text-slate-400 font-medium italic text-center">
        * Unit prices and quantities extracted directly from document scans for unit-level cost analysis.
      </p>
    </div>
  );
};

export default LineItemTable;
