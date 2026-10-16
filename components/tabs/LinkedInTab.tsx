"use client";

import React, { useState, useMemo } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Eye,
  Trash2,
  Search,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { getRecordTimestamp, getEffectiveTimestampTime } from "@/lib/utils/formatDate";

export interface ExtractedLinkItem {
  id: string;
  screenshotId: string;
  url: string;
  urlType: string;
  title: string | null;
  createdAt: string;
  updatedAt?: string;
  screenshot?: {
    id: string;
    fileName: string;
    filePath: string;
    result?: {
      category: string;
      companyName: string | null;
      jobTitle: string | null;
      location: string | null;
    } | null;
  };
}

interface LinkedInTabProps {
  links: ExtractedLinkItem[];
  onViewScreenshot: (screenshotId: string) => void;
  onRefresh?: () => void;
}

export default function LinkedInTab({
  links,
  onViewScreenshot,
  onRefresh,
}: LinkedInTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [linksToDelete, setLinksToDelete] = useState<ExtractedLinkItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter and sort links
  const filteredLinks = useMemo(() => {
    const list = links.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchUrl = item.url.toLowerCase().includes(q);
      const matchTitle = (item.title || "").toLowerCase().includes(q);
      const matchCompany = (item.screenshot?.result?.companyName || "").toLowerCase().includes(q);
      const matchJob = (item.screenshot?.result?.jobTitle || "").toLowerCase().includes(q);
      return matchUrl || matchTitle || matchCompany || matchJob;
    });

    return list.sort((a, b) => {
      if (sortBy === "recent") {
        return getEffectiveTimestampTime(b.createdAt, b.updatedAt) - getEffectiveTimestampTime(a.createdAt, a.updatedAt);
      }
      if (sortBy === "oldest") {
        return getEffectiveTimestampTime(a.createdAt, a.updatedAt) - getEffectiveTimestampTime(b.createdAt, b.updatedAt);
      }
      if (sortBy === "title") {
        const titleA = a.title || a.screenshot?.result?.companyName || a.url;
        const titleB = b.title || b.screenshot?.result?.companyName || b.url;
        return titleA.localeCompare(titleB);
      }
      return 0;
    });
  }, [links, searchQuery, sortBy]);

  const selectedLinks = filteredLinks.filter((item) => selectedIds.has(item.id));
  const isAllSelected = filteredLinks.length > 0 && filteredLinks.every((item) => selectedIds.has(item.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filteredLinks.forEach((item) => next.delete(item.id));
    } else {
      filteredLinks.forEach((item) => next.add(item.id));
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

  const handleOpenDeleteSingle = (item: ExtractedLinkItem) => {
    setLinksToDelete([item]);
    setDeleteConfirmOpen(true);
  };

  const handleOpenDeleteBulk = () => {
    if (selectedLinks.length === 0) return;
    setLinksToDelete(selectedLinks);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (linksToDelete.length === 0) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: linksToDelete.map((l) => l.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete link(s)");
      }

      const deletedIds = new Set(linksToDelete.map((l) => l.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      setDeleteConfirmOpen(false);
      setLinksToDelete([]);
      setFeedbackMessage({
        type: "success",
        text: `Permanently deleted ${data.count ?? linksToDelete.length} LinkedIn URL${(data.count ?? linksToDelete.length) === 1 ? "" : "s"} from database.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      onRefresh?.();
    } catch (err: unknown) {
      alert("Error deleting links: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Summary */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Extracted LinkedIn Links</h3>
          <p className="text-xs text-slate-400">
            Deduplicated LinkedIn profiles, company pages, job postings, and outreach links from uploaded screenshots.
          </p>
        </div>
        <span className="px-3 py-1 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold">
          {links.length} Unique Links
        </span>
      </div>

      {/* Search, Sort, and Bulk Action Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-linkedin"
              type="text"
              placeholder="Search by title, company, or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recent" | "oldest" | "title")}
              className="bg-transparent text-xs text-white border-none focus:outline-none cursor-pointer"
            >
              <option value="recent" className="bg-slate-900 text-white">Recent First</option>
              <option value="oldest" className="bg-slate-900 text-white">Oldest First</option>
              <option value="title" className="bg-slate-900 text-white">Title / Company (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Bulk Selection Actions */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input
                id="checkbox-select-all-linkedin"
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-700 text-sky-600 focus:ring-sky-500 w-4 h-4 bg-slate-800"
              />
              <span>Select All ({filteredLinks.length})</span>
            </label>
            {selectedLinks.length > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Deselect
              </button>
            )}
          </div>

          {selectedLinks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-bulk-delete-linkedin"
                onClick={handleOpenDeleteBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold transition-colors"
                title="Permanently delete selected LinkedIn URLs"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Selected ({selectedLinks.length})</span>
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
      {filteredLinks.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <LinkedInIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No LinkedIn Links Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? "No links matched your search query. Try clearing the search filter."
              : "Upload screenshots of LinkedIn recruiter messages or posts to automatically extract and catalog all profile & job URLs."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredLinks.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const ts = getRecordTimestamp(item.createdAt, item.updatedAt, { compact: true });

            return (
              <div
                key={item.id}
                id={`linkedin-card-${item.id}`}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 group ${
                  isSelected
                    ? "bg-slate-900 border-sky-500/60 ring-1 ring-sky-500/30"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        id={`checkbox-linkedin-${item.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(item.id)}
                        className="rounded border-slate-700 text-sky-600 focus:ring-sky-500 w-4 h-4 bg-slate-800"
                      />
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-wide">
                        {item.screenshot?.result?.category || "LINKEDIN"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.screenshot && (
                        <button
                          onClick={() => onViewScreenshot(item.screenshot!.id)}
                          className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="View Source Screenshot"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(item.id, item.url)}
                        className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Copy URL"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        id={`btn-delete-linkedin-${item.id}`}
                        onClick={() => handleOpenDeleteSingle(item)}
                        className="p-1.5 rounded-md bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Permanently Delete URL"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-white truncate mb-1">
                    {item.title || item.screenshot?.result?.jobTitle || item.screenshot?.result?.companyName || "LinkedIn Opportunity"}
                  </h4>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-sky-400 hover:underline break-all block mb-1"
                  >
                    {item.url}
                  </a>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1" title={ts.display}>
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{ts.display}</span>
                  </div>
                </div>

                {item.screenshot && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[200px]">Source: {item.screenshot.fileName}</span>
                    {item.screenshot.result?.companyName && (
                      <span className="font-medium text-slate-300 truncate max-w-[150px]">
                        {item.screenshot.result.companyName}
                      </span>
                    )}
                  </div>
                )}
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
            setLinksToDelete([]);
          }
        }}
        onConfirm={handleExecuteDelete}
        itemType="LinkedIn URL"
        count={linksToDelete.length}
        items={linksToDelete.map((l) => ({
          id: l.id,
          title: l.title || l.screenshot?.result?.companyName || "LinkedIn URL",
          subtitle: l.url,
        }))}
        isDeleting={isDeleting}
        warningNote="Hard delete permanently removes this URL from your catalog and database."
      />
    </div>
  );
}
