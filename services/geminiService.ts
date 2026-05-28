
import { GoogleGenAI, Type } from "@google/genai";
import { JournalData, PriceComparisonData, PriceComparisonItem } from '../types';

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const getFriendlyErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  
  const message = error?.message || "";
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return "The AI service is currently under very high demand. We attempted multiple retries, but the server is still busy. Please wait a minute before trying again.";
  }
  if (message.includes('SAFETY')) {
    return "The AI could not process this image due to safety filters. Please ensure the receipt is clear and does not contain sensitive personal information.";
  }
  
  try {
    // Try to extract message from JSON strings if present
    const jsonMatch = message.match(/\{.*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) return parsed.error.message;
    }
  } catch (e) {}
  
  return message || "An unexpected error occurred while communicating with the AI.";
};

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = error?.message || "";
      const isRateLimit = errorMsg.includes('429') || 
                          errorMsg.includes('RESOURCE_EXHAUSTED') ||
                          error?.status === 429;
      
      if (isRateLimit && retries < maxRetries) {
        retries++;
        const waitTime = initialDelay * Math.pow(2, retries - 1);
        console.warn(`Gemini API rate limited. Retrying in ${waitTime}ms (Attempt ${retries}/${maxRetries})...`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    vendor: {
      type: Type.STRING,
      description: 'The name of the vendor, store, or service provider from the receipt.',
    },
    transactionDate: {
      type: Type.STRING,
      description: 'The primary date of the transaction in YYYY-MM-DD format. Infer the year if missing.',
    },
    documentNumber: {
      type: Type.STRING,
      description: 'The unique reference number on the document (e.g., Invoice #, Receipt ID, Transaction ID). Use "N/A" if none found.',
    },
    vatAmount: {
      type: Type.NUMBER,
      description: 'The total VAT (Value Added Tax) or sales tax amount extracted from the invoice.',
    },
    vatRate: {
      type: Type.STRING,
      description: 'The VAT rate shown on the invoice (e.g., "20%", "15%"). Use "Unknown" if not present.',
    },
    expenseCategory: {
      type: Type.STRING,
      description: 'AI-classified category: "Office Supplies", "Travel", "Utilities", "Marketing", "Professional Services", "Equipment", "Food & Beverage", or "Other".',
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
      description: 'True if the document is an Invoice (billing for future payment), False if it is a Receipt (proof of past payment).',
    },
    entries: {
      type: Type.ARRAY,
      description: 'The list of debit and credit entries for the journal.',
      items: {
        type: Type.OBJECT,
        required: ["account", "debit", "credit", "description"],
        properties: {
          account: {
            type: Type.STRING,
            description: 'The specific accounting account name (e.g., "Office Supplies Expense", "Meals & Entertainment", "Bank", "Credit Card Payable"). Use standard account names.',
          },
          debit: {
            type: Type.NUMBER,
            description: 'The debit amount for this line. Must be 0 if it is a credit entry. Should not be negative.',
          },
          credit: {
            type: Type.NUMBER,
            description: 'The credit amount for this line. Must be 0 if it is a debit entry. Should not be negative.',
          },
          description: {
            type: Type.STRING,
            description: 'A brief, clear description for the entry line, usually derived from the receipt items or vendor name.',
          },
        },
      },
    },
    lineItems: {
      type: Type.ARRAY,
      description: 'The breakdown of individual line items, products, or services from the document.',
      items: {
        type: Type.OBJECT,
        required: ["description", "quantity", "unitPrice", "total"],
        properties: {
          description: { type: Type.STRING, description: 'Description of the item/service.' },
          quantity: { type: Type.NUMBER, description: 'Quantity purchased.' },
          unitPrice: { type: Type.NUMBER, description: 'Price per unit.' },
          total: { type: Type.NUMBER, description: 'Total price for this line item.' },
        },
      },
    },
  },
  required: ["vendor", "transactionDate", "documentNumber", "vatAmount", "vatRate", "expenseCategory", "subtotal", "totalAmount", "entries", "lineItems"],
};

