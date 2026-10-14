"use client";

import React from "react";
import {
  Image as ImageIcon,
  Mail,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";

export interface SummaryStats {
  totalScreenshots: number;
  emailDraftsCount: number;
  linkedInLinksCount: number;
  applicationLinksCount: number;
  manualReviewCount: number;
  sentCount: number;
  failedSendCount: number;
}

interface SummaryCardsProps {
  stats: SummaryStats;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SummaryCards({
  stats,
  activeTab,
  onTabChange,
}: SummaryCardsProps) {
  const cards = [
    {
      id: "overview",
      label: "Screenshots",
      value: stats.totalScreenshots,
      icon: ImageIcon,
      color: "from-blue-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/30",
      activeBorder: "border-cyan-400 ring-2 ring-cyan-500/20",
    },
    {
      id: "emails",
      label: "Email Drafts",
      value: stats.emailDraftsCount,
      icon: Mail,
      color: "from-indigo-500/20 to-purple-500/10 text-indigo-400 border-indigo-500/30",
      activeBorder: "border-indigo-400 ring-2 ring-indigo-500/20",
    },
    {
      id: "linkedin",
      label: "LinkedIn Links",
      value: stats.linkedInLinksCount,
      icon: LinkedInIcon,
      color: "from-sky-500/20 to-blue-500/10 text-sky-400 border-sky-500/30",
      activeBorder: "border-sky-400 ring-2 ring-sky-500/20",
    },
    {
      id: "applications",
      label: "Application Links",
      value: stats.applicationLinksCount,
      icon: ExternalLink,
      color: "from-violet-500/20 to-fuchsia-500/10 text-violet-400 border-violet-500/30",
      activeBorder: "border-violet-400 ring-2 ring-violet-500/20",
    },
    {
      id: "review",
      label: "Manual Review",
      value: stats.manualReviewCount,
      icon: AlertTriangle,
      color: "from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30",
      activeBorder: "border-amber-400 ring-2 ring-amber-500/20",
    },
    {
      id: "history",
      label: "Sent Emails",
      value: stats.sentCount,
      icon: CheckCircle,
      color: "from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30",
      activeBorder: "border-emerald-400 ring-2 ring-emerald-500/20",
    },
    {
      id: "history",
      label: "Failed Sends",
      value: stats.failedSendCount,
      icon: XCircle,
      color: "from-rose-500/20 to-red-500/10 text-rose-400 border-rose-500/30",
      activeBorder: "border-rose-400 ring-2 ring-rose-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isActive = activeTab === card.id;

        return (
          <button
            key={`${card.id}-${idx}`}
            id={`card-tab-${card.id}-${idx}`}
            onClick={() => onTabChange(card.id)}
            className={`p-3.5 rounded-2xl bg-slate-900/60 border text-left transition-all relative overflow-hidden group hover:scale-[1.02] cursor-pointer ${
              isActive
                ? `${card.activeBorder} shadow-lg shadow-indigo-950/40 bg-slate-850`
                : "border-slate-800 hover:border-slate-700"
            }`}
          >
            <div
              className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.color} opacity-40 rounded-full blur-2xl pointer-events-none`}
            />

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium tracking-wide">
                {card.label}
              </span>
              <div
                className={`p-1.5 rounded-lg border bg-gradient-to-br ${card.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="text-2xl font-bold text-white tracking-tight">
              {card.value}
            </div>
          </button>
        );
      })}
    </div>
  );
}
