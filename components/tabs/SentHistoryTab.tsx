"use client";

import React from "react";
import { CheckCircle2, XCircle, Clock, Mail } from "lucide-react";

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
}

export default function SentHistoryTab({ attempts }: SentHistoryTabProps) {
  return (
    <div className="space-y-4">
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

      {attempts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No Send Attempts Recorded</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Once you approve and dispatch email drafts through your connected Gmail account, records will be tracked here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-750 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
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

              <div className="text-left md:text-right text-[11px] text-slate-500 flex-shrink-0">
                <p>{new Date(attempt.createdAt).toLocaleString()}</p>
                {attempt.gmailMessageId && (
                  <p className="font-mono text-[10px] text-slate-400 mt-1">
                    Msg ID: {attempt.gmailMessageId.slice(0, 16)}...
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