export const analyzeReceipt = async (
  base64ImageData: string,
  mimeType: string
): Promise<JournalData> => {
  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: mimeType,
    },
  };

  const textPart = {
    text: `You are an expert accountant. Analyze this document and create a standard double-entry accounting journal entry following IFRS/GAAP standards.
    1. Determine if the document is an "Invoice" (unpaid bill) or a "Receipt" (proof of payment already made). Set isInvoice accordingly.
    2. Identify the vendor, transaction date, document number (invoice/receipt number), subtotal, VAT amount, VAT rate, total amount, and classify the expense category.
    3. Determine the most appropriate expense account(s) to debit (e.g., Office Supplies, Meals & Entertainment, Travel Expense).
    4. ACCRUAL ACCOUNTING RULES:
       - If it is an INVOICE: The corresponding credit account MUST be "Accounts Payable" or "Trade Creditors". Do NOT credit Bank or Cash.
       - If it is a RECEIPT: The corresponding credit account should be "Bank", "Cash", or "Credit Card Payable" depending on the payment method shown.
    5. Ensure that total debits equal total credits.
    6. Extract tax as a separate line item, debiting an account like 'GST/VAT Paid' or 'Input Tax'.
    7. LINE ITEM EXTRACTION: Extract every individual product or service line item found on the document, including its description, quantity, unit price, and total. This is critical for detailed cost tracking.
    8. Format the output strictly according to the provided JSON schema.
    `,
  };

  const generate = async (modelName: string) => {
    return await withRetry(() => ai.models.generateContent({
      model: modelName,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    }));
  };

  try {
    const response = await generate("gemini-3-flash-preview");

    const jsonText = response.text;
    const parsedData = JSON.parse(jsonText);

    if (!parsedData.vendor || !parsedData.transactionDate || !Array.isArray(parsedData.entries)) {
        throw new Error("Invalid data structure received from AI.");
    }

    return parsedData as JournalData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(getFriendlyErrorMessage(error));
  }
};

export const analyzeReceiptForPriceComparison = async (
  base64ImageData: string,
  mimeType: string
): Promise<PriceComparisonData> => {
  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: mimeType,
    },
  };

  const textPart = {
    text: `You are a market research expert. Analyze this receipt image. 
    1. Identify up to 5 of the most significant items purchased, ignoring minor items like bags, tips, or individual grocery items unless they are high-value.
    2. For each of these major items, use your search tool to find the price of a similar or identical product from a different online vendor.
    3. Return the data as a valid JSON array of objects. Each object must have these keys: "itemName" (string), "pricePaid" (number), "comparableProduct" (string), "comparablePrice" (number), "vendor" (string). Do not output anything else besides the JSON array.`,
  };

  const generate = async (modelName: string) => {
    return await withRetry(() => ai.models.generateContent({
      model: modelName,
      contents: { parts: [imagePart, textPart] },
      config: {
        tools: [{googleSearch: {}}],
      }
    }));
  };

  try {
    const response = await generate("gemini-3-flash-preview");

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks.map(chunk => chunk.web).filter(Boolean);

    let jsonText = response.text;
    
    // Safety check for empty or non-JSON responses
    if (!jsonText || jsonText.trim() === "" || jsonText.includes("I can't") || jsonText.includes("I don't find")) {
      return [];
    }
    
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7, -3).trim();
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3, -3).trim();
    }

    let parsedData: any[] = [];
    try {
      parsedData = JSON.parse(jsonText);
    } catch (e) {
      console.warn("Retrying JSON extraction from fuzzy text");
      const match = jsonText.match(/\[.*\]/s);
      if (match) parsedData = JSON.parse(match[0]);
      else return [];
    }
    
    const enhancedData: PriceComparisonData = Array.isArray(parsedData) ? parsedData.map((item, index) => {
        const source = webSources[index] || webSources[0];
        return {
            ...item,
            source: source?.uri || '#',
            sourceTitle: source?.title || 'Online Source'
        };
    }) : [];

    return enhancedData;

  } catch (error) {
    console.error("Error calling Gemini API for price comparison:", error);
    throw new Error(getFriendlyErrorMessage(error));
  }
};
