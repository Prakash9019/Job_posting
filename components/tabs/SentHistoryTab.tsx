"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Trash2,
  Search,
  ArrowUpDown,
} from "lucide-react";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp, getEffectiveTimestampTime } from "@/lib/utils/formatDate";

export interface SendAttemptItem {
  id: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  status: string; // PENDING, SENDING, SENT, FAILED, UNKNOWN
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
  draft: {
    id: string;
    companyName: string;
    jobTitle: string;
    subject: string;
    body: string;
    resume?: {
      fileName: string;
    } | null;
  };
  user: {
    name: string;
  };
}

interface SentHistoryTabProps {
  attempts: SendAttemptItem[];
  onRefresh?: () => void;
}

export default function SentHistoryTab({ attempts, onRefresh }: SentHistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "company">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [attemptsToDelete, setAttemptsToDelete] = useState<SendAttemptItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filter and sort attempts
  const filteredAttempts = useMemo(() => {
    const list = attempts.filter((attempt) => {
      // Status filter
      if (statusFilter !== "ALL" && attempt.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchCompany = attempt.draft?.companyName?.toLowerCase().includes(q);
        const matchJob = attempt.draft?.jobTitle?.toLowerCase().includes(q);
        const matchEmail = attempt.recipientEmail.toLowerCase().includes(q) || attempt.senderEmail.toLowerCase().includes(q);
        const matchSubject = attempt.subject.toLowerCase().includes(q);
        const matchMsgId = (attempt.gmailMessageId || "").toLowerCase().includes(q);
        return matchCompany || matchJob || matchEmail || matchSubject || matchMsgId;
      }

      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === "recent") {
        return getEffectiveTimestampTime(b.createdAt, b.updatedAt) - getEffectiveTimestampTime(a.createdAt, a.updatedAt);
      }
      if (sortBy === "oldest") {
        return getEffectiveTimestampTime(a.createdAt, a.updatedAt) - getEffectiveTimestampTime(b.createdAt, b.updatedAt);
      }
      if (sortBy === "company") {
        return (a.draft?.companyName || "").localeCompare(b.draft?.companyName || "");
      }
      return 0;
    });
  }, [attempts, statusFilter, searchQuery, sortBy]);

  const selectedAttempts = filteredAttempts.filter((item) => selectedIds.has(item.id));
  const isAllSelected = filteredAttempts.length > 0 && filteredAttempts.every((item) => selectedIds.has(item.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filteredAttempts.forEach((item) => next.delete(item.id));
    } else {
      filteredAttempts.forEach((item) => next.add(item.id));
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

  const handleOpenDeleteSingle = (item: SendAttemptItem) => {
    setAttemptsToDelete([item]);
    setDeleteConfirmOpen(true);
  };

  const handleOpenDeleteBulk = () => {
    if (selectedAttempts.length === 0) return;
    setAttemptsToDelete(selectedAttempts);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (attemptsToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: attemptsToDelete.map((a) => a.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete send history");
      }

      const deletedIds = new Set(attemptsToDelete.map((a) => a.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      setDeleteConfirmOpen(false);
      setAttemptsToDelete([]);
      setFeedbackMessage({
        type: "success",
        text: `Permanently deleted ${data.count ?? attemptsToDelete.length} history log${(data.count ?? attemptsToDelete.length) === 1 ? "" : "s"}.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      onRefresh?.();
    } catch (err: unknown) {
      alert("Error deleting send history: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Summary */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Gmail Dispatch History</h3>
          <p className="text-xs text-slate-400">
            Audit log of all real Gmail send attempts with status reconciliation and Gmail API message identifiers.
          </p>
        </div>
        <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold">
          {attempts.length} Total Attempts
        </span>
      </div>

      {/* Search, Sort, Filter, and Bulk Action Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-history"
              type="text"
              placeholder="Search by company, role, email, or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700/60 text-xs">
            {["ALL", "SENT", "FAILED"].map((st) => (
              <button
                key={st}
                id={`filter-history-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  statusFilter === st
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {st === "ALL" ? "All" : st === "SENT" ? "Sent" : "Failed"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "oldest" | "company")}
              className="bg-transparent text-xs text-white border-none focus:outline-none cursor-pointer"
            >
              <option value="recent" className="bg-slate-900 text-white">Recent First</option>
              <option value="oldest" className="bg-slate-900 text-white">Oldest First</option>
              <option value="company" className="bg-slate-900 text-white">Company (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Bulk Selection Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input
                id="checkbox-select-all-history"
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
              />
              <span>Select All ({filteredAttempts.length})</span>
            </label>
            {selectedAttempts.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Deselect
              </button>
            )}
          </div>

          {selectedAttempts.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-bulk-delete-history"
                onClick={handleOpenDeleteBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold transition-colors"
                title="Permanently delete selected history records"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Selected ({selectedAttempts.length})</span>
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
      {filteredAttempts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">
            {searchQuery ? "No Matching Send Records" : "No Send Attempts Recorded"}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No history records matched your search query. Try clearing the filter."
              : "Once you approve and dispatch email drafts through your connected Gmail account, records will be tracked here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAttempts.map((attempt) => {
            const isSelected = selectedIds.has(attempt.id);
            const ts = getRecordTimestamp(attempt.createdAt, attempt.updatedAt);

            return (
              <div
                key={attempt.id}
                id={`history-card-${attempt.id}`}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  isSelected
                    ? "bg-slate-900 border-indigo-500/60 ring-1 ring-indigo-500/30"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-750"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    id={`checkbox-history-${attempt.id}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectOne(attempt.id)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800 mt-1"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                          attempt.status === "SENT"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : attempt.status === "FAILED"
                            ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {attempt.status === "SENT" ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            SENT
                          </>
                        ) : attempt.status === "FAILED" ? (
                          <>
                            <XCircle className="w-3 h-3" />
                            FAILED
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            {attempt.status}
                          </>
                        )}
                      </span>

                      <span className="text-xs font-bold text-white">
                        {attempt.draft.companyName}
                      </span>
                      <span className="text-slate-500 text-xs">•</span>
                      <span className="text-xs font-medium text-slate-300">
                        {attempt.draft.jobTitle}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-0.5">
                      <p>
                        <span className="text-slate-500">From: </span>
                        <span className="font-mono text-slate-300">{attempt.senderEmail}</span>
                        <span className="text-slate-500 ml-3">To: </span>
                        <span className="font-mono text-slate-300">{attempt.recipientEmail}</span>
                      </p>
                      <p>
                        <span className="text-slate-500">Subject: </span>
                        <span className="text-slate-200">{attempt.subject}</span>
                      </p>
                      {attempt.draft.resume?.fileName && (
                        <p className="text-[11px] text-indigo-400">
                          Attached: {attempt.draft.resume.fileName}
                        </p>
                      )}
                      {attempt.errorMessage && (
                        <p className="text-rose-400 text-xs font-mono bg-rose-950/30 p-2 rounded-lg border border-rose-500/30 mt-1">
                          Error: {attempt.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center md:flex-col md:items-end justify-between w-full md:w-auto gap-2 flex-shrink-0">
                  <div className="text-left md:text-right text-[11px] text-slate-400" title={ts.display}>
                    <p className="flex items-center md:justify-end gap-1 font-medium">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{ts.display}</span>
                    </p>
                    {attempt.gmailMessageId && (
                      <p className="font-mono text-[10px] text-slate-400 mt-1">
                        Msg ID: {attempt.gmailMessageId.slice(0, 16)}...
                      </p>
                    )}
                  </div>

                  <button
                    id={`btn-delete-history-${attempt.id}`}
                    onClick={() => handleOpenDeleteSingle(attempt)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Permanently Delete Send Record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
            setAttemptsToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="send attempt record"
        count={attemptsToDelete.length}
        items={attemptsToDelete.map((a) => ({
          id: a.id,
          title: `${a.draft.companyName} — ${a.recipientEmail}`,
          subtitle: `Status: ${a.status} | Subject: ${a.subject}`,
        }))}
        isDeleting={isDeleting}
        warningNote="Hard delete permanently erases this audit log entry from the database."
      />
    </div>
  );
}
