"use client";

import React, { useState, useMemo } from "react";
import {
  Mail,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  RotateCw,
  Send,
  Trash2,
  Edit3,
  Save,
  Check,
  Eye,
  Sparkles,
  Upload,
  Loader2,
  Plus,
  X,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";
import DeleteConfirmationModal, { DeleteItemPreview } from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp, getEffectiveTimestampTime } from "@/lib/utils/formatDate";

export interface EmailDraftItem {
  id: string;
  batchId: string;
  userId: string;
  companyName: string;
  jobTitle: string;
  recipientEmail: string;
  subject: string;
  body: string;
  generationStatus: string;
  reviewStatus: string;
  createdAt: string;
  updatedAt?: string;
  resume?: {
    id: string;
    fileName: string;
  } | null;
  screenshot?: {
    id: string;
    fileName: string;
    filePath: string;
  } | null;
  sendAttempts?: {
    id: string;
    status: string;
    createdAt: string;
  }[];
}

interface EmailsTabProps {
  drafts: EmailDraftItem[];
  userId?: string;
  senderEmail?: string;
  senderName?: string;
  activeResumeName?: string;
  onRefresh: () => void;
  onOpenSendConfirmation: (selectedDrafts: EmailDraftItem[]) => void;
  onViewScreenshot: (screenshotId: string) => void;
}

