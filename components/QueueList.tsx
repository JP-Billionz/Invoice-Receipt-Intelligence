
import React from 'react';
import { QueueItem } from '../types';
import { SpinnerIcon } from './icons/SpinnerIcon';

interface QueueListProps {
  queue: QueueItem[];
  onItemClick: (item: QueueItem) => void;
  selectedItemId: string | null;
}

const QueueList: React.FC<QueueListProps> = ({ queue, onItemClick, selectedItemId }) => {
  if (queue.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Processing Queue ({queue.length})</h3>
      <div className="max-h-72 overflow-y-auto rounded-3xl border border-slate-100 bg-white divide-y divide-slate-50 shadow-sm">
        {queue.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className={`w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-all ${
              selectedItemId === item.id ? 'bg-indigo-50/50 ring-2 ring-inset ring-indigo-500/20' : ''
            }`}
          >
            <div className="flex items-center space-x-4 overflow-hidden">
              <div className="flex-shrink-0">
                {item.status === 'pending' && <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />}
                {item.status === 'scanning' && <SpinnerIcon className="w-5 h-5 text-indigo-600 animate-spin" />}
                {item.status === 'done' && (
                  <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {item.status === 'error' && (
                  <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
                    <span className="text-red-600 font-black text-xs">!</span>
                  </div>
                )}
              </div>
              <span className="text-sm font-black text-slate-900 truncate tracking-tight">{item.file.name}</span>
            </div>
            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
              item.status === 'pending' ? 'bg-slate-100 text-slate-500' :
              item.status === 'scanning' ? 'bg-indigo-100 text-indigo-600' :
              item.status === 'done' ? 'bg-emerald-100 text-emerald-600' :
              'bg-red-100 text-red-600'
            }`}>
              {item.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QueueList;
