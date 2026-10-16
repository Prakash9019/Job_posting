"use client";

import React from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

export interface DeleteItemPreview {
  id: string;
  title: string;
  subtitle?: string;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  itemType?: string; // e.g. "email draft", "LinkedIn URL", "screenshot", "resume"
  count: number;
  items?: DeleteItemPreview[];
  isDeleting?: boolean;
  warningNote?: string;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemType = "record",
  count,
  items,
  isDeleting = false,
  warningNote,
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  const pluralType = count === 1 ? itemType : `${itemType}s`;
  const modalTitle = title || `Permanently Delete ${count} ${pluralType}?`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-rose-950/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{modalTitle}</h2>
              <p className="text-xs text-rose-300/80">Permanent Database &amp; File Cleanup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 space-y-1">
            <p className="font-semibold text-rose-100 flex items-center gap-1.5">
              <span>⚠️ This operation is permanent and cannot be undone.</span>
            </p>
            <p className="text-[11px] text-rose-300/90 leading-relaxed">
              The selected {count === 1 ? `1 ${itemType}` : `${count} ${pluralType}`} will be permanently hard-deleted from the database. Any exclusively owned attachments, screenshots, or stored files will also be permanently removed from physical storage.
            </p>
            {warningNote && (
              <p className="text-[11px] font-medium text-amber-300 pt-1 border-t border-rose-500/20">
                {warningNote}
              </p>
            )}
          </div>

          {items && items.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Affected {pluralType} ({count}):
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800">
                {items.slice(0, 15).map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-col p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px]"
                  >
                    <span className="font-semibold text-white truncate">{it.title}</span>
                    {it.subtitle && (
                      <span className="text-slate-400 truncate text-[10px] font-mono">{it.subtitle}</span>
                    )}
                  </div>
                ))}
                {items.length > 15 && (
                  <p className="text-center text-[10px] text-slate-500 py-1 font-medium">
                    ...and {items.length - 15} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete ({count})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
