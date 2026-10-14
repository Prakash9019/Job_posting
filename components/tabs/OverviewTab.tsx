"use client";

import React, { useState } from "react";
import { finishBatch } from "@/lib/client/batch";
import { Download, Layers, Trash2, RotateCw, FileText } from "lucide-react";

export interface BatchItem {
  id: string;
  name: string;
  status: string;
  totalScreenshots: number;
  processedCount: number;
  failedCount: number;
  createdAt: string;
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
        ]);
      });

      links.forEach((l: {
        urlType: string;
        url: string;
        title?: string;
        createdAt: string;
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

  const handleDeleteBatch = async (batchId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}" and all its screenshots & drafts?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to delete batch");
      }
    } catch (err) {
      alert("Error deleting batch: " + String(err));
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

      {/* Batches Table / Cards */}
      {batches.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No Batches Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click &ldquo;Upload Batch&rdquo; in the navbar above to process your first set of LinkedIn screenshots.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const isRetrying = retryingBatchId === batch.id;

            return (
              <div
                key={batch.id}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-750 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
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

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
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
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
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
                    onClick={() => handleDeleteBatch(batch.id, batch.name)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
