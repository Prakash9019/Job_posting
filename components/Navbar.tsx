"use client";

import React, { useState } from "react";
import {
  User,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  ExternalLink,
  Send,
  Info,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  gmailAccounts: {
    id: string;
    email: string;
    isConnected: boolean;
    lastSyncedAt: string | null;
  }[];
  resumes: {
    id: string;
    fileName: string;
  }[];
}

interface NavbarProps {
  users: UserProfile[];
  activeUserId: string;
  onSelectUser: (userId: string) => void;
  onOpenUpload: () => void;
  onOpenResumes: () => void;
  onRefresh: () => void;
  onLogout?: () => void;
  onOpenATS?: () => void;
}

export default function Navbar({
  users,
  activeUserId,
  onSelectUser,
  onOpenUpload,
  onOpenResumes,
  onRefresh,
  onLogout,
  onOpenATS,
}: NavbarProps) {
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showTestingModeInfo, setShowTestingModeInfo] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentUser = users.find((u) => u.id === activeUserId) || users[0];
  const connectedAccount = currentUser?.gmailAccounts?.find((g) => g.isConnected);
  const activeResume = currentUser?.resumes?.[0];

  const handleConnectGmail = async () => {
    try {
      setConnectingGmail(true);
      const res = await fetch("/api/auth/google/url");
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to generate OAuth URL. Check your Google credentials in .env.");
      }
    } catch (err) {
      alert("Error starting OAuth connection: " + String(err));
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!confirm(`Disconnect Gmail for ${currentUser?.name}?`)) return;
    try {
      setDisconnecting(true);
      const res = await fetch("/api/auth/google/disconnect", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || "Failed to disconnect Gmail");
      }
    } catch (err) {
      alert("Error disconnecting: " + String(err));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!connectedAccount) return;
    try {
      setSendingTest(true);
      const res = await fetch("/api/auth/google/test-email", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Test email successfully sent to ${data.result.recipientEmail} via Gmail API! OAuth sending is working and persisted.`);
        onRefresh();
      } else {
        alert(`❌ Test email failed: ${data.error}`);
      }
    } catch (err) {
      alert("Error sending test email: " + String(err));
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col gap-3">
        {/* Main Bar: Brand, User Switcher, ATS Button, Upload Button, Mobile Menu Toggle */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
          {/* Brand & User Switcher */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-base sm:text-lg shrink-0">
              AP
            </div>
            <div className="hidden xs:block">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">ApplyPilot</h1>
                <span className="hidden md:inline text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Dual-User Isolated
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">LinkedIn Screenshot Job Application Manager</p>
            </div>

            {/* User A / User B Toggle */}
            <div className="flex items-center bg-slate-800/80 p-0.5 sm:p-1 rounded-xl border border-slate-700/60 shadow-inner">
              <button
                id="switch-user-a"
                onClick={() => onSelectUser("user_a")}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeUserId === "user_a"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>User A</span>
              </button>
              <button
                id="switch-user-b"
                onClick={() => onSelectUser("user_b")}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeUserId === "user_b"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>User B</span>
              </button>
            </div>
          </div>

          {/* Core Actions: ATS Button + Upload Batch + Mobile Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* ATS Checker Prominent Button */}
            {onOpenATS && (
              <button
                id="btn-nav-ats"
                onClick={onOpenATS}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all hover:-translate-y-0.5 active:translate-y-0"
                title="Open ATS Resume Review & Mistake Inspector"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
                <span>ATS Score</span>
              </button>
            )}

            {/* Upload New Batch Button */}
            <button
              id="btn-upload-screenshots"
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Upload</span>
            </button>

            {/* Desktop-only Quick Status & Controls */}
            <div className="hidden lg:flex items-center gap-2">
              {/* Active Resume Status */}
              <button
                id="btn-active-resume"
                onClick={onOpenResumes}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                title="Manage Resumes"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate max-w-[130px]">
                  {activeResume ? activeResume.fileName : "No Active Resume"}
                </span>
              </button>

              {/* Connected Gmail Account Status */}
              {connectedAccount ? (
                <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] text-emerald-400 font-semibold uppercase leading-none">Gmail Connected</span>
                    <span className="text-slate-200 font-mono text-[11px] truncate max-w-[120px]">
                      {connectedAccount.email}
                    </span>
                  </div>

                  <button
                    id="btn-test-email"
                    onClick={handleSendTestEmail}
                    disabled={sendingTest}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-medium border border-emerald-500/30 transition-all ml-1"
                    title="Send a self-addressed test email to verify Gmail API"
                  >
                    <Send className="w-2.5 h-2.5" />
                    <span>{sendingTest ? "Testing..." : "Test"}</span>
                  </button>

                  <button
                    onClick={() => setShowTestingModeInfo(!showTestingModeInfo)}
                    className="text-slate-400 hover:text-amber-400 transition-colors p-0.5"
                    title="OAuth Persistence Info"
                  >
                    <Info className="w-3 h-3" />
                  </button>

                  <button
                    id="btn-disconnect-gmail"
                    onClick={handleDisconnectGmail}
                    disabled={disconnecting}
                    className="ml-0.5 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Disconnect Gmail"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-connect-gmail"
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium transition-all"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{connectingGmail ? "Connecting..." : "Connect Gmail"}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}

              {/* Refresh Button */}
              <button
                id="btn-refresh-data"
                onClick={onRefresh}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                title="Refresh Dashboard"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Logout Button */}
              {onLogout && (
                <button
                  id="btn-logout-session"
                  onClick={onLogout}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Lock / Logout Session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Mobile / Tablet Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white transition-colors"
              aria-label="Toggle Account & Device Menu"
            >
              {isMobileMenuOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Collapsible Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            {/* Active Resume */}
            <button
              onClick={() => { onOpenResumes(); setIsMobileMenuOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span className="truncate max-w-[140px]">
                {activeResume ? activeResume.fileName : "No Active Resume"}
              </span>
            </button>

            {/* Gmail Connection */}
            {connectedAccount ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-mono text-[11px] truncate max-w-[110px]">
                  {connectedAccount.email}
                </span>
                <button
                  onClick={handleSendTestEmail}
                  disabled={sendingTest}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-medium"
                >
                  {sendingTest ? "..." : "Test"}
                </button>
                <button
                  onClick={handleDisconnectGmail}
                  disabled={disconnecting}
                  className="text-slate-400 hover:text-rose-400"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGmail}
                disabled={connectingGmail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>{connectingGmail ? "Connecting..." : "Connect Gmail"}</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
