'use client';

import React, { useCallback, useState } from 'react';

import { UploadIcon } from '@/components/icons';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  /** Current preview src for single-mode (data URL); null when none. */
  previewSrc?: string | null;
  /** Display filename in the corner overlay. */
  previewName?: string | null;
  isBulk?: boolean;
}

/**
 * Drag-and-drop file picker with mobile camera capture preserved
 * verbatim from the prototype's `components/FileUpload.tsx`. The mobile
 * "Take Photo" button uses `accept="image/*" capture="environment"` so
 * tapping it on a phone opens the rear-camera viewfinder directly.
 *
 * Accept set matches the prototype: PNG / JPG / WEBP / PDF.
 */
export const FileUpload: React.FC<FileUploadProps> = ({
  onFilesSelect,
  previewSrc,
  previewName,
  isBulk = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelect(Array.from(e.dataTransfer.files));
        e.dataTransfer.clearData();
      }
    },
    [onFilesSelect],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelect(Array.from(e.target.files));
      // Reset so the same file can be reselected.
      e.target.value = '';
    }
  };

  const borderStyle = isDragging
    ? 'border-aisb-purple bg-aisb-purple/5'
    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50';

  return (
    <div className="w-full space-y-4">
      {/* Mobile-only fast paths: rear camera + photo gallery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
        <label className="flex items-center justify-center px-4 py-4 bg-aisb-purple text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-transform cursor-pointer uppercase tracking-widest">
          <span>📷 Take Photo</span>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
        </label>
        <label className="flex items-center justify-center px-4 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-transform cursor-pointer uppercase tracking-widest">
          <span>🖼️ Gallery</span>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            multiple={isBulk}
            onChange={handleFileChange}
          />
        </label>
      </div>

      {/* Drop zone */}
      <label
        htmlFor="file-upload"
        className={`relative flex flex-col items-center justify-center w-full h-72 border-2 border-dashed rounded-[2rem] cursor-pointer transition-all duration-300 shadow-sm ${borderStyle}`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {!isBulk && previewSrc ? (
          <>
            {previewSrc.startsWith('data:application/pdf') ? (
              <div className="flex flex-col items-center justify-center h-full w-full">
                <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mb-4 text-red-600 font-black text-2xl">
                  PDF
                </div>
                <p className="text-sm font-black text-slate-900">{previewName}</p>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt="Receipt preview"
                className="object-contain h-full w-full rounded-[2rem] p-4"
              />
            )}
            {previewName && (
              <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded-xl truncate shadow-lg">
                {previewName}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-6">
            <div className="p-5 bg-aisb-purple/10 rounded-2xl mb-5 shadow-inner">
              <UploadIcon className="w-8 h-8 text-aisb-purple" />
            </div>
            <p className="mb-3 text-lg text-slate-900 font-black tracking-tight">
              <span className="text-aisb-purple italic">Click to upload</span> or drag
            </p>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
              PNG, JPG, WEBP or PDF {isBulk && '• Bulk mode'}
            </p>
          </div>
        )}
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/webp, application/pdf"
          multiple={isBulk}
        />
      </label>
    </div>
  );
};
