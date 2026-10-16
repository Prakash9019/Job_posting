"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  RotateCw,
  Eye,
  CheckCircle2,
  Trash2,
  Search,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp, getEffectiveTimestampTime } from "@/lib/utils/formatDate";

export interface ManualReviewItem {
  id: string;
  batchId: string;
  fileName: string;
  filePath: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
  batch: {
    name: string;
    createdAt: string;
    updatedAt?: string;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<ManualReviewItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  // Filter and sort items
  const filteredItems = useMemo(() => {
    const list = items.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchFile = item.fileName.toLowerCase().includes(q);
      const matchBatch = item.batch.name.toLowerCase().includes(q);
      const matchCompany = (item.result?.companyName || "").toLowerCase().includes(q);
      const matchJob = (item.result?.jobTitle || "").toLowerCase().includes(q);
      const matchReason = (item.errorMessage || item.result?.manualReviewReason || "").toLowerCase().includes(q);
      return matchFile || matchBatch || matchCompany || matchJob || matchReason;
    });

    return list.sort((a, b) => {
      if (sortBy === "recent") {
        return getEffectiveTimestampTime(b.createdAt, b.updatedAt) - getEffectiveTimestampTime(a.createdAt, a.updatedAt);
      }
      if (sortBy === "oldest") {
        return getEffectiveTimestampTime(a.createdAt, a.updatedAt) - getEffectiveTimestampTime(b.createdAt, b.updatedAt);
      }
      if (sortBy === "name") {
        return a.fileName.localeCompare(b.fileName);
      }
      return 0;
    });
  }, [items, searchQuery, sortBy]);

  const selectedItems = filteredItems.filter((item) => selectedIds.has(item.id));
  const isAllSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filteredItems.forEach((item) => next.delete(item.id));
    } else {
      filteredItems.forEach((item) => next.add(item.id));
    }
    setSelectedIds(next);
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleOpenDeleteSingle = (item: ManualReviewItem) => {
    setItemsToDelete([item]);
    setDeleteConfirmOpen(true);
  };

  const handleOpenDeleteBulk = () => {
    if (selectedItems.length === 0) return;
    setItemsToDelete(selectedItems);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (itemsToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/screenshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: itemsToDelete.map((i) => i.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete screenshot(s)");
      }

      const deletedIds = new Set(itemsToDelete.map((i) => i.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      setDeleteConfirmOpen(false);
      setItemsToDelete([]);
      setFeedbackMessage({
        type: "success",
        text: `Permanently deleted ${data.count ?? itemsToDelete.length} image${(data.count ?? itemsToDelete.length) === 1 ? "" : "s"} and storage files.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      onRefresh();
    } catch (err: unknown) {
      alert("Error deleting screenshots: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Summary */}
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

      {/* Search, Sort, and Bulk Action Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-review"
              type="text"
              placeholder="Search by file name, reason, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "oldest" | "name")}
              className="bg-transparent text-xs text-white border-none focus:outline-none cursor-pointer"
            >
              <option value="recent" className="bg-slate-900 text-white">Recent First</option>
              <option value="oldest" className="bg-slate-900 text-white">Oldest First</option>
              <option value="name" className="bg-slate-900 text-white">File Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Bulk Selection Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input
                id="checkbox-select-all-review"
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-slate-800"
              />
              <span>Select All ({filteredItems.length})</span>
            </label>
            {selectedItems.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Deselect
              </button>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-bulk-delete-review"
                onClick={handleOpenDeleteBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold transition-colors"
                title="Permanently delete selected images and files"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Selected ({selectedItems.length})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between shadow-lg ${
            feedbackMessage.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/80 border-rose-500/40 text-rose-200"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs underline font-semibold ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content List */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">
            {searchQuery ? "No Matching Review Items Found" : "All Clear! No Review Items"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No flagged items matched your search filter."
              : "All processed screenshots were cleanly classified into emails, application portals, or LinkedIn URLs."}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredItems.map((item) => {
            const isRetrying = retryingId === item.id;
            const isSelected = selectedIds.has(item.id);
            const category = item.result?.category || "UNCERTAIN";
            const reason =
              item.errorMessage ||
              item.result?.manualReviewReason ||
              (!item.result?.recipientEmail
                ? "No direct email address found in screenshot"
                : "Low extraction confidence");
            const ts = getRecordTimestamp(item.createdAt, item.updatedAt);

            return (
              <div
                key={item.id}
                id={`manual-review-card-${item.id}`}
                className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row gap-5 ${
                  isSelected
                    ? "bg-slate-900 border-amber-500/60 ring-1 ring-amber-500/30"
                    : "bg-slate-900/60 border-amber-500/30 hover:border-amber-500/50"
                }`}
              >
                {/* Thumbnail preview */}
                <div className="flex items-start gap-3">
                  <input
                    id={`checkbox-review-${item.id}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectOne(item.id)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-slate-800 mt-1"
                  />
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
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                          {category}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {item.fileName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400" title={ts.display}>
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{ts.display}</span>
                        <span>•</span>
                        <span className="text-slate-500">{item.batch.name}</span>
                      </div>
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
                      id={`btn-delete-review-${item.id}`}
                      onClick={() => handleOpenDeleteSingle(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs transition-colors"
                      title="Permanently remove image from storage and database"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
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

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteConfirmOpen(false);
            setItemsToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="screenshot"
        count={itemsToDelete.length}
        items={itemsToDelete.map((i) => ({
          id: i.id,
          title: i.fileName,
          subtitle: `Batch: ${i.batch.name} | Category: ${i.result?.category || i.status}`,
        }))}
        isDeleting={isDeleting}
        warningNote="Permanent deletion unlinks and removes image files from disk storage and hard-deletes database records."
      />
    </div>
  );
}
