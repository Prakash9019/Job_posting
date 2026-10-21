"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  FileText,
  Trash2,
  AlertCircle,
  Loader2,
  Eye,
  Check,
  FileCheck2,
  Clock,
} from "lucide-react";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp } from "@/lib/utils/formatDate";

export interface ResumeData {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  extractedText: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  resumes: ResumeData[];
  onRefresh: () => void;
  onOpenATS?: (resumeId: string) => void;
}

export default function ResumeModal({
  isOpen,
  onClose,
  userId,
  resumes,
  onRefresh,
  onOpenATS,
}: ResumeModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingResume, setViewingResume] = useState<ResumeData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resumesToDelete, setResumesToDelete] = useState<ResumeData[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        formData.append("files", fileList[i]);
      }
      formData.append("isActive", "true");

      const res = await fetch("/api/resumes", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to upload resume");
      }

      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch(`/api/resumes/${id}/active`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to set active resume");
      }
    } catch (err) {
      alert("Error setting active resume: " + String(err));
    }
  };

  const isAllSelected = resumes.length > 0 && resumes.every((r) => selectedIds.has(r.id));
  const selectedResumes = resumes.filter((r) => selectedIds.has(r.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      resumes.forEach((r) => next.delete(r.id));
    } else {
      resumes.forEach((r) => next.add(r.id));
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

  const handleOpenDeleteSingle = (resume: ResumeData) => {
    setResumesToDelete([resume]);
    setDeleteConfirmOpen(true);
  };

  const handleOpenDeleteBulk = () => {
    if (selectedResumes.length === 0) return;
    setResumesToDelete(selectedResumes);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (resumesToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/resumes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: resumesToDelete.map((r) => r.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete resumes");
      }

      const deletedIds = new Set(resumesToDelete.map((r) => r.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      if (viewingResume && deletedIds.has(viewingResume.id)) {
        setViewingResume(null);
      }

      setDeleteConfirmOpen(false);
      setResumesToDelete([]);
      onRefresh();
    } catch (err: unknown) {
      alert("Error deleting resume: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Resume Management</h2>
              <p className="text-xs text-slate-400">
                Uploaded resumes for {userId === "user_a" ? "User A" : "User B"} (attached to outgoing emails)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Button Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-5 text-center cursor-pointer bg-slate-800/30 hover:bg-indigo-500/5 transition-colors group"
          >
            <input
              id="file-input-resume"
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="application/pdf,image/png,image/jpeg,image/webp,image/*,text/plain,.tex,application/x-tex,text/x-tex"
              className="hidden"
            />
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                <span className="text-xs text-slate-300 font-medium">Processing resume and generating PDF...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 group-hover:scale-105 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-white">Upload Resume (PDF, LaTeX, or Screenshots)</p>
                  <p className="text-[11px] text-slate-400">PDF, TeX, or multiple screenshot pages. Image screenshots are automatically recreated into clean ATS PDFs.</p>
                </div>
              </div>
            )}
          </div>

          {/* Resumes List Header and Bulk Actions */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Saved Resumes ({resumes.length})
              </h3>

              {resumes.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 font-medium">
                    <input
                      id="checkbox-select-all-resumes"
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 bg-slate-800"
                    />
                    <span className="text-[11px]">Select All</span>
                  </label>
                  {selectedResumes.length > 0 && (
                    <>
                      <button
                        onClick={handleDeselectAll}
                        className="text-[11px] text-slate-400 hover:text-white underline"
                      >
                        Deselect
                      </button>
                      <button
                        id="btn-bulk-delete-resumes"
                        onClick={handleOpenDeleteBulk}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-[11px] font-semibold transition-colors"
                        title="Permanently delete selected resumes"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Delete ({selectedResumes.length})</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {resumes.length === 0 ? (
              <div className="text-center py-8 border border-slate-800/80 rounded-xl bg-slate-900/40">
                <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No resumes uploaded yet for this user.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {resumes.map((resume) => {
                  const isSelected = selectedIds.has(resume.id);
                  const ts = getRecordTimestamp(resume.createdAt, resume.updatedAt);

                  return (
                    <div
                      key={resume.id}
                      id={`resume-row-${resume.id}`}
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30"
                          : resume.isActive
                          ? "bg-indigo-950/30 border-indigo-500/40"
                          : "bg-slate-800/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          id={`checkbox-resume-${resume.id}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(resume.id)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 bg-slate-800"
                        />
                        <div
                          className={`p-2 rounded-lg ${
                            resume.isActive
                              ? "bg-indigo-600/20 text-indigo-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate max-w-[180px] sm:max-w-xs">
                              {resume.fileName}
                            </span>
                            {resume.isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400" title={ts.display}>
                            <span className="flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>{ts.display}</span>
                            </span>
                            <span>•</span>
                            <span>{(resume.fileSize / 1024).toFixed(0)} KB</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {onOpenATS && (
                          <button
                            onClick={() => {
                              onClose();
                              onOpenATS(resume.id);
                            }}
                            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-[11px] font-semibold border border-violet-500/30 transition-colors"
                            title="Analyze ATS Score for this Resume"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-violet-400" />
                            <span>ATS Score</span>
                          </button>
                        )}

                        <button
                          onClick={() => setViewingResume(resume)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="View Extracted Text"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {!resume.isActive && (
                          <button
                            onClick={() => handleSetActive(resume.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            <span>Make Active</span>
                          </button>
                        )}

                        <button
                          id={`btn-delete-resume-${resume.id}`}
                          onClick={() => handleOpenDeleteSingle(resume)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Permanently Delete Resume"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* View Extracted Text Drawer/Box */}
          {viewingResume && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-indigo-400">
                  Extracted Resume Content ({viewingResume.fileName})
                </span>
                <button
                  onClick={() => setViewingResume(null)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  Close Preview
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Gemini uses ONLY the facts in this text when generating emails. Never hallucinations.
              </p>
              <pre className="max-h-48 overflow-y-auto p-3 rounded-lg bg-slate-900 border border-slate-800/80 text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                {viewingResume.extractedText || "No text extracted."}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteConfirmOpen(false);
            setResumesToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="resume"
        count={resumesToDelete.length}
        items={resumesToDelete.map((r) => ({
          id: r.id,
          title: r.fileName,
          subtitle: `${(r.fileSize / 1024).toFixed(0)} KB | ${r.isActive ? "Active" : "Inactive"}`,
        }))}
        isDeleting={isDeleting}
        warningNote="Hard delete permanently wipes the PDF file from disk storage and erases the database record."
      />
    </div>
  );
}