export default function EmailsTab({
  drafts,
  senderEmail,
  senderName,
  activeResumeName,
  onRefresh,
  onOpenSendConfirmation,
  onViewScreenshot,
}: EmailsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "company">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draftsToDelete, setDraftsToDelete] = useState<EmailDraftItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    subject: string;
    body: string;
    recipientEmail: string;
    companyName: string;
    jobTitle: string;
  }>({
    subject: "",
    body: "",
    recipientEmail: "",
    companyName: "",
    jobTitle: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Modal for creating a new tailored draft (Screenshot or pasted JD)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newMode, setNewMode] = useState<"screenshot" | "paste">("screenshot");
  const [pastedJD, setPastedJD] = useState("");
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState("");
  const [uploadedImageMime, setUploadedImageMime] = useState("image/png");
  const [manualEmail, setManualEmail] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);
  const [newModalError, setNewModalError] = useState<string | null>(null);
  const [newModalSuccess, setNewModalSuccess] = useState<string | null>(null);

  const handleScreenshotFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImageName(file.name);
    setUploadedImageMime(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateTailoredDraft = async () => {
    setIsGeneratingNew(true);
    setNewModalError(null);
    try {
      const payload: Record<string, string> = {};
      if (newMode === "screenshot") {
        if (!uploadedImageBase64) throw new Error("Please select a screenshot image to upload.");
        payload.image = uploadedImageBase64;
        payload.mimeType = uploadedImageMime;
      } else {
        if (!pastedJD.trim()) throw new Error("Please paste a job description or post text.");
        payload.jobDescription = pastedJD.trim();
      }

      if (manualEmail.trim()) payload.recipientEmail = manualEmail.trim();
      if (manualCompany.trim()) payload.companyName = manualCompany.trim();
      if (manualRole.trim()) payload.jobTitle = manualRole.trim();

      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate tailored application email.");
      }

      setNewModalSuccess(data.badge || `✓ Tailored ATS Resume Attached (Score: ${data.atsScore?.finalScore || 90}/100)`);
      setTimeout(() => {
        setIsNewModalOpen(false);
        setNewModalSuccess(null);
        setPastedJD("");
        setUploadedImageBase64(null);
        setUploadedImageName("");
        setManualEmail("");
        setManualCompany("");
        setManualRole("");
        onRefresh();
      }, 1500);
    } catch (err) {
      setNewModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingNew(false);
    }
  };

  // Filter and sort drafts based on search, status, and sort option
  const filteredDrafts = useMemo(() => {
    const list = drafts.filter((draft) => {
      if (draft.sendAttempts?.some(attempt => attempt.status === "SENT")) return false;
      // Status filter
      if (statusFilter !== "ALL" && draft.reviewStatus !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesCompany = draft.companyName.toLowerCase().includes(q);
        const matchesJob = draft.jobTitle.toLowerCase().includes(q);
        const matchesEmail = draft.recipientEmail.toLowerCase().includes(q);
        const matchesSubject = draft.subject.toLowerCase().includes(q);
        const matchesBody = draft.body.toLowerCase().includes(q);
        return matchesCompany || matchesJob || matchesEmail || matchesSubject || matchesBody;
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
        return a.companyName.localeCompare(b.companyName);
      }
      return 0;
    });
  }, [drafts, statusFilter, searchQuery, sortBy]);

  const selectableDrafts = filteredDrafts;
  const selectedDrafts = filteredDrafts.filter(draft => selectedIds.has(draft.id));
  const sendableDrafts = selectedDrafts.filter(draft => draft.reviewStatus !== "REJECTED" && !draft.sendAttempts?.some(attempt => ["SENDING", "UNKNOWN"].includes(attempt.status)));

  // Select All scoped to filtered results
  const isAllSelected =
    selectableDrafts.length > 0 &&
    selectableDrafts.every((d) => selectedIds.has(d.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      selectableDrafts.forEach((d) => next.delete(d.id));
    } else {
      selectableDrafts.forEach((d) => next.add(d.id));
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

  // Start editing a draft
  const handleStartEdit = (draft: EmailDraftItem) => {
    setEditingDraftId(draft.id);
    setEditFormData({
      subject: draft.subject,
      body: draft.body,
      recipientEmail: draft.recipientEmail,
      companyName: draft.companyName,
      jobTitle: draft.jobTitle,
    });
  };

  const handleSaveEdit = async (draftId: string) => {
    try {
      setIsSaving(true);
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editFormData),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to update draft");
      }

      setEditingDraftId(null);
      onRefresh();
    } catch (err: unknown) {
      alert("Error saving draft: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle draft review approval
  const handleUpdateStatus = async (draftId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reviewStatus: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch (err) {
      alert("Error updating status: " + String(err));
    }
  };

  // Regenerate draft with Gemini
  const handleRegenerate = async (draftId: string) => {
    try {
      setRegeneratingId(draftId);
      const res = await fetch(`/api/drafts/${draftId}/regenerate`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to regenerate draft");
      }
    } catch (err) {
      alert("Error regenerating draft: " + String(err));
    } finally {
      setRegeneratingId(null);
    }
  };

  // Open delete confirmation for a single draft
  const handleOpenDeleteSingle = (draft: EmailDraftItem) => {
    setDraftsToDelete([draft]);
    setDeleteConfirmOpen(true);
  };

  // Open delete confirmation for selected drafts
  const handleOpenDeleteBulk = () => {
    if (selectedDrafts.length === 0) return;
    setDraftsToDelete(selectedDrafts);
    setDeleteConfirmOpen(true);
  };

  // Execute hard permanent deletion
  const handleExecuteDelete = async () => {
    if (draftsToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/drafts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: draftsToDelete.map((d) => d.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete drafts");
      }

      const deletedIds = new Set(draftsToDelete.map((d) => d.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      setDeleteConfirmOpen(false);
      setDraftsToDelete([]);
      setFeedbackMessage({
        type: "success",
        text: `Permanently deleted ${data.count ?? draftsToDelete.length} draft${(data.count ?? draftsToDelete.length) === 1 ? "" : "s"} from database.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      onRefresh();
    } catch (err: unknown) {
      alert("Error deleting drafts: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk approve selected
  const handleBulkApprove = async () => {
    const ids = selectedDrafts.map((draft) => draft.id);
    if (ids.length === 0) return;

    for (const id of ids) {
      const response = await fetch(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reviewStatus: "APPROVED" }),
      });
      if (!response.ok) {
        alert("Some drafts could not be approved. Refresh and try again.");
        onRefresh();
        return;
      }
    }
    onRefresh();
  };

  // Handle Bulk Send Trigger
  const handleTriggerBulkSend = () => {
    const selectedDraftsList = sendableDrafts;
    if (selectedDraftsList.length === 0) {
      alert("Please select at least one non-rejected draft to send.");
      return;
    }
    onOpenSendConfirmation(selectedDraftsList);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Select all to send your batch together. Review the selected emails, then confirm Approve &amp; Send. Successful sends move to Sent History; failed drafts stay here. Selection applies to the current filters and excludes rejected or pending sends.</p>
      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-drafts"
              type="text"
              placeholder="Search by company, role, email, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700/60 text-xs">
            {["ALL", "NEEDS_REVIEW", "APPROVED", "REJECTED"].map((st) => (
              <button
                key={st}
                id={`filter-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  statusFilter === st
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {st === "ALL"
                  ? "All"
                  : st === "NEEDS_REVIEW"
                  ? "Needs Review"
                  : st === "APPROVED"
                  ? "Approved"
                  : "Rejected"}
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

          <button
            id="btn-open-tailored-draft-modal"
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition-all cursor-pointer shrink-0"
            title="Upload a job screenshot or paste a JD to auto-tailor your resume and draft an email"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>+ Tailor &amp; Draft</span>
          </button>
        </div>

        {/* Bulk Selection Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input
                id="checkbox-select-all"
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
              />
              <span>Select All ({selectableDrafts.length})</span>
            </label>
            {selectedDrafts.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Deselect
              </button>
            )}
          </div>

          {selectedDrafts.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-bulk-delete"
                onClick={handleOpenDeleteBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold transition-colors"
                title="Permanently delete selected drafts"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete ({selectedDrafts.length})</span>
              </button>

              <button
                id="btn-bulk-approve"
                onClick={handleBulkApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve ({selectedDrafts.length})</span>
              </button>

              <button
                id="btn-bulk-send"
                onClick={handleTriggerBulkSend}
                disabled={sendableDrafts.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Review &amp; Send ({sendableDrafts.length})</span>
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

      {/* Drafts List */}
      {filteredDrafts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No Email Drafts Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No drafts matched your search query. Try clearing the filter."
              : "Upload a batch of screenshots with job details and contact emails to generate personalized drafts."}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredDrafts.map((draft) => {
            const isSelectable = selectableDrafts.some(item => item.id === draft.id);
            const isSelected = isSelectable && selectedIds.has(draft.id);
            const isEditing = editingDraftId === draft.id;
            const isRegenerating = regeneratingId === draft.id;
            const hasSentAttempt = draft.sendAttempts?.[0]?.status === "SENT";
            const ts = getRecordTimestamp(draft.createdAt, draft.updatedAt);

            return (
              <div
                key={draft.id}
                id={`draft-card-${draft.id}`}
                className={`p-5 rounded-2xl border transition-all ${
                  isSelected
                    ? "bg-slate-900 border-indigo-500/60 ring-1 ring-indigo-500/30"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-750"
                }`}
              >
                {/* Header row: Checkbox, Details, Status, Quick Actions */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      id={`checkbox-draft-${draft.id}`}
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelectable}
                      onChange={() => handleToggleSelectOne(draft.id)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800 mt-0.5 sm:mt-0"
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {draft.companyName}
                        </span>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-xs font-medium text-indigo-400">
                          {draft.jobTitle}
                        </span>
                        {(draft.generationStatus?.includes("ATS Tailored") || draft.generationStatus?.includes("Tailored ATS")) && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                            ✓ Tailored ATS Resume Attached (Score: {draft.generationStatus.match(/→\s*(\d+)\/100/)?.[1] || draft.generationStatus.match(/(\d+)\/100/)?.[1] || "90+"}/100)
                          </span>
                        )}
                        {hasSentAttempt && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            SENT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                        <span className="font-mono text-slate-300">
                          To: {draft.recipientEmail}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <FileText className={`w-3.5 h-3.5 ${draft.resume?.fileName?.startsWith("Resume_") || draft.resume?.fileName === "ATS_Optimized_Resume.pdf" ? "text-emerald-400" : "text-indigo-400"}`} />
                          Attachment:{" "}
                          <span className={`font-semibold ${draft.resume?.fileName?.startsWith("Resume_") || draft.resume?.fileName === "ATS_Optimized_Resume.pdf" ? "text-emerald-300 font-mono" : "text-slate-200"}`}>
                            {draft.resume?.fileName === "ATS_Optimized_Resume.pdf" ? "Resume.pdf (Tailored)" : (draft.resume?.fileName || (draft.generationStatus?.includes("ATS Tailored") ? "Resume.pdf (Tailored)" : (activeResumeName || "No Resume Attached")))}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium" title={ts.display}>
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{ts.display}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Badges & Status Controls */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Review Status Pill */}
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                        draft.reviewStatus === "APPROVED"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : draft.reviewStatus === "REJECTED"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {draft.reviewStatus === "APPROVED" ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          Approved
                        </>
                      ) : draft.reviewStatus === "REJECTED" ? (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          Rejected
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          Needs Review
                        </>
                      )}
                    </span>

                    {/* Screenshot thumbnail preview button */}
                    {draft.screenshot && (
                      <button
                        onClick={() => onViewScreenshot(draft.screenshot!.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="View Original Screenshot"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}

                    {/* AI Regenerate button */}
                    <button
                      id={`btn-regenerate-${draft.id}`}
                      onClick={() => handleRegenerate(draft.id)}
                      disabled={isRegenerating}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 transition-colors"
                      title="Regenerate Draft with AI"
                    >
                      <RotateCw
                        className={`w-4 h-4 ${isRegenerating ? "animate-spin text-indigo-400" : ""}`}
                      />
                    </button>

                    {/* Edit button */}
                    <button
                      id={`btn-edit-${draft.id}`}
                      onClick={() =>
                        isEditing ? handleSaveEdit(draft.id) : handleStartEdit(draft)
                      }
                      disabled={isSaving}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title={isEditing ? "Save Draft" : "Edit Draft"}
                    >
                      {isEditing ? (
                        <Save className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Edit3 className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete draft */}
                    <button
                      id={`btn-delete-${draft.id}`}
                      onClick={() => handleOpenDeleteSingle(draft)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Permanently Delete Draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Draft Content: Subject and Body */}
                <div className="border-t border-slate-800 pt-3 text-xs text-slate-300 space-y-1 break-all">
                  <p><strong>From:</strong> {senderEmail ? `${senderName || ""} <${senderEmail}>` : "Select and connect your From address above"}</p>
                  <p><strong>To:</strong> {isEditing ? editFormData.recipientEmail : draft.recipientEmail}</p>
                </div>
                {isEditing ? (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Company</label>
                        <input
                          type="text"
                          value={editFormData.companyName}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, companyName: e.target.value })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Job Title</label>
                        <input
                          type="text"
                          value={editFormData.jobTitle}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, jobTitle: e.target.value })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Recipient Email</label>
                        <input
                          type="email"
                          value={editFormData.recipientEmail}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, recipientEmail: e.target.value })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Subject</label>
                      <input
                        type="text"
                        value={editFormData.subject}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, subject: e.target.value })
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Body</label>
                      <textarea
                        rows={6}
                        value={editFormData.body}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, body: e.target.value })
                        }
                        className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-sans leading-relaxed"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingDraftId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(draft.id)}
                        disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Subject:</span>
                      <span className="text-xs text-white font-medium">{draft.subject}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {draft.body}
                    </div>

                    {/* Bottom action controls */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {draft.reviewStatus !== "APPROVED" ? (
                          <button
                            id={`btn-approve-single-${draft.id}`}
                            onClick={() => handleUpdateStatus(draft.id, "APPROVED")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve Draft</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(draft.id, "NEEDS_REVIEW")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 text-xs font-medium transition-colors"
                          >
                            <span>Mark Needs Review</span>
                          </button>
                        )}
                      </div>

                      <button
                        id={`btn-send-single-${draft.id}`}
                        onClick={() => onOpenSendConfirmation([draft])}
                        disabled={draft.reviewStatus !== "APPROVED"}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow transition-all"
                        title={
                          draft.reviewStatus !== "APPROVED"
                            ? "Draft must be approved first"
                            : "Send email draft via Gmail"
                        }
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Now</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Sticky Mobile Bottom Action Bar when items selected */}
      {selectedDrafts.length > 0 && (
        <div className="md:hidden fixed bottom-4 left-3 right-3 z-40 p-3 rounded-2xl bg-slate-900/95 border border-indigo-500/50 shadow-2xl backdrop-blur-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
              {selectedDrafts.length}
            </span>
            <span className="text-xs font-semibold text-slate-200 truncate">
              Selected
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleBulkApprove}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve</span>
            </button>
            <button
              onClick={handleTriggerBulkSend}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send All ({selectedDrafts.length})</span>
            </button>
          </div>
        </div>
      )}
      {/* Modal: New Tailored Email from Screenshot or Pasted JD */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Auto-Tailor Resume &amp; Draft Email</h3>
                  <p className="text-[11px] text-slate-400">Gemini extraction (temp 0) + TeXLive PDF compiler</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isGeneratingNew) setIsNewModalOpen(false);
                }}
                disabled={isGeneratingNew}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setNewMode("screenshot")}
                className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  newMode === "screenshot"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Screenshot</span>
              </button>
              <button
                type="button"
                onClick={() => setNewMode("paste")}
                className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  newMode === "paste"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Paste Job Description</span>
              </button>
            </div>

            {newMode === "screenshot" ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Job Posting / Recruiter Post Screenshot
                </label>
                <div className="relative border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-5 text-center bg-slate-950/40 transition-colors">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleScreenshotFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-200">
                    {uploadedImageName ? uploadedImageName : "Drop job screenshot or click to browse"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">PNG, JPG, or WebP</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Job Description / Role Requirements
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste the target job description, recruiter post, or LinkedIn message here..."
                  value={pastedJD}
                  onChange={(e) => setPastedJD(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none font-sans"
                />
              </div>
            )}

            {/* Optional manual overrides */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-1">Recipient Email</label>
                <input
                  type="email"
                  placeholder="Extracted via AI"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-1">Company</label>
                <input
                  type="text"
                  placeholder="Extracted via AI"
                  value={manualCompany}
                  onChange={(e) => setManualCompany(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-1">Role Title</label>
                <input
                  type="text"
                  placeholder="Extracted via AI"
                  value={manualRole}
                  onChange={(e) => setManualRole(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {newModalError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{newModalError}</span>
              </div>
            )}

            {newModalSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{newModalSuccess}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                disabled={isGeneratingNew}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTailoredDraft}
                disabled={isGeneratingNew}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isGeneratingNew ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing &amp; Tailoring Resume...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate &amp; Attach Tailored Resume</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteConfirmOpen(false);
            setDraftsToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="email draft"
        count={draftsToDelete.length}
        items={draftsToDelete.map((d) => ({
          id: d.id,
          title: `${d.companyName} — ${d.jobTitle}`,
          subtitle: `To: ${d.recipientEmail} | Subject: ${d.subject}`,
        }))}
        isDeleting={isDeleting}
        warningNote="Hard delete will permanently erase the draft and any send attempt logs from the database."
      />
    </div>
  );
}
