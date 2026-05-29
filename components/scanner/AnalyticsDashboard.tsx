'use client';

import React from 'react';
import useSWR from 'swr';

import { formatCurrency } from '@/lib/currency';
import { SpinnerIcon } from '@/components/icons';

interface AnalyticsResponse {
  totalInvoices: number;
  totalSpend: number;
  totalVat: number;
  avgProcessingTimeMs: number;
  topVendors: { vendor: string; spend: number }[];
  categories: { category: string; spend: number }[];
  volumeLast7Days: { date: string; count: number }[];
  docTypeCounts: { invoice: number; receipt: number; unknown: number };
}

interface AnalyticsDashboardProps {
  /** Tenant currency for spend formatting. */
  tenantCurrency: string;
}

const fetcher = async (url: string): Promise<AnalyticsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`);
  return res.json();
};

/**
 * Per-tenant analytics dashboard. Reads from GET /api/analytics (server-side
 * aggregates, replaces the prototype's localStorage). SWR caches with a
 * 30s revalidation so the dashboard stays warm without spamming the DB.
 *
 * Visual structure mirrors the prototype's `components/AnalyticsDashboard.tsx`
 * — cards on top, vendor list + 7-day bar chart middle, category breakdown
 * below. Restyled to AISB tokens.
 */
export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  tenantCurrency,
}) => {
  const { data, error, isLoading } = useSWR<AnalyticsResponse>(
    '/api/analytics',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-100 rounded-2xl text-center text-red-700 text-sm font-bold">
        Failed to load analytics. {error.message}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="p-20 text-center">
        <SpinnerIcon className="h-12 w-12 text-aisb-purple mx-auto" />
        <p className="text-slate-500 font-bold mt-4">Loading analytics…</p>
      </div>
    );
  }

  if (data.totalInvoices === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-400 text-3xl">
          📊
        </div>
        <h3 className="text-xl font-black text-slate-900">No Analytics Yet</h3>
        <p className="text-slate-500 mt-2 font-medium">
          Scan some receipts to see spending patterns appear here.
        </p>
      </div>
    );
  }

  const maxVolume = Math.max(...data.volumeLast7Days.map((v) => v.count), 1);
  const maxCategorySpend = Math.max(
    ...data.categories.map((c) => c.spend),
    1,
  );

  return (
    <div className="space-y-10">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Receipts" value={String(data.totalInvoices)} />
        <StatCard
          label="Total Spend"
          value={formatCurrency(data.totalSpend, tenantCurrency)}
          accent="purple"
        />
        <StatCard
          label="Total VAT"
          value={formatCurrency(data.totalVat, tenantCurrency)}
          accent="green"
        />
        <StatCard
          label="Avg Process Time"
          value={`${data.avgProcessingTimeMs}ms`}
        />
      </div>

      {/* Doc Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">
              Unpaid Invoices
            </p>
            <p className="text-2xl font-black text-amber-900">
              {data.docTypeCounts.invoice}
            </p>
          </div>
        </div>
        <div className="bg-aisb-green/10 p-6 rounded-3xl border border-aisb-green/30 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black text-aisb-green-deep uppercase tracking-widest mb-1">
              Paid Receipts
            </p>
            <p className="text-2xl font-black text-aisb-green-deep">
              {data.docTypeCounts.receipt}
            </p>
          </div>
        </div>
        <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 flex justify-between items-center opacity-60">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              Undetermined
            </p>
            <p className="text-2xl font-black text-slate-700">
              {data.docTypeCounts.unknown}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Vendors */}
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
            Top 5 Vendors by Spend
          </h4>
          <div className="space-y-4">
            {data.topVendors.map((v, idx) => (
              <div
                key={v.vendor}
                className="flex items-center justify-between group"
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 mr-3 shadow-sm group-hover:border-aisb-purple/30 transition-colors">
                    {idx + 1}
                  </div>
                  <span className="font-black text-slate-900 group-hover:text-aisb-purple-deep transition-colors">
                    {v.vendor}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-500">
                  {formatCurrency(v.spend, tenantCurrency)}
                </span>
              </div>
            ))}
            {data.topVendors.length === 0 && (
              <p className="text-sm text-slate-400 font-medium italic">
                No vendor data yet.
              </p>
            )}
          </div>
        </div>

        {/* Scan Volume */}
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
            Scan Volume (Last 7 Days)
          </h4>
          <div className="flex items-end justify-between h-40 pt-4 px-2">
            {data.volumeLast7Days.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1 group">
                <div className="relative w-full px-1 flex flex-col justify-end h-full">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-black p-1 px-2 rounded-md pointer-events-none whitespace-nowrap">
                    {day.count} scans
                  </div>
                  <div
                    className="w-full bg-aisb-purple/20 group-hover:bg-aisb-purple/40 rounded-t-lg transition-all duration-500 overflow-hidden relative"
                    style={{ height: `${(day.count / maxVolume) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-aisb-purple-deep to-aisb-purple opacity-80" />
                  </div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-tighter truncate w-full text-center">
                  {new Date(day.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spend by Category */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">
          Spend Breakdown by Category
        </h4>
        <div className="space-y-6">
          {data.categories.map((c) => {
            const width = (c.spend / maxCategorySpend) * 100;
            return (
              <div key={c.category} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-black text-slate-900">
                    {c.category}
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-500">
                    {formatCurrency(c.spend, tenantCurrency)}
                  </span>
                </div>
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-aisb-purple rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
          {data.categories.length === 0 && (
            <p className="text-sm text-slate-400 font-medium italic">
              No category data yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  accent?: 'green' | 'purple';
}> = ({ label, value, accent }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
      {label}
    </p>
    <p
      className={`text-3xl font-black tracking-tight ${
        accent === 'green'
          ? 'text-aisb-green-deep'
          : accent === 'purple'
            ? 'text-aisb-purple-deep'
            : 'text-slate-900'
      }`}
    >
      {value}
    </p>
  </div>
);
