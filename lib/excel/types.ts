/**
 * Shared input types for the Excel builders. Mirror the wire shape from
 * `serializeScan()` so the builders can be called with the JSON the API
 * returns — no Prisma types leak into lib/excel/.
 */

export interface ExcelScan {
  id: string;
  vendor: string | null;
  transactionDate: string | null; // YYYY-MM-DD
  documentNumber: string | null;
  vatAmount: number | null;
  vatRate: string | null;
  expenseCategory: string | null;
  subtotal: number | null;
  totalAmount: number | null;
  isInvoice: boolean | null;
  currency: string | null;
  journalEntries: {
    account: string;
    debit: number;
    credit: number;
    description: string;
  }[];
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}
