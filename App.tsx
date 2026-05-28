
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { JournalData, PriceComparisonData, QueueItem } from './types';
import { analyzeReceipt, analyzeReceiptForPriceComparison } from './services/geminiService';
import { trackAnalyticsEvent } from './lib/analytics';
import FileUpload from './components/FileUpload';
import JournalEntryTable from './components/JournalEntryTable';
import LineItemTable from './components/LineItemTable';
import PriceComparisonTable from './components/PriceComparisonTable';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import QueueList from './components/QueueList';
import FolderWatcher from './components/FolderWatcher';
import { ExcelIcon } from './components/icons/ExcelIcon';
import { SpinnerIcon } from './components/icons/SpinnerIcon';
import { MoneyIcon } from './components/icons/MoneyIcon';
import { DocumentIcon } from './components/icons/DocumentIcon';
import { UploadIcon } from './components/icons/UploadIcon';
import { ChartBarIcon } from './components/icons/ChartBarIcon';


// This is required for SheetJS to be available in the component
declare const XLSX: any;

export default function App(): React.ReactNode {
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [journalData, setJournalData] = useState<JournalData | null>(null);
  const [priceComparisonData, setPriceComparisonData] = useState<PriceComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPriceLoading, setIsPriceLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'journal' | 'comparison' | 'analytics'>('journal');
  const [ignoreVat, setIgnoreVat] = useState<boolean>(() => {
    const saved = localStorage.getItem('ignoreVat');
    return saved === 'true';
  });

  // Bulk Upload State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [duplicateNotes, setDuplicateNotes] = useState<{[docNumberId: string]: string[]}>({});
  const [lastAction, setLastAction] = useState<{ type: 'exclude' | 'keep', itemId: string } | null>(null);
  const [showDuplicateReport, setShowDuplicateReport] = useState(true);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  // Show report automatically if new duplicates are found
  useEffect(() => {
    if (queue.some(item => item.status === 'duplicate_detected')) {
      setShowDuplicateReport(true);
    }
  }, [queue]);

  // Computed data for current view
  const selectedItem = useMemo(() => 
    queue.find(item => item.id === selectedQueueItemId) || null
  , [queue, selectedQueueItemId]);

  const currentJournalData = useMemo(() => {
    if (isBulkMode && selectedItem) return selectedItem.result || null;
    return journalData;
  }, [isBulkMode, selectedItem, journalData]);

  const currentPriceData = useMemo(() => {
    if (isBulkMode && selectedItem) return null; // Price comparison mainly for single
    return priceComparisonData;
  }, [isBulkMode, selectedItem, priceComparisonData]);

  const hasPendingDuplicates = useMemo(() => {
    return queue.some(item => item.status === 'duplicate_detected');
  }, [queue]);

  const getAccountingEntries = useCallback((data: JournalData) => {
    if (!ignoreVat) return data.entries;
    
    // Gross Accounting: Merge tax into expense items to keep entry balanced
    const taxEntries = data.entries.filter(e => {
      const lower = e.account.toLowerCase();
      return lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
    });

    if (taxEntries.length === 0) return data.entries;

    const totalTaxDebit = taxEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
    
    // Find expense entries
    const expenseEntries = data.entries.filter(e => {
      const lower = e.account.toLowerCase();
      const isTax = lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
      return !isTax && e.debit > 0;
    });

    if (expenseEntries.length === 0) {
      return data.entries.filter(e => {
        const lower = e.account.toLowerCase();
        return !lower.includes('tax') && !lower.includes('vat') && !lower.includes('gst');
      });
    }

    const totalBaseExpense = expenseEntries.reduce((sum, e) => sum + e.debit, 0);
    
    return data.entries.map(e => {
      const lower = e.account.toLowerCase();
      const isTax = lower.includes('tax') || lower.includes('vat') || lower.includes('gst');
      
      if (isTax) return null;
      if (e.debit > 0) {
        const ratio = totalBaseExpense > 0 ? e.debit / totalBaseExpense : 1 / expenseEntries.length;
        return {
          ...e,
          debit: Number((e.debit + (totalTaxDebit * ratio)).toFixed(2)),
          description: e.description + " (Includes Tax)"
        };
      }
      return e;
    }).filter(p => p !== null) as any[];
  }, [ignoreVat]);

  const processingRef = useRef(false);

  React.useEffect(() => {
    localStorage.setItem('ignoreVat', ignoreVat.toString());
  }, [ignoreVat]);

  const handleFilesSelect = useCallback((files: File[], source: 'bulk' | 'folder-watcher' = 'bulk') => {
    if (files.length === 0) return;

    if (files.length === 1 && !isBulkMode && source === 'bulk') {
      // Single file mode
      const file = files[0];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onloadend = () => {
          setReceiptImage(reader.result as string);
          setImageMimeType(file.type);
          setFileName(file.name);
          setJournalData(null);
          setPriceComparisonData(null);
          setError(null);
        };
        reader.readAsDataURL(file);
      }
    } else {
      // Bulk or Folder Watcher mode
      setIsBulkMode(true);
      const newItems: QueueItem[] = files.map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'pending',
        source
      }));
      setQueue(prev => {
        const updated = [...prev, ...newItems];
        if (!selectedQueueItemId && updated.length > 0) {
          setSelectedQueueItemId(updated[0].id);
        }
        return updated;
      });
    }
  }, [isBulkMode]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    
    const nextItem = queue.find(item => item.status === 'pending');
    if (!nextItem) return;

    processingRef.current = true;
    const startTime = Date.now();
    
    setQueue(prev => prev.map(item => 
      item.id === nextItem.id ? { ...item, status: 'scanning' } : item
    ));

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(nextItem.file);
      });

      const base64Data = await base64Promise;
      const result = await analyzeReceipt(base64Data, nextItem.file.type);

      // Duplicate Check Logic
      let isDuplicate = false;
      if (result.documentNumber && result.documentNumber !== 'N/A') {
        const cleanedDocNum = result.documentNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        
        const alreadyProcessed = queue.filter(item => 
          item.id !== nextItem.id && // Don't check against self
          item.status === 'done' && 
          item.result?.documentNumber && 
          item.result.documentNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanedDocNum
        );

        if (alreadyProcessed.length > 0) {
          isDuplicate = true;
          setDuplicateNotes(prevNotes => {
            const existing = prevNotes[cleanedDocNum] || [];
            if (!existing.includes(nextItem.file.name)) {
              return { ...prevNotes, [cleanedDocNum]: [...existing, nextItem.file.name] };
            }
            return prevNotes;
          });
        }
      }

      trackAnalyticsEvent({
        timestamp: new Date().toISOString(),
        vendor: result.vendor,
        expenseCategory: result.expenseCategory,
        subtotal: result.subtotal,
        vatAmount: result.vatAmount,
        totalAmount: result.totalAmount,
        processingTimeMs: Date.now() - startTime,
        source: nextItem.source,
        docType: result.isInvoice ? 'invoice' : 'receipt',
        status: isDuplicate ? 'duplicate_detected' : 'success'
      });

      setQueue(prev => prev.map(item => 
        item.id === nextItem.id ? { 
          ...item, 
          status: isDuplicate ? 'duplicate_detected' : 'done', 
          result 
        } : item
      ));
    } catch (err) {
      console.error(err);
      trackAnalyticsEvent({
        timestamp: new Date().toISOString(),
        vendor: 'Unknown',
        expenseCategory: 'Unknown',
        subtotal: 0,
        vatAmount: 0,
        totalAmount: 0,
        processingTimeMs: Date.now() - startTime,
        source: nextItem.source,
        docType: 'unknown',
        status: 'error'
      });
      setQueue(prev => prev.map(item => 
        item.id === nextItem.id ? { ...item, status: 'error', error: 'Failed to scan' } : item
      ));
    } finally {
      processingRef.current = false;
    }
  }, [queue]);

  useEffect(() => {
    if (isBulkMode) {
      processQueue();
    }
  }, [queue, isBulkMode, processQueue]);

  const handleAnalyzeClick = useCallback(async () => {
    if (!receiptImage || !imageMimeType) {
      setError("Please upload a receipt image first.");
      return;
    }

    setIsLoading(true);
    setIsPriceLoading(true);
    setError(null);
    setJournalData(null);
    setPriceComparisonData(null);
    setSelectedQueueItemId(null);
    setActiveTab('journal');
    
    const startTime = Date.now();

    try {
      const base64Data = receiptImage.split(',')[1];
      
      // Start both tasks but wait for them independently
      const journalPromise = analyzeReceipt(base64Data, imageMimeType);
      const comparisonPromise = analyzeReceiptForPriceComparison(base64Data, imageMimeType);

      // Wait for the fast extraction first
      const journalResult = await journalPromise;
      
      trackAnalyticsEvent({
        timestamp: new Date().toISOString(),
        vendor: journalResult.vendor,
        expenseCategory: journalResult.expenseCategory,
        subtotal: journalResult.subtotal,
        vatAmount: journalResult.vatAmount,
        totalAmount: journalResult.totalAmount,
        processingTimeMs: Date.now() - startTime,
        source: 'single',
        docType: journalResult.isInvoice ? 'invoice' : 'receipt',
        status: 'success'
      });

      setJournalData(journalResult);
      setIsLoading(false); // Immediate data is ready

      // Handle the background analysis separately
      comparisonPromise.then(comparisonResult => {
        setPriceComparisonData(comparisonResult);
        setIsPriceLoading(false);
      }).catch(err => {
        console.error("Price comparison failed:", err);
        setIsPriceLoading(false);
        // We don't block the main flow if background analysis fails
      });

    } catch (err) {
      console.error(err);
      trackAnalyticsEvent({
        timestamp: new Date().toISOString(),
        vendor: 'Unknown',
        expenseCategory: 'Unknown',
        subtotal: 0,
        vatAmount: 0,
        totalAmount: 0,
        processingTimeMs: Date.now() - startTime,
        source: 'single',
        docType: 'unknown',
        status: 'error'
      });
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to analyze receipt. ${errorMessage}`);
      setIsLoading(false);
      setIsPriceLoading(false);
    }
  }, [receiptImage, imageMimeType]);
  
  const handleDownloadExcel = () => {
    if (!journalData) return;

    const workbook = XLSX.utils.book_new();

    // 1. ANALYSIS SHEET
    const analysisAoa = [
      ['DOCUMENT ANALYSIS REPORT'],
      [`Generated on ${new Date().toLocaleString()}`],
      [],
      ['CORE INFORMATION'],
      ['Vendor', journalData.vendor],
      ['Document Number', journalData.documentNumber],
      ['Document Date', journalData.transactionDate],
      ['Expense Category', journalData.expenseCategory],
      ['Document Type', journalData.isInvoice ? 'INVOICE (Unpaid)' : 'RECEIPT (Paid)'],
      [],
      ['FINANCIAL BREAKDOWN'],
      ['Subtotal', journalData.subtotal],
      ['Tax Rate', journalData.vatRate + '%'],
      ['Tax Amount', journalData.vatAmount],
      ['TOTAL AMOUNT', journalData.totalAmount],
      [],
      ['Notes', 'Automated accounting classification using IFRS/GAAP standards.']
    ];
    const analysisSheet = XLSX.utils.aoa_to_sheet(analysisAoa);
    analysisSheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, analysisSheet, 'Analysis Summary');

    // 2. JOURNAL ENTRIES SHEET
    const journalHeader = ['Date', 'Account', 'Description', 'Debit', 'Credit'];
    const entriesToExport = getAccountingEntries(journalData);
    const journalRows = entriesToExport.map(entry => [
        journalData.transactionDate,
        entry.account,
        entry.description,
        entry.debit || 0,
        entry.credit || 0
      ]);
    const journalSheet = XLSX.utils.aoa_to_sheet([journalHeader, ...journalRows]);
    journalSheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, journalSheet, 'Journal Entries');

    // 3. CSV COMPATIBLE SHEET
    const csvHeader = ['Account', 'Debit', 'Credit', 'Description'];
    const csvRows = entriesToExport.map(e => [
      e.account,
      e.debit || 0,
      e.credit || 0,
      e.description
    ]);
    const csvSheet = XLSX.utils.aoa_to_sheet([csvHeader, ...csvRows]);
    XLSX.utils.book_append_sheet(workbook, csvSheet, 'CSV Export Data');

    // 4. LINE ITEMS SHEET
    if (journalData.lineItems && journalData.lineItems.length > 0) {
      const lineItemHeader = ['Description', 'Quantity', 'Unit Price', 'Total'];
      const lineItemRows = journalData.lineItems.map(item => [
        item.description,
        item.quantity,
        item.unitPrice,
        item.total
      ]);
      const lineItemSheet = XLSX.utils.aoa_to_sheet([lineItemHeader, ...lineItemRows]);
      lineItemSheet['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, lineItemSheet, 'Detailed Line Items');
    }

    const safeVendorName = journalData.vendor.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    XLSX.writeFile(workbook, `Accounting_Package_${safeVendorName}_${journalData.transactionDate}.xlsx`);
  };

  const handleDownloadBulkExcel = () => {
    if (hasPendingDuplicates) {
      setError('Please resolve all duplicate detections before exporting.');
      return;
    }
    const doneItems = queue.filter(item => item.status === 'done' && item.result);
    if (doneItems.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // 1. BULK SUMMARY
    const summaryData = doneItems.map(item => {
      const res = item.result!;
      return {
        'Vendor': res.vendor,
        'Doc #': res.documentNumber,
        'Date': res.transactionDate,
        'Type': res.isInvoice ? 'Invoice' : 'Receipt',
        'Category': res.expenseCategory,
        'Total': res.totalAmount
      };
    });
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Bulk Summary');

    // 2. CONSOLIDATED JOURNAL
    const consolidatedHeader = ['Document', 'Date', 'Account', 'Description', 'Debit', 'Credit'];
    const consolidatedRows = doneItems.flatMap(item => {
      const res = item.result!;
      const entriesToExport = getAccountingEntries(res);
      return entriesToExport.map(e => [
        res.vendor,
        res.transactionDate,
        e.account,
        e.description,
        e.debit || 0,
        e.credit || 0
      ]);
    });
    const consolidatedSheet = XLSX.utils.aoa_to_sheet([consolidatedHeader, ...consolidatedRows]);
    XLSX.utils.book_append_sheet(workbook, consolidatedSheet, 'Combined Journals');

    // 3. COMBINED LINE ITEMS
    const allLineItemsHeader = ['Vendor', 'Date', 'Description', 'Quantity', 'Unit Price', 'Total'];
    const allLineItemsRows = doneItems.flatMap(item => {
      const res = item.result!;
      if (!res.lineItems) return [];
      return res.lineItems.map(li => [
        res.vendor,
        res.transactionDate,
        li.description,
        li.quantity,
        li.unitPrice,
        li.total
      ]);
    });
    
    if (allLineItemsRows.length > 0) {
      const allLineItemsSheet = XLSX.utils.aoa_to_sheet([allLineItemsHeader, ...allLineItemsRows]);
      allLineItemsSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, allLineItemsSheet, 'Combined Line Items');
    }

    XLSX.writeFile(workbook, `Bulk_Financial_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const resolveDuplicate = (itemId: string, keep: boolean) => {
    setLastAction({ type: keep ? 'keep' : 'exclude', itemId });
    setQueue(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: keep ? 'done' : 'excluded' } : item
    ));
  };

  const undoLastAction = () => {
    if (!lastAction) return;
    setQueue(prev => prev.map(item => 
      item.id === lastAction.itemId ? { ...item, status: 'duplicate_detected' } : item
    ));
    setLastAction(null);
  };

  const resetState = () => {
    setReceiptImage(null);
    setImageMimeType(null);
    setJournalData(null);
    setPriceComparisonData(null);
    setIsLoading(false);
    setError(null);
    setFileName(null);
    setQueue([]);
    setDuplicateNotes({});
    setLastAction(null);
    setShowDuplicateReport(true);
    setIsBulkMode(false);
    setSelectedQueueItemId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      <div className="absolute top-0 left-0 w-full h-[450px] bg-indigo-950 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.1),transparent_50%)]" />
      </div>
      <main className="container mx-auto px-4 py-8 md:py-20">
        <header className="text-center mb-16 relative">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-6 border border-indigo-500/30 backdrop-blur-md">
            AI-Powered Accounting
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-6 leading-tight">
            <span className="text-indigo-300">Receipt Intelligence</span> <span className="bg-clip-text text-transparent bg-gradient-to-br from-blue-400 via-indigo-300 to-emerald-400">AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto font-medium leading-relaxed">
            Automate your bookkeeping with intelligent invoice scanning and real-time market insights.
          </p>
        </header>

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Upload & Controls */}
            <div className="lg:col-span-4 flex flex-col space-y-6 lg:sticky lg:top-8">
              <div className="bg-white rounded-[2rem] shadow-2xl shadow-indigo-100/50 p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-slate-900 flex items-center">
                    <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mr-4 text-sm font-bold shadow-lg shadow-indigo-200">1</span>
                    Upload
                  </h2>
                  <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
                    <button 
                      onClick={() => setIsBulkMode(false)}
                      className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all tracking-widest uppercase ${!isBulkMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Single
                    </button>
                    <button 
                      onClick={() => setIsBulkMode(true)}
                      className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all tracking-widest uppercase ${isBulkMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Bulk
                    </button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-black text-slate-900 block">Ignore VAT</span>
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Hide tax from output</span>
                      </div>
                      <button
                        onClick={() => setIgnoreVat(!ignoreVat)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
                          ignoreVat ? 'bg-indigo-600' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                            ignoreVat ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <FileUpload 
                    onFilesSelect={handleFilesSelect} 
                    receiptImage={receiptImage} 
                    fileName={fileName} 
                    isBulk={isBulkMode}
                  />
                  <input
                    type="file"
                    ref={itemsInputRef}
                    className="hidden"
                    multiple={isBulkMode}
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesSelect(Array.from(e.target.files));
                      }
                      e.target.value = ''; // Reset for consecutive uploads
                    }}
                  />

                  {receiptImage && !isBulkMode && (
                    <div className="flex flex-col space-y-4">
                      <button
                        onClick={handleAnalyzeClick}
                        disabled={isLoading}
                        className="w-full bg-indigo-600 text-white font-black py-5 px-6 rounded-2xl hover:bg-indigo-700 transition-all duration-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center text-lg shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
                      >
                        {isLoading ? <><SpinnerIcon className="w-6 h-6 mr-3 text-white"/> Analyzing...</> : "✨ Analyze with AI"}
                      </button>
                      <button onClick={resetState} className="text-sm font-black text-slate-500 hover:text-indigo-600 transition-colors py-2">
                        Clear Selection
                      </button>
                    </div>
                  )}

                  {isBulkMode && queue.length > 0 && (
                    <div className="space-y-4">
                      <QueueList 
                        queue={queue} 
                        onItemClick={(item) => setSelectedQueueItemId(item.id)}
                        selectedItemId={selectedQueueItemId}
                      />
                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={handleDownloadBulkExcel}
                          disabled={!queue.some(item => item.status === 'done')}
                          className="w-full bg-emerald-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-emerald-700 transition-all disabled:bg-slate-100 disabled:text-slate-400 flex items-center justify-center text-sm shadow-xl shadow-emerald-600/10 active:scale-[0.98]"
                        >
                          <ExcelIcon className="w-5 h-5 mr-3" /> EXPORT ALL TO EXCEL
                        </button>
                        <button onClick={resetState} className="text-xs font-black text-slate-500 hover:text-red-500 transition-colors text-center py-2 uppercase tracking-widest">
                          Reset Queue
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <FolderWatcher onFilesFound={handleFilesSelect} />
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-8 flex flex-col space-y-6">
              <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 min-h-[700px] flex flex-col border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                  <h2 className="text-2xl font-black text-slate-900 flex items-center">
                    <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mr-4 text-sm font-bold shadow-lg shadow-indigo-200">2</span>
                    Analysis Results
                  </h2>
                  {isBulkMode && selectedItem && (
                    <div className="text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100 uppercase tracking-widest">
                      Viewing: {selectedItem.file.name}
                    </div>
                  )}
                </div>

                <div className="flex-grow flex flex-col justify-center p-8">
                  {isLoading && !isBulkMode && (
                    <div className="text-center p-12">
                      <div className="relative inline-block">
                        <SpinnerIcon className="h-20 w-20 text-indigo-600 animate-spin" />
                      </div>
                      <h3 className="mt-8 font-black text-3xl text-slate-900 tracking-tight">AI is thinking...</h3>
                      <p className="text-slate-600 mt-3 text-lg font-medium">Extracting core journal data instantly.</p>
                    </div>
                  )}

                  {!isLoading && isPriceLoading && activeTab === 'comparison' && !isBulkMode && (
                    <div className="text-center p-12">
                      <div className="relative inline-block">
                        <SpinnerIcon className="h-20 w-20 text-indigo-600 animate-spin" />
                      </div>
                      <h3 className="mt-8 font-black text-3xl text-slate-900 tracking-tight">Market Analysis In-Progress</h3>
                      <p className="text-slate-600 mt-3 text-lg font-medium">Performing real-time price comparisons. This takes a bit longer...</p>
                    </div>
                  )}

                  {error && (
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-100">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl font-bold">!</span>
                      </div>
                      <h3 className="font-bold text-red-800">An Error Occurred</h3>
                      <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                  )}

                  {!isLoading && !error && !journalData && !isBulkMode && (
                    <div className="text-center p-12">
                      <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <UploadIcon className="w-12 h-12 text-indigo-200" />
                      </div>
                      <h3 className="font-black text-2xl text-slate-900 tracking-tight">Ready to Scan</h3>
                      <p className="text-slate-600 mt-3 max-w-sm mx-auto font-medium text-lg leading-relaxed">Upload an invoice to see AI-generated journal entries and market insights.</p>
                    </div>
                  )}

                  {isBulkMode && !selectedItem && (
                    <div className="text-center p-12">
                      <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <DocumentIcon className="w-12 h-12 text-indigo-300" />
                      </div>
                      <h3 className="font-black text-2xl text-slate-900 tracking-tight">Bulk Processing Active</h3>
                      <p className="text-slate-600 mt-3 max-w-sm mx-auto font-medium text-lg leading-relaxed">Select a file from the queue on the left to view its individual results.</p>
                    </div>
                  )}

                  {/* Active Uploads Horizontal Tabs */}
                  {isBulkMode && queue.length > 0 && (
                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-4 px-2">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Upload Queue</h3>
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            {queue.filter(q => q.status === 'done').length} / {queue.length} Ready
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            setQueue([]);
                            setSelectedQueueItemId(null);
                            setIsBulkMode(false);
                            setJournalData(null);
                          }}
                          className="text-[10px] font-black text-red-500 hover:text-red-600 uppercase tracking-widest transition-colors py-1 px-2 hover:bg-red-50 rounded-lg"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="flex items-center space-x-3 overflow-x-auto pb-4 scrollbar-hide py-2">
                        <button
                          onClick={() => { itemsInputRef.current?.click(); }}
                          className="flex-none group relative px-5 py-3 rounded-2xl text-xs font-black transition-all border border-dashed border-indigo-200 bg-indigo-50/30 text-indigo-600 hover:bg-indigo-50 active:scale-95 flex items-center space-x-2"
                        >
                          <span className="text-lg leading-none font-light">+</span>
                          <span className="tracking-tight uppercase tracking-widest text-[9px]">Add Next</span>
                        </button>
                        {queue.map((item, idx) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedQueueItemId(item.id)}
                            className={`flex-none group relative px-5 py-3 rounded-2xl text-xs font-black transition-all border ${
                              selectedQueueItemId === item.id 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-600/20 active:scale-95' 
                                : 'bg-white border-slate-100 text-slate-500 hover:text-slate-900 hover:border-slate-200 active:scale-95'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className={`text-[10px] ${selectedQueueItemId === item.id ? 'text-indigo-200' : 'text-slate-400 font-mono'}`}>
                                {idx + 1}
                              </span>
                              <span className="truncate max-w-[140px] tracking-tight">{item.file.name}</span>
                              {item.status === 'scanning' && (
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                              )}
                              {item.status === 'error' && (
                                <div className="w-2 h-2 rounded-full bg-red-400" />
                              )}
                              {item.status === 'duplicate_detected' && (
                                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                              )}
                              {item.status === 'excluded' && (
                                <div className="w-2 h-2 rounded-full bg-slate-300" />
                              )}
                              {item.status === 'done' && selectedQueueItemId !== item.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isBulkMode && showDuplicateReport && Object.keys(duplicateNotes).length > 0 && (
                    <div className="mb-8 p-6 bg-amber-50 rounded-3xl border border-amber-200 animate-in fade-in zoom-in duration-500 relative group/report">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-700">
                            <span className="font-black text-sm">!</span>
                          </div>
                          <h3 className="font-black text-amber-900 tracking-tight">Duplicate Detection Report</h3>
                        </div>
                        {!hasPendingDuplicates && (
                          <button 
                            onClick={() => setShowDuplicateReport(false)}
                            className="p-2 hover:bg-amber-100 rounded-xl text-amber-600 transition-all active:scale-90"
                            title="Dismiss report"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        )}
                      </div>
                      <div className="space-y-3">
                        {Object.entries(duplicateNotes).map(([docNum, files]) => (
                          <div key={docNum} className="text-sm bg-white/50 p-3 rounded-xl border border-amber-100/50">
                            <p className="font-black text-amber-800">Doc #{docNum} appears multiple times:</p>
                            <ul className="mt-2 space-y-1">
                              {files.map(f => (
                                <li key={f} className="text-amber-600 font-mono text-[10px] flex items-center">
                                  <span className="w-1 h-1 rounded-full bg-amber-400 mr-2" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[10px] text-amber-500 font-medium italic">
                              Justification: Matches were found on the document's unique identifier (Invoice/Receipt #), suggesting these represent the same financial transaction regardless of filename.
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {((!isBulkMode && journalData) || (isBulkMode && selectedItem?.result)) && (
                    <div className="w-full">
                      {isBulkMode && selectedItem?.status === 'scanning' && (
                        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                          <SpinnerIcon className="mx-auto h-12 w-12 text-indigo-600 animate-spin" />
                          <h4 className="mt-6 font-black text-slate-900 tracking-tight">Scanning {selectedItem.file.name}...</h4>
                          <p className="text-slate-500 text-sm font-medium mt-2">AI is extracting line items and categories</p>
                        </div>
                      )}

                      {isBulkMode && selectedItem?.status === 'duplicate_detected' && (
                        <div className="text-center py-16 bg-amber-50 rounded-[2.5rem] border border-amber-200 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4">
                             <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 animate-pulse">
                               <span className="font-black text-xl">!</span>
                             </div>
                          </div>
                          
                          <h4 className="text-2xl font-black text-amber-900 tracking-tight mb-2 px-12">Potential Duplicate Detected</h4>
                          <p className="text-amber-700/70 text-sm font-medium mb-8 max-w-sm mx-auto">
                            Document #<span className="font-black">{selectedItem.result?.documentNumber}</span> has already been processed in this batch. 
                            Would you like to exclude this entry to prevent double-counting?
                          </p>

                          <div className="flex items-center justify-center space-x-4">
                            <button
                              onClick={() => resolveDuplicate(selectedItem.id, false)}
                              className="px-8 py-4 bg-amber-600 text-white font-black rounded-2xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 active:scale-95"
                            >
                              Yes, Exclude
                            </button>
                            <button
                              onClick={() => resolveDuplicate(selectedItem.id, true)}
                              className="px-8 py-4 bg-white border-2 border-amber-200 text-amber-700 font-black rounded-2xl hover:bg-amber-50 transition-all active:scale-95"
                            >
                              No, Keep Duplicate
                            </button>
                          </div>
                        </div>
                      )}

                      {isBulkMode && selectedItem?.status === 'excluded' && (
                        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-slate-200 border-dashed">
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                             <DocumentIcon className="w-8 h-8 text-slate-400 opacity-50" />
                          </div>
                          <h4 className="font-black text-slate-400 tracking-tight">This entry has been excluded</h4>
                          <p className="text-slate-400 text-xs font-medium mt-2">It will not be included in Excel exports or journals.</p>
                          <button 
                            onClick={() => resolveDuplicate(selectedItem.id, true)}
                            className="mt-6 text-xs font-black text-indigo-600 hover:underline uppercase tracking-widest"
                          >
                            Include it anyway
                          </button>
                        </div>
                      )}

                      {lastAction && (
                        <div className="fixed bottom-8 right-8 animate-in slide-in-from-right-8 duration-500 z-50">
                          <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-6 border border-slate-700/50 backdrop-blur-xl">
                            <span className="text-sm font-bold text-slate-300">
                              {lastAction.type === 'exclude' ? 'Entry excluded' : 'Entry included'}
                            </span>
                            <button
                              onClick={undoLastAction}
                              className="text-sm font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest"
                            >
                              Undo
                            </button>
                          </div>
                        </div>
                      )}

                      {((!isBulkMode && journalData) || (isBulkMode && selectedItem?.status === 'done')) && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="flex bg-slate-100/50 p-1 rounded-2xl self-start w-fit">
                            <button
                              onClick={() => setActiveTab('journal')}
                              className={`flex items-center py-3 px-8 rounded-xl font-black text-sm transition-all ${
                                activeTab === 'journal'
                                  ? 'bg-white text-indigo-600 shadow-md scale-100'
                                  : 'text-slate-500 hover:text-slate-700 scale-95 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <MoneyIcon className="w-4 h-4 mr-2" /> JOURNAL ENTRY
                            </button>
                            {!isBulkMode && (
                              <button
                                onClick={() => setActiveTab('comparison')}
                                className={`flex items-center py-3 px-8 rounded-xl font-black text-sm transition-all relative ${
                                  activeTab === 'comparison'
                                    ? 'bg-white text-emerald-600 shadow-md scale-100'
                                    : 'text-slate-500 hover:text-slate-700 scale-95 opacity-70 hover:opacity-100'
                                }`}
                              >
                                <DocumentIcon className="w-4 h-4 mr-2" /> PRICE COMPARISON
                                {isPriceLoading && (
                                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                  </span>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => setActiveTab('analytics')}
                              className={`flex items-center py-3 px-8 rounded-xl font-black text-sm transition-all ${
                                activeTab === 'analytics'
                                  ? 'bg-white text-indigo-600 shadow-md scale-100'
                                  : 'text-slate-500 hover:text-slate-700 scale-95 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <ChartBarIcon className="w-4 h-4 mr-2" /> ANALYTICS
                            </button>
                          </div>
                          
                          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                            {activeTab === 'journal' && currentJournalData && (
                              <div className="space-y-8">
                                <JournalEntryTable 
                                  data={currentJournalData} 
                                  ignoreVat={ignoreVat}
                                  onDownloadExcel={isBulkMode ? handleDownloadBulkExcel : handleDownloadExcel}
                                  isExportDisabled={isBulkMode && hasPendingDuplicates}
                                />
                                {currentJournalData.lineItems && currentJournalData.lineItems.length > 0 && (
                                  <LineItemTable items={currentJournalData.lineItems} />
                                )}
                              </div>
                            )}
                            {activeTab === 'comparison' && (
                              <div className="space-y-4">
                                {isPriceLoading && !priceComparisonData ? (
                                  <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 border-dashed text-center">
                                    <SpinnerIcon className="h-8 w-8 text-indigo-400 animate-spin mx-auto mb-4" />
                                    <p className="text-slate-500 font-bold">Researching market prices...</p>
                                  </div>
                                ) : (
                                  <PriceComparisonTable data={currentPriceData || []} />
                                )}
                              </div>
                            )}
                            {activeTab === 'analytics' && (
                              <AnalyticsDashboard />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        <footer className="text-center mt-20 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
          <p>© 2026 Receipt Intelligence AI • Optimized for Clarity</p>
        </footer>
      </main>
    </div>
  );
}
