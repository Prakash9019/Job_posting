"use client";

import React, { useState } from "react";
import { AlertTriangle, RotateCw, Eye, CheckCircle2, Trash2 } from "lucide-react";

export interface ManualReviewItem {
  id: string;
  batchId: string;
  fileName: string;
  filePath: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  batch: {
    name: string;
    createdAt: string;
  };
  result?: {
    category: string;
    companyName: string | null;
    jobTitle: string | null;
    recipientEmail: string | null;
    confidence: string;
    manualReviewReason: string | null;
    evidenceText: string | null;
  } | null;
}

interface ManualReviewTabProps {
  items: ManualReviewItem[];
  userId?: string;
  onRefresh: () => void;
  onViewScreenshot: (screenshotId: string) => void;
}

export default function ManualReviewTab({
  items,
  onRefresh,
  onViewScreenshot,
}: ManualReviewTabProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRetryItem = async (screenshotId: string, batchId: string) => {
    try {
      setRetryingId(screenshotId);
      const res = await fetch(`/api/batches/${batchId}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Retry failed");
      }
    } catch (err) {
      alert("Error retrying extraction: " + String(err));
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteItem = async (screenshotId: string, fileName: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete "${fileName}"?\n\nThis will remove the image from storage and the database.`
      )
    ) {
      return;
    }
    try {
      setDeletingId(screenshotId);
      const res = await fetch(`/api/screenshots/${screenshotId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to delete screenshot");
      }
    } catch (err) {
      alert("Error deleting screenshot: " + String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Items Flagged for Manual Review</h3>
          <p className="text-xs text-slate-400">
            Screenshots with uncertain classification, missing recipient emails, low confidence, or extraction errors.
          </p>
        </div>
        <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
          {items.length} Review Needed
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">All Clear! No Review Items</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            All processed screenshots were cleanly classified into emails, application portals, or LinkedIn URLs.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {items.map((item) => {
            const isRetrying = retryingId === item.id;
            const category = item.result?.category || "UNCERTAIN";
            const reason =
              item.errorMessage ||
              item.result?.manualReviewReason ||
              (!item.result?.recipientEmail
                ? "No direct email address found in screenshot"
                : "Low extraction confidence");

            return (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-slate-900/60 border border-amber-500/30 hover:border-amber-500/50 transition-all flex flex-col md:flex-row gap-5"
              >
                {/* Thumbnail preview */}
                <div
                  onClick={() => onViewScreenshot(item.id)}
                  className="w-full md:w-48 h-32 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden cursor-pointer relative group flex-shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/screenshot/${item.id}`}
                    alt={item.fileName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] font-semibold text-white flex items-center gap-1 bg-black/60 px-2 py-1 rounded-md">
                      <Eye className="w-3.5 h-3.5" /> Full View
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                          {category}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {item.fileName}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-500">
                        {item.batch.name} • {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2 mb-2.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <span className="font-semibold">Review Reason: </span>
                        <span>{reason}</span>
                      </div>
                    </div>

                    {item.result?.evidenceText && (
                      <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 mb-2">
                        <span className="text-slate-500 font-semibold uppercase text-[10px] block mb-1">
                          Excerpt Found in Image:
                        </span>
                        <p className="italic font-mono">{item.result.evidenceText}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => handleDeleteItem(item.id, item.fileName)}
                      disabled={deletingId === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs transition-colors"
                      title="Permanently remove image and database record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingId === item.id ? "Deleting..." : "Delete"}</span>
                    </button>
                    <button
                      onClick={() => onViewScreenshot(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      Inspect Image
                    </button>
                    <button
                      onClick={() => handleRetryItem(item.id, item.batchId)}
                      disabled={isRetrying}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-xs font-medium transition-colors"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                      <span>{isRetrying ? "Retrying..." : "Retry Extraction"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
