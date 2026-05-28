
export interface JournalEntryLine {
  account: string;
  debit: number;
  credit: number;
  description: string;
}

export type ScanStatus = 'pending' | 'scanning' | 'done' | 'error' | 'duplicate_detected' | 'excluded';

export interface QueueItem {
  id: string;
  file: File;
  status: ScanStatus;
  result?: JournalData;
  error?: string;
  source: 'bulk' | 'folder-watcher';
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface JournalData {
  vendor: string;
  transactionDate: string;
  documentNumber: string;
  vatAmount: number;
  vatRate: string;
  expenseCategory: string;
  subtotal: number;
  totalAmount: number;
  isInvoice: boolean;
  entries: JournalEntryLine[];
  lineItems?: LineItem[];
}

export interface PriceComparisonItem {
  itemName: string;
  pricePaid: number;
  comparableProduct: string;
  comparablePrice: number;
  vendor: string;
  source: string;
  sourceTitle: string;
}

export type PriceComparisonData = PriceComparisonItem[];
