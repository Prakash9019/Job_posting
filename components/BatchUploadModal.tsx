"use client";

import React, { useState, useRef } from "react";
import { finishBatch } from "@/lib/client/batch";
import {
  X,
  Upload,
  Trash2,
  FileText,
  AlertCircle,
  Loader2,
  Layers,
} from "lucide-react";

interface ResumeItem {
  id: string;
  fileName: string;
  isActive: boolean;
}

interface BatchUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  resumes: ResumeItem[];
  onUploadSuccess: (batchId: string) => void;
}

interface FileWithMeta {
  file: File;
  id: string;
  previewUrl: string;
  sizeFormatted: string;
}

export default function BatchUploadModal({
  isOpen,
  onClose,
  userId,
  resumes,
  onUploadSuccess,
}: BatchUploadModalProps) {
  const [files, setFiles] = useState<FileWithMeta[]>([]);
  const [batchName, setBatchName] = useState("");
  const defaultResumeId = resumes.find((r) => r.isActive)?.id || resumes[0]?.id || "";
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const effectiveResumeId = selectedResumeId || defaultResumeId;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState<number>(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleFilesAdded = (newFileList: FileList | File[]) => {
    setError(null);
    const addedArray = Array.from(newFileList);

    // Limit check
    if (files.length + addedArray.length > 80) {
      setError(`Cannot add more than 80 files per batch. Currently have ${files.length}.`);
      return;
    }

    const newItems: FileWithMeta[] = [];
    for (const f of addedArray) {
      // Validate file type
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
      if (!validTypes.includes(f.type) && !f.name.match(/\.(png|jpe?g|webp|pdf)$/i)) {
        continue;
      }

      // Check duplicates by filename and size in current list
      const isDuplicate = files.some(
        (existing) => existing.file.name === f.name && existing.file.size === f.size
      );
      if (isDuplicate) continue;

      const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : "";
      newItems.push({
        file: f,
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        previewUrl,
        sizeFormatted: formatFileSize(f.size),
      });
    }

    setFiles((prev) => [...prev, ...newItems]);
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleClearAll = () => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Please add at least 1 screenshot to upload.");
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress("Uploading screenshots and verifying hashes...");

      let batchId = "";
      for (let index = 0; index < files.length; index++) {
        const item = files[index];
        if (item.file.size > 3 * 1024 * 1024) throw new Error(item.file.name + " exceeds 3 MB. Choose a smaller image.");
        setUploadProgress("Uploading " + (index + 1) + " of " + files.length + "…");
        const formData = new FormData();
        formData.set("name", batchName.trim() || "Batch - " + new Date().toLocaleString());
        if (effectiveResumeId) formData.set("resumeId", effectiveResumeId);
        if (batchId) formData.set("batchId", batchId);
        formData.set("screenshot", item.file);
        const res = await fetch("/api/batches", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Upload failed. Uploaded files remain in Overview & Batches.");
        batchId = data.batch.id;
      }
      setUploadProgress("Processing screenshots. Keep this page open…");
      await finishBatch(batchId, concurrency, count => setUploadProgress("Prepared " + count + " screenshots. Keep this page open…"));
      onUploadSuccess(batchId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Bulk Screenshot Upload</h2>
              <p className="text-xs text-slate-400">
                Upload 1 to 80 LinkedIn post or job screenshots for {userId === "user_a" ? "User A" : "User B"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Batch Name & Resume Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Batch Name (Optional)
              </label>
              <input
                id="input-batch-name"
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., Tech Recruiter Posts March"
                disabled={isUploading}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Active Resume to Attach
              </label>
              <select
                id="select-batch-resume"
                value={effectiveResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                disabled={isUploading}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                {resumes.length === 0 ? (
                  <option value="">No resumes uploaded yet (please upload a resume first)</option>
                ) : (
                  resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fileName} {r.isActive ? " (Active)" : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Concurrency Settings */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
            <div>
              <span className="text-xs font-semibold text-slate-300">Processing Concurrency</span>
              <p className="text-[11px] text-slate-400">Number of parallel Gemini extractions</p>
            </div>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
            >
              <option value="1">1 (Gentle)</option>
              <option value="2">2</option>
              <option value="3">3 (Recommended)</option>
              <option value="5">5 (Fast)</option>
            </select>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleFilesAdded(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/70 rounded-2xl p-4 sm:p-6 text-center cursor-pointer transition-colors bg-slate-800/20 hover:bg-indigo-500/5 group"
          >
            <input
              id="file-input-screenshots"
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
              multiple
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              className="hidden"
            />
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto mb-2 sm:mb-3 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <p className="text-xs sm:text-sm font-semibold text-white mb-1">
              Tap or drag screenshots here
            </p>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Camera photos, PNG, JPG, or PDF (up to 80 files per batch)
            </p>
          </div>

          {/* File Previews List */}
          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  Selected Screenshots ({files.length}/80)
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isUploading}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-56 overflow-y-auto p-1">
                {files.map((item) => (
                  <div
                    key={item.id}
                    className="relative group rounded-xl bg-slate-800/70 border border-slate-700/80 overflow-hidden flex flex-col p-1.5"
                  >
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center relative mb-1.5">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-slate-500" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.id)}
                        disabled={isUploading}
                        aria-label={"Remove " + item.file.name}
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-slate-300 hover:text-rose-400 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[11px] font-medium text-slate-300 truncate" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="text-[10px] text-slate-500">{item.sizeFormatted}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Banner */}
          {isUploading && (
            <div className="p-4 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 text-indigo-400" />
              <div>
                <p className="font-semibold">{uploadProgress}</p>
                <p className="text-[11px] text-indigo-400/80">
                  AI is extracting job info, links, contacts, and generating application drafts...
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-batch-upload"
              type="submit"
              disabled={isUploading || files.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Batch...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Start Batch ({files.length} items)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

