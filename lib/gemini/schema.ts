import { Type } from '@google/genai';

/**
 * Gemini structured-output schema for receipt/invoice extraction.
 *
 * Ported verbatim from the prototype (`services/geminiService.ts` lines 63-144).
 * The prototype's accuracy on AISB receipts has been proven; do NOT modify the
 * field set or descriptions without a parallel update to the system prompt in
 * `lib/gemini/prompts.ts` and a regression-test cycle on real samples.
 *
 * One correction vs the prototype: `lineItems` is kept REQUIRED here to match
 * the schema (the prototype's types.ts had `lineItems?: ...` — see Plan §1.6
 * issue #9).
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
