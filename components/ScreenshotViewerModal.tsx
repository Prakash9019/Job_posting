"use client";

import React from "react";
import { X, ExternalLink } from "lucide-react";

interface ScreenshotViewerModalProps {
  screenshotId: string | null;
  userId?: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function ScreenshotViewerModal({
  screenshotId,
  onClose,
  onDeleted,
}: ScreenshotViewerModalProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  if (!screenshotId) return null;

  const fileUrl = `/api/files/screenshot/${screenshotId}`;

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to permanently delete this screenshot?\n\nThis will completely remove the image from storage (disk/Vercel Blob) and the database."
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/screenshots/${screenshotId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        onDeleted?.();
        onClose();
      } else {
        alert(data.error || "Failed to delete screenshot");
      }
    } catch (err) {
      alert("Error deleting screenshot: " + String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <span className="text-xs font-semibold text-slate-300">
            Screenshot Inspection Preview
          </span>
          <div className="flex items-center gap-3">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Raw</span>
            </a>

            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 transition-all disabled:opacity-50"
              title="Permanently remove image and record"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>{isDeleting ? "Deleting..." : "Delete Image"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt="Screenshot Preview"
            className="max-w-full max-h-[75vh] object-contain rounded-lg border border-slate-800 shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}
