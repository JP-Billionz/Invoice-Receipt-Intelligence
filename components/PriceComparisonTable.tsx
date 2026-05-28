import React from 'react';
import { PriceComparisonData } from '../types';
import { ArrowTrendingUpIcon } from './icons/ArrowTrendingUpIcon';
import { ArrowTrendingDownIcon } from './icons/ArrowTrendingDownIcon';

interface PriceComparisonTableProps {
  data: PriceComparisonData;
}

const PriceComparisonTable: React.FC<PriceComparisonTableProps> = ({ data }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (!data || data.length === 0) {
    return (
      <div className="text-center text-slate-500 p-8">
        <p>No comparable products were found for the items on this receipt.</p>
        <p className="text-xs mt-1">The AI may not have identified significant items or suitable online alternatives.</p>
      </div>
    );
  }

  const renderPriceIndicator = (paid: number, comparable: number) => {
    const difference = comparable - paid;

    // More expensive online
    if (difference > 0.001) {
      return (
        <span className="flex items-center justify-end text-red-600">
          {formatCurrency(comparable)}
          <ArrowTrendingUpIcon className="w-4 h-4 ml-1" />
        </span>
      );
    }
    // Cheaper online
    if (difference < -0.001) {
      return (
        <span className="flex items-center justify-end text-green-600">
          {formatCurrency(comparable)}
          <ArrowTrendingDownIcon className="w-4 h-4 ml-1" />
        </span>
      );
    }
    // Same price
    return (
      <span className="text-slate-700">
        {formatCurrency(comparable)}
      </span>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-900 border-b border-slate-200">
            <tr>
              <th className="p-5 font-black uppercase tracking-widest text-[10px]">Item on Receipt</th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">Price Paid</th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px]">Comparable (Online)</th>
              <th className="p-5 font-black uppercase tracking-widest text-[10px] text-right">Online Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item, index) => (
              <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-5">
                  <p className="font-black text-slate-900">{item.itemName}</p>
                </td>
                <td className="p-5 text-right font-mono text-slate-900 font-bold">
                  {formatCurrency(item.pricePaid)}
                </td>
                <td className="p-5">
                  <p className="font-black text-slate-900 mb-1">{item.comparableProduct}</p>
                  <a 
                    href={item.source} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-wider flex items-center"
                    title={item.sourceTitle}
                  >
                    Source: {item.vendor}
                  </a>
                </td>
                <td className="p-5 text-right font-mono font-black text-lg">
                  {renderPriceIndicator(item.pricePaid, item.comparablePrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PriceComparisonTable;
