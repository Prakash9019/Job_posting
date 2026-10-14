"use client";

import React from "react";
import { AlertTriangle, Send, X, ShieldAlert, CheckCircle2 } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  senderEmail: string;
  recipientsCount: number;
  recipientList: { company: string; role: string; email: string }[];
  resumeFileName?: string;
  hasUnapproved: boolean;
  isSending: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  senderEmail,
  recipientsCount,
  recipientList,
  resumeFileName,
  hasUnapproved,
  isSending,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label="Confirm email dispatch" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[92dvh] shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Confirm Email Dispatch</h2>
              <p className="text-xs text-slate-400">Review your sender and all selected recipients</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {hasUnapproved && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <span>
                Approve &amp; Send will approve all selected drafts and send each application separately. Rejected drafts will not be sent.
              </span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Sender Account:</span>
              <span className="font-mono text-indigo-400 font-semibold">{senderEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Drafts to Send:</span>
              <span className="text-white font-bold text-sm">{recipientsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Attached Resume:</span>
              <span className="text-slate-200 font-medium">
                {resumeFileName ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {resumeFileName}
                  </span>
                ) : (
                  <span className="text-amber-400">No Resume Attached</span>
                )}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              Recipients ({recipientList.length})
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800/80">
              {recipientList.map((r, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 p-2 rounded-lg bg-slate-900/60 text-[11px] break-all"
                >
                  <span className="text-white font-medium truncate max-w-[150px]">
                    {r.company} ({r.role})
                  </span>
                  <span className="font-mono text-slate-400">{r.email}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            Each recipient receives only their own application and attached resume. Successful sends move to Sent History; failed drafts stay in your queue.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-end gap-3 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-send-dispatch"
            type="button"
            onClick={onConfirm}
            disabled={isSending || recipientsCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isSending ? "Sending selected emails…" : `Approve & Send (${recipientsCount})`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
