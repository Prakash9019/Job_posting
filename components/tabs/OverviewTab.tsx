"use client";

import React, { useState, useMemo } from "react";
import { finishBatch } from "@/lib/client/batch";
import {
  Download,
  Layers,
  Trash2,
  RotateCw,
  FileText,
  Search,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp, getEffectiveTimestampTime } from "@/lib/utils/formatDate";

export interface BatchItem {
  id: string;
  name: string;
  status: string;
  totalScreenshots: number;
  processedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt?: string;
  resume?: {
    fileName: string;
  } | null;
  _count?: {
    screenshots: number;
    emailDrafts: number;
  };
}

interface OverviewTabProps {
  batches: BatchItem[];
  userId: string;
  onRefresh: () => void;
  onSelectBatchFilter?: (batchId: string | null) => void;
}

export default function OverviewTab({
  batches,
  userId,
  onRefresh,
}: OverviewTabProps) {
  const [exporting, setExporting] = useState(false);
  const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchesToDelete, setBatchesToDelete] = useState<BatchItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      // Fetch all drafts and links for this user
      const [draftsRes, linksRes] = await Promise.all([
        fetch("/api/drafts"),
        fetch("/api/links"),
      ]);

      const draftsData = await draftsRes.json();
      const linksData = await linksRes.json();

      const drafts = draftsData.drafts || [];
      const links = linksData.links || [];

      // Build CSV
      const rows = [
        [
          "Type",
          "Company",
          "Job Title / Role",
          "Recipient Email",
          "Subject / Link URL",
          "Review Status",
          "Resume Attached",
          "Created At",
          "Updated At",
        ],
      ];

      drafts.forEach((d: {
        companyName: string;
        jobTitle: string;
        recipientEmail: string;
        subject: string;
        reviewStatus: string;
        resume?: { fileName: string };
        createdAt: string;
        updatedAt?: string;
      }) => {
        rows.push([
          "Email Draft",
          `"${(d.companyName || "").replace(/"/g, '""')}"`,
          `"${(d.jobTitle || "").replace(/"/g, '""')}"`,
          `"${(d.recipientEmail || "").replace(/"/g, '""')}"`,
          `"${(d.subject || "").replace(/"/g, '""')}"`,
          d.reviewStatus,
          d.resume?.fileName || "None",
          new Date(d.createdAt).toISOString(),
          d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date(d.createdAt).toISOString(),
        ]);
      });

      links.forEach((l: {
        urlType: string;
        url: string;
        title?: string;
        createdAt: string;
        updatedAt?: string;
        screenshot?: { result?: { companyName?: string; jobTitle?: string } };
      }) => {
        rows.push([
          l.urlType === "LINKEDIN" ? "LinkedIn Link" : "Application Portal",
          `"${(l.screenshot?.result?.companyName || "").replace(/"/g, '""')}"`,
          `"${(l.title || l.screenshot?.result?.jobTitle || "").replace(/"/g, '""')}"`,
          "N/A",
          `"${l.url.replace(/"/g, '""')}"`,
          "N/A",
          "N/A",
          new Date(l.createdAt).toISOString(),
          l.updatedAt ? new Date(l.updatedAt).toISOString() : new Date(l.createdAt).toISOString(),
        ]);
      });

      const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `applypilot_job_opportunities_${userId}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Error exporting CSV: " + String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleRetryBatch = async (batchId: string) => {
    try {
      setRetryingBatchId(batchId);
      await finishBatch(batchId, 3, () => onRefresh(), true);
      onRefresh();
    } catch (err) {
      alert("Error retrying batch: " + String(err));
    } finally {
      setRetryingBatchId(null);
    }
  };

  // Filter and sort batches
  const filteredBatches = useMemo(() => {
    const list = batches.filter((b) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = b.name.toLowerCase().includes(q);
      const matchResume = (b.resume?.fileName || "").toLowerCase().includes(q);
      const matchStatus = b.status.toLowerCase().includes(q);
      return matchName || matchResume || matchStatus;
    });

    return list.sort((a, b) => {
      if (sortBy === "recent") {
        return getEffectiveTimestampTime(b.createdAt, b.updatedAt) - getEffectiveTimestampTime(a.createdAt, a.updatedAt);
      }
      if (sortBy === "oldest") {
        return getEffectiveTimestampTime(a.createdAt, a.updatedAt) - getEffectiveTimestampTime(b.createdAt, b.updatedAt);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [batches, searchQuery, sortBy]);

  const selectedBatches = filteredBatches.filter((b) => selectedIds.has(b.id));
  const isAllSelected = filteredBatches.length > 0 && filteredBatches.every((b) => selectedIds.has(b.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filteredBatches.forEach((b) => next.delete(b.id));
    } else {
      filteredBatches.forEach((b) => next.add(b.id));
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

  const handleOpenDeleteSingle = (batch: BatchItem) => {
    setBatchesToDelete([batch]);
    setDeleteConfirmOpen(true);
  };

  const handleOpenDeleteBulk = () => {
    if (selectedBatches.length === 0) return;
    setBatchesToDelete(selectedBatches);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (batchesToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/batches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batchesToDelete.map((b) => b.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete batch(es)");
      }

      const deletedIds = new Set(batchesToDelete.map((b) => b.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      setDeleteConfirmOpen(false);
      setBatchesToDelete([]);
      setFeedbackMessage({
        type: "success",
        text: `Permanently deleted ${data.count ?? batchesToDelete.length} batch${(data.count ?? batchesToDelete.length) === 1 ? "" : "es"} and associated storage files.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      onRefresh();
    } catch (err: unknown) {
      alert("Error deleting batches: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Overview Banner & Export */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white mb-1">Batch Processing History</h3>
          <p className="text-xs text-slate-400">
            Overview of screenshot batches, Gemini extraction states, and one-click data export.
          </p>
        </div>

        <button
          id="btn-export-csv"
          onClick={handleExportCSV}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold shadow transition-all"
        >
          <Download className="w-4 h-4 text-indigo-400" />
          <span>{exporting ? "Generating CSV..." : "Export All to CSV"}</span>
        </button>
      </div>

      {/* Search, Sort, and Bulk Action Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-batches"
              type="text"
              placeholder="Search batches by name or resume..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
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
              <option value="name" className="bg-slate-900 text-white">Batch Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Bulk Selection Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input
                id="checkbox-select-all-batches"
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
              />
              <span>Select All ({filteredBatches.length})</span>
            </label>
            {selectedBatches.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Deselect
              </button>
            )}
          </div>

          {selectedBatches.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-bulk-delete-batches"
                onClick={handleOpenDeleteBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold transition-colors"
                title="Permanently delete selected batches and screenshots"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Selected ({selectedBatches.length})</span>
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

      {/* Batches Table / Cards */}
      {filteredBatches.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">
            {searchQuery ? "No Matching Batches" : "No Batches Yet"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No batches matched your search filter."
              : "Click “Upload Batch” in the navbar above to process your first set of LinkedIn screenshots."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBatches.map((batch) => {
            const isRetrying = retryingBatchId === batch.id;
            const isSelected = selectedIds.has(batch.id);
            const ts = getRecordTimestamp(batch.createdAt, batch.updatedAt);

            return (
              <div
                key={batch.id}
                id={`batch-card-${batch.id}`}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  isSelected
                    ? "bg-slate-900 border-indigo-500/60 ring-1 ring-indigo-500/30"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-750"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    id={`checkbox-batch-${batch.id}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectOne(batch.id)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800 mt-1"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-white">{batch.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          batch.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : batch.status === "FAILED"
                            ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                            : "bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse"
                        }`}
                      >
                        {batch.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      <span>
                        Screenshots: <strong className="text-white">{batch.totalScreenshots}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Processed: <strong className="text-emerald-400">{batch.processedCount}</strong>
                      </span>
                      {batch.failedCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400">
                            Failed: <strong>{batch.failedCount}</strong>
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        Drafts:{" "}
                        <strong className="text-indigo-400">
                          {batch._count?.emailDrafts || 0}
                        </strong>
                      </span>
                      {batch.resume && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-300">
                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                            {batch.resume.fileName}
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium" title={ts.display}>
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{ts.display}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                  {(batch.failedCount > 0 || batch.status === "PENDING" || batch.status === "PROCESSING") && (
                    <button
                      onClick={() => handleRetryBatch(batch.id)}
                      disabled={isRetrying}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium transition-colors"
                      title="Continue pending or retry failed screenshots"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                      <span>{batch.failedCount > 0 ? "Retry Failures" : "Continue Batch"}</span>
                    </button>
                  )}

                  <button
                    id={`btn-delete-batch-${batch.id}`}
                    onClick={() => handleOpenDeleteSingle(batch)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Permanently Delete Batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
            setBatchesToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="batch"
        count={batchesToDelete.length}
        items={batchesToDelete.map((b) => ({
          id: b.id,
          title: b.name,
          subtitle: `${b.totalScreenshots} screenshots | Status: ${b.status}`,
        }))}
        isDeleting={isDeleting}
        warningNote="Hard delete will permanently remove these batches, all associated screenshot images from storage, and all generated drafts."
      />
    </div>
  );
}
