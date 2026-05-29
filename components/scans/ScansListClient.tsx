'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

import { formatCurrency } from '@/lib/currency';
import { SpinnerIcon } from '@/components/icons';

interface ScansListClientProps {
  tenantCurrency: string;
}

interface ScanRow {
  id: string;
  status: string;
  source: string;
  vendor: string | null;
  transactionDate: string | null;
  documentNumber: string | null;
  expenseCategory: string | null;
  totalAmount: number | null;
  currency: string | null;
  isInvoice: boolean | null;
  duplicateOfId: string | null;
  createdAt: string;
}

interface PageResponse {
  items: ScanRow[];
  nextCursor: string | null;
}

const fetcher = async (url: string): Promise<PageResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return res.json();
};

/**
 * Records list with vendor / account / date / amount filters and
 * cursor-based pagination. Reads from GET /api/scans.
 */
export const ScansListClient: React.FC<ScansListClientProps> = ({
  tenantCurrency,
}) => {
  const [vendor, setVendor] = useState('');
  const [account, setAccount] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [debounced, setDebounced] = useState({
    vendor: '',
    account: '',
    minAmount: '',
    maxAmount: '',
    from: '',
    to: '',
  });
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ vendor, account, minAmount, maxAmount, from, to });
      setCursor(null);
    }, 300);
    return () => clearTimeout(t);
  }, [vendor, account, minAmount, maxAmount, from, to]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (debounced.vendor) sp.set('vendor', debounced.vendor);
    if (debounced.account) sp.set('account', debounced.account);
    if (debounced.minAmount) sp.set('minAmount', debounced.minAmount);
    if (debounced.maxAmount) sp.set('maxAmount', debounced.maxAmount);
    if (debounced.from) sp.set('from', debounced.from);
    if (debounced.to) sp.set('to', debounced.to);
    sp.set('limit', '25');
    if (cursor) sp.set('cursor', cursor);
    return sp.toString();
  }, [debounced, cursor]);

  const { data, error, isLoading } = useSWR<PageResponse>(
    `/api/scans?${queryString}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">
          Records
        </h1>
        <p className="text-sm text-slate-500">
          Every scan persisted to your workspace. Filter by vendor, account,
          date, or amount.
        </p>
      </header>

      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FilterInput
            label="Vendor"
            value={vendor}
            onChange={setVendor}
            placeholder="contains…"
          />
          <FilterInput
            label="Account"
            value={account}
            onChange={setAccount}
            placeholder="contains…"
          />
          <FilterInput
            label="From"
            value={from}
            onChange={setFrom}
            type="date"
          />
          <FilterInput
            label="To"
            value={to}
            onChange={setTo}
            type="date"
          />
          <FilterInput
            label="Min Amount"
            value={minAmount}
            onChange={setMinAmount}
            type="number"
          />
          <FilterInput
            label="Max Amount"
            value={maxAmount}
            onChange={setMaxAmount}
            type="number"
          />
        </div>
      </div>

      {error && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-sm font-bold text-red-700">
          Failed to load: {error.message}
        </div>
      )}

      {isLoading && !data && (
        <div className="p-12 text-center">
          <SpinnerIcon className="h-10 w-10 text-aisb-purple mx-auto" />
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="p-12 text-center text-slate-500 font-medium">
          No scans match these filters.
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-900 border-b border-slate-200">
                <tr>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Doc #</Th>
                  <Th>Category</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-aisb-purple/5 transition-colors"
                  >
                    <Td>
                      <Link
                        href={`/scan/${row.id}`}
                        className="font-mono text-xs text-aisb-purple hover:underline"
                      >
                        {row.transactionDate ?? '—'}
                      </Link>
                    </Td>
                    <Td className="font-black">{row.vendor ?? '—'}</Td>
                    <Td className="font-mono text-xs text-slate-500">
                      {row.documentNumber ?? '—'}
                    </Td>
                    <Td className="text-xs">{row.expenseCategory ?? '—'}</Td>
                    <Td className="text-xs">
                      {row.isInvoice == null
                        ? '—'
                        : row.isInvoice
                          ? 'Invoice'
                          : 'Receipt'}
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td className="text-right font-mono font-bold">
                      {formatCurrency(
                        row.totalAmount,
                        row.currency ?? tenantCurrency,
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.nextCursor && (
            <div className="p-4 border-t border-slate-100 text-center">
              <button
                onClick={() => setCursor(data.nextCursor)}
                className="text-xs font-black text-aisb-purple-deep uppercase tracking-widest hover:underline"
              >
                Load more →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FilterInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
      {label}
    </span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aisb-purple/30 focus:border-aisb-purple transition"
    />
  </label>
);

const Th: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => (
  <th
    className={`p-4 font-black uppercase tracking-widest text-[10px] text-left ${className}`}
  >
    {children}
  </th>
);

const Td: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className = '',
}) => <td className={`p-4 ${className}`}>{children}</td>;

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cls =
    status === 'DONE'
      ? 'bg-aisb-green/10 text-aisb-green-deep'
      : status === 'DUPLICATE_DETECTED'
        ? 'bg-amber-100 text-amber-700'
        : status === 'ERROR'
          ? 'bg-red-100 text-red-600'
          : 'bg-slate-100 text-slate-500';
  return (
    <span
      className={`inline-block px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${cls}`}
    >
      {status.toLowerCase().replace('_', ' ')}
    </span>
  );
};
