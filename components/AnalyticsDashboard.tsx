
import React, { useMemo, useState, useEffect } from 'react';
import { getAnalyticsData, clearAnalyticsData, AnalyticsEvent } from '../lib/analytics';

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsEvent[]>([]);

  useEffect(() => {
    const updateData = () => {
      setData(getAnalyticsData());
    };

    updateData();
    window.addEventListener('analyticsUpdated', updateData);
    return () => window.removeEventListener('analyticsUpdated', updateData);
  }, []);

  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const totalInvoices = data.length;
    const totalSpend = data.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    const totalVat = data.reduce((sum, item) => sum + (item.vatAmount || 0), 0);
    const avgProcessingTime = data.reduce((sum, item) => sum + item.processingTimeMs, 0) / data.length;

    // Top 5 Vendors
    const vendorMap = new Map<string, number>();
    data.forEach(item => {
      if (item.vendor && item.vendor !== 'Unknown') {
        vendorMap.set(item.vendor, (vendorMap.get(item.vendor) || 0) + item.totalAmount);
      }
    });
    const topVendors = Array.from(vendorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Spend by Category
    const categoryMap = new Map<string, number>();
    data.forEach(item => {
      if (item.expenseCategory) {
        categoryMap.set(item.expenseCategory, (categoryMap.get(item.expenseCategory) || 0) + item.totalAmount);
      }
    });
    const categories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);

    // Volume over last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const volumeMap = new Map<string, number>();
    last7Days.forEach(date => volumeMap.set(date, 0));
    data.forEach(item => {
      const date = item.timestamp.split('T')[0];
      if (volumeMap.has(date)) {
        volumeMap.set(date, (volumeMap.get(date) || 0) + 1);
      }
    });
    const volumeData = last7Days.map(date => ({ date, count: volumeMap.get(date) || 0 }));

    // Doc Type breakdown
    const docTypeMap = new Map<string, number>();
    data.forEach(item => {
      const type = item.docType || 'unknown';
      docTypeMap.set(type, (docTypeMap.get(type) || 0) + 1);
    });

    return {
      totalInvoices,
      totalSpend,
      totalVat,
      avgProcessingTime: Math.round(avgProcessingTime),
      topVendors,
      categories,
      volumeData,
      docTypeMap
    };
  }, [data]);

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
      clearAnalyticsData();
    }
  };

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-slate-900">No Analytics Data Yet</h3>
        <p className="text-slate-500 mt-2 font-medium">Scan some invoices to see insights about your spending patterns.</p>
      </div>
    );
  }

  const maxVolume = Math.max(...stats.volumeData.map(v => v.count), 1);
  const maxCategorySpend = Math.max(...stats.categories.map(c => c[1]), 1);

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Invoices</p>
          <p className="text-3xl font-black text-slate-900 tracking-tight">{stats.totalInvoices}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Spend</p>
          <p className="text-3xl font-black text-indigo-600 tracking-tight">${stats.totalSpend.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total VAT</p>
          <p className="text-3xl font-black text-emerald-600 tracking-tight">${stats.totalVat.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg Process Time</p>
          <p className="text-3xl font-black text-slate-900 tracking-tight">{stats.avgProcessingTime}ms</p>
        </div>
      </div>

      {/* Doc Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Unpaid Invoices</p>
              <p className="text-2xl font-black text-amber-900">{stats.docTypeMap.get('invoice') || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-amber-700">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
          </div>
          <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Paid Receipts</p>
              <p className="text-2xl font-black text-emerald-900">{stats.docTypeMap.get('receipt') || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 flex justify-between items-center opacity-60">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Undetermined</p>
              <p className="text-2xl font-black text-slate-700">{stats.docTypeMap.get('unknown') || 0}</p>
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Vendors */}
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Top 5 Vendors by Spend</h4>
          <div className="space-y-4">
            {stats.topVendors.map(([vendor, spend], idx) => (
              <div key={idx} className="flex items-center justify-between group">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 mr-3 shadow-sm group-hover:border-indigo-200 transition-colors">
                    {idx + 1}
                  </div>
                  <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{vendor}</span>
                </div>
                <span className="font-mono font-bold text-slate-500">${spend.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scan Volume */}
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Scan Volume (Last 7 Days)</h4>
          <div className="flex items-end justify-between h-40 pt-4 px-2">
            {stats.volumeData.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1 group">
                <div className="relative w-full px-1 flex flex-col justify-end h-full">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-black p-1 px-2 rounded-md pointer-events-none whitespace-nowrap">
                    {day.count} scans
                  </div>
                  <div 
                    className="w-full bg-indigo-500/20 group-hover:bg-indigo-500/40 rounded-t-lg transition-all duration-500 overflow-hidden relative"
                    style={{ height: `${(day.count / maxVolume) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 to-indigo-400 opacity-80" />
                  </div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-tighter truncate w-full text-center">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spend by Category */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">Spend breakdown by Category</h4>
        <div className="space-y-6">
          {stats.categories.map(([category, spend], idx) => {
            const width = (spend / maxCategorySpend) * 100;
            return (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-black text-slate-900">{category}</span>
                  <span className="text-sm font-mono font-bold text-slate-500">${spend.toFixed(2)}</span>
                </div>
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <button 
          onClick={handleClear}
          className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors py-2 px-6 border border-slate-200 rounded-full hover:border-red-100"
        >
          Clear Analytics Data
        </button>
      </div>
    </div>
  );
}
