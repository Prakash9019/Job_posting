"use client";

import React, { useState } from "react";
import { ExternalLink, Copy, Check, Eye } from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";

export interface ExtractedLinkItem {
  id: string;
  screenshotId: string;
  url: string;
  urlType: string;
  title: string | null;
  createdAt: string;
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
}

export default function LinkedInTab({ links, onViewScreenshot }: LinkedInTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
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

      {links.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <LinkedInIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No LinkedIn Links Extracted</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Upload screenshots of LinkedIn recruiter messages or posts to automatically extract and catalog all profile & job URLs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {links.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-3 group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-wide">
                    {item.screenshot?.result?.category || "LINKEDIN"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {item.screenshot && (
                      <button
                        onClick={() => onViewScreenshot(item.screenshot!.id)}
                        className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                        title="View Source Screenshot"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(item.id, item.url)}
                      className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
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
                      className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-white truncate mb-1">
                  {item.title || item.screenshot?.result?.jobTitle || item.screenshot?.result?.companyName || "LinkedIn Opportunity"}
                </h4>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-sky-400 hover:underline break-all block"
                >
                  {item.url}
                </a>
              </div>

              {item.screenshot && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Source: {item.screenshot.fileName}</span>
                  {item.screenshot.result?.companyName && (
                    <span className="font-medium text-slate-300">
                      {item.screenshot.result.companyName}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
