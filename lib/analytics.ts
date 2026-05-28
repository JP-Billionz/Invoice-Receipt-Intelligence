
export interface AnalyticsEvent {
  timestamp: string;
  vendor: string;
  expenseCategory: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  processingTimeMs: number;
  source: 'single' | 'bulk' | 'folder-watcher';
  docType: 'invoice' | 'receipt' | 'unknown';
  status: 'success' | 'error';
}

const STORAGE_KEY = 'invoiceAnalytics';
const MAX_ENTRIES = 500;

export const trackAnalyticsEvent = (event: AnalyticsEvent) => {
  // Fire and forget - use a microtask or timeout to ensure it doesn't block
  setTimeout(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let logs: AnalyticsEvent[] = stored ? JSON.parse(stored) : [];
      
      logs.push(event);
      
      // Cap at MAX_ENTRIES (keep most recent)
      if (logs.length > MAX_ENTRIES) {
        logs = logs.slice(logs.length - MAX_ENTRIES);
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
      
      // Dispatch a custom event so the UI can listen for updates reactively
      window.dispatchEvent(new CustomEvent('analyticsUpdated'));
    } catch (e) {
      console.error('Failed to track analytics:', e);
    }
  }, 0);
};

export const getAnalyticsData = (): AnalyticsEvent[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

export const clearAnalyticsData = () => {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('analyticsUpdated'));
};
