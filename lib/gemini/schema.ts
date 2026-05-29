import { Type } from '@google/genai';

/**
 * Gemini structured-output schema for receipt/invoice extraction.
 *
 * Ported from the prototype's `services/geminiService.ts:responseSchema`. The
 * prototype's accuracy on AISB receipts has been proven; do NOT modify the
 * field set or descriptions without a parallel update to the system prompt
 * in `lib/gemini/prompts.ts` and a regression-test cycle on real samples.
 *
 * Changes vs prototype:
 *   1. `lineItems` is REQUIRED (matches the schema; prototype had it optional
 *      in `types.ts:38` — Plan §1.6 issue #9).
 *   2. NEW: `currency` (Plan §4.6) — ISO 4217 code visible on the document
 *      (e.g. "BBD", "USD"). Optional; null = fall back to Tenant.currency.
 */
export const extractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    vendor: {
      type: Type.STRING,
      description:
        'The name of the vendor, store, or service provider from the receipt.',
    },
    transactionDate: {
      type: Type.STRING,
      description:
        'The primary date of the transaction in YYYY-MM-DD format. Infer the year if missing.',
    },
    documentNumber: {
      type: Type.STRING,
      description:
        'The unique reference number on the document (e.g., Invoice #, Receipt ID, Transaction ID). Use "N/A" if none found.',
    },
    vatAmount: {
      type: Type.NUMBER,
      description:
        'The total VAT (Value Added Tax) or sales tax amount extracted from the invoice.',
    },
    vatRate: {
      type: Type.STRING,
      description:
        'The VAT rate shown on the invoice (e.g., "20%", "15%"). Use "Unknown" if not present.',
    },
    expenseCategory: {
      type: Type.STRING,
      description:
        'AI-classified category: "Office Supplies", "Travel", "Utilities", "Marketing", "Professional Services", "Equipment", "Food & Beverage", or "Other".',
    },
    subtotal: {
      type: Type.NUMBER,
      description: 'The amount before VAT/tax.',
    },
    totalAmount: {
      type: Type.NUMBER,
      description: 'The total amount including VAT/tax.',
    },
    isInvoice: {
      type: Type.BOOLEAN,
      description:
        'True if the document is an Invoice (billing for future payment), False if it is a Receipt (proof of past payment).',
    },
    currency: {
      type: Type.STRING,
      description:
        'ISO 4217 currency code visible on the document (e.g. "BBD", "USD", "EUR", "GBP"). Use the empty string "" if no currency symbol or code is visible — DO NOT GUESS.',
    },
    entries: {
      type: Type.ARRAY,
      description: 'The list of debit and credit entries for the journal.',
      items: {
        type: Type.OBJECT,
        required: ['account', 'debit', 'credit', 'description'],
        properties: {
          account: {
            type: Type.STRING,
            description:
              'The specific accounting account name (e.g., "Office Supplies Expense", "Meals & Entertainment", "Bank", "Credit Card Payable"). Use standard account names.',
          },
          debit: {
            type: Type.NUMBER,
            description:
              'The debit amount for this line. Must be 0 if it is a credit entry. Should not be negative.',
          },
          credit: {
            type: Type.NUMBER,
            description:
              'The credit amount for this line. Must be 0 if it is a debit entry. Should not be negative.',
          },
          description: {
            type: Type.STRING,
            description:
              'A brief, clear description for the entry line, usually derived from the receipt items or vendor name.',
          },
        },
      },
    },
    lineItems: {
      type: Type.ARRAY,
      description:
        'The breakdown of individual line items, products, or services from the document.',
      items: {
        type: Type.OBJECT,
        required: ['description', 'quantity', 'unitPrice', 'total'],
        properties: {
          description: {
            type: Type.STRING,
            description: 'Description of the item/service.',
          },
          quantity: {
            type: Type.NUMBER,
            description: 'Quantity purchased.',
          },
          unitPrice: {
            type: Type.NUMBER,
            description: 'Price per unit.',
          },
          total: {
            type: Type.NUMBER,
            description: 'Total price for this line item.',
          },
        },
      },
    },
  },
  required: [
    'vendor',
    'transactionDate',
    'documentNumber',
    'vatAmount',
    'vatRate',
    'expenseCategory',
    'subtotal',
    'totalAmount',
    'isInvoice',
    'currency',
    'entries',
    'lineItems',
  ],
} as const;

/**
 * TypeScript shape of the JSON Gemini returns under this schema.
 * Source of truth for the wire format between Gemini and our API routes —
 * the Prisma `Scan` / `JournalEntry` / `LineItem` models are the persisted
 * shape and are derived from this.
 */
export interface ExtractedReceipt {
  vendor: string;
  transactionDate: string; // YYYY-MM-DD
  documentNumber: string;
  vatAmount: number;
  vatRate: string;
  expenseCategory: string;
  subtotal: number;
  totalAmount: number;
  isInvoice: boolean;
  /** ISO 4217 or "" if no currency code/symbol was visible. */
  currency: string;
  entries: ExtractedJournalLine[];
  lineItems: ExtractedLineItem[];
}

export interface ExtractedJournalLine {
  account: string;
  debit: number;
  credit: number;
  description: string;
}

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}
