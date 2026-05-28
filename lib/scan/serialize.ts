import type { JournalEntry, LineItem, Prisma, Scan } from '@prisma/client';

/**
 * Wire-format types returned by `/api/scan` and `/api/scan/[scanId]`.
 * `Decimal` columns become plain numbers — at 4 decimal places of precision,
 * JS doubles are exact for any reasonable receipt total.
 */
export interface ScanResponse {
  id: string;
  status: Scan['status'];
  source: Scan['source'];
  fileName: string;
  mimeType: string;
  vendor: string | null;
  transactionDate: string | null; // ISO date (YYYY-MM-DD)
  documentNumber: string | null;
  documentNumberRaw: string | null;
  vatAmount: number | null;
  vatRate: string | null;
  expenseCategory: string | null;
  subtotal: number | null;
  totalAmount: number | null;
  isInvoice: boolean | null;
  duplicateOfId: string | null;
  errorMessage: string | null;
  processingTimeMs: number | null;
  createdAt: string;
  lineItems: LineItemResponse[];
  journalEntries: JournalEntryResponse[];
}

export interface LineItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  position: number;
}

export interface JournalEntryResponse {
  id: string;
  account: string;
  debit: number;
  credit: number;
  description: string;
  position: number;
}

type ScanWithRelations = Scan & {
  lineItems: LineItem[];
  journalEntries: JournalEntry[];
};

const d = (v: Prisma.Decimal | null): number | null =>
  v === null ? null : Number(v.toString());

export function serializeScan(scan: ScanWithRelations): ScanResponse {
  return {
    id: scan.id,
    status: scan.status,
    source: scan.source,
    fileName: scan.fileName,
    mimeType: scan.mimeType,
    vendor: scan.vendor,
    transactionDate: scan.transactionDate
      ? scan.transactionDate.toISOString().slice(0, 10)
      : null,
    documentNumber: scan.documentNumber,
    documentNumberRaw: scan.documentNumberRaw,
    vatAmount: d(scan.vatAmount),
    vatRate: scan.vatRate,
    expenseCategory: scan.expenseCategory,
    subtotal: d(scan.subtotal),
    totalAmount: d(scan.totalAmount),
    isInvoice: scan.isInvoice,
    duplicateOfId: scan.duplicateOfId,
    errorMessage: scan.errorMessage,
    processingTimeMs: scan.processingTimeMs,
    createdAt: scan.createdAt.toISOString(),
    lineItems: scan.lineItems
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        id: li.id,
        description: li.description,
        quantity: Number(li.quantity.toString()),
        unitPrice: Number(li.unitPrice.toString()),
        total: Number(li.total.toString()),
        position: li.position,
      })),
    journalEntries: scan.journalEntries
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((je) => ({
        id: je.id,
        account: je.account,
        debit: Number(je.debit.toString()),
        credit: Number(je.credit.toString()),
        description: je.description,
        position: je.position,
      })),
  };
}
