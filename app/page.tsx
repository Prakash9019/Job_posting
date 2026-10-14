"use client";

import React, { useState, useEffect, useCallback } from "react";
import Navbar, { UserProfile } from "@/components/Navbar";
import SenderSettings from "@/components/SenderSettings";
import ATSReviewTab from "@/components/tabs/ATSReviewTab";
import SummaryCards, { SummaryStats } from "@/components/SummaryCards";
import EmailsTab, { EmailDraftItem } from "@/components/tabs/EmailsTab";
import LinkedInTab, { ExtractedLinkItem } from "@/components/tabs/LinkedInTab";
import ApplicationsTab from "@/components/tabs/ApplicationsTab";
import ManualReviewTab, { ManualReviewItem } from "@/components/tabs/ManualReviewTab";
import SentHistoryTab, { SendAttemptItem } from "@/components/tabs/SentHistoryTab";
import OverviewTab, { BatchItem } from "@/components/tabs/OverviewTab";
import BatchUploadModal from "@/components/BatchUploadModal";
import ResumeModal, { ResumeData } from "@/components/ResumeModal";
import ConfirmationModal from "@/components/ConfirmationModal";
import ScreenshotViewerModal from "@/components/ScreenshotViewerModal";
import LoginModal from "@/components/LoginModal";
import {
  Mail,
  ExternalLink,
  AlertTriangle,
  History,
  Layers,
  FileCheck2,
} from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";

export default function DashboardPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("user_a");
  const [activeTab, setActiveTab] = useState<string>("emails");
  const [stats, setStats] = useState<SummaryStats>({
    totalScreenshots: 0,
    emailDraftsCount: 0,
    linkedInLinksCount: 0,
    applicationLinksCount: 0,
    manualReviewCount: 0,
    sentCount: 0,
    failedSendCount: 0,
  });

  const [drafts, setDrafts] = useState<EmailDraftItem[]>([]);
  const [linkedInLinks, setLinkedInLinks] = useState<ExtractedLinkItem[]>([]);
  const [appLinks, setAppLinks] = useState<ExtractedLinkItem[]>([]);
  const [manualReviewItems, setManualReviewItems] = useState<ManualReviewItem[]>([]);
  const [historyAttempts, setHistoryAttempts] = useState<SendAttemptItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [resumes, setResumes] = useState<ResumeData[]>([]);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [viewingScreenshotId, setViewingScreenshotId] = useState<string | null>(null);

  // Authentication Login Modal state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginTargetUser, setLoginTargetUser] = useState<string>("user_a");

  // Send confirmation state
  const [draftsToSend, setDraftsToSend] = useState<EmailDraftItem[]>([]);
  const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false);
  const [isSendingInProgress, setIsSendingInProgress] = useState(false);

  // Toast / notification
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const currentUser = users.find((u) => u.id === activeUserId) || users[0];
  const connectedAccount = currentUser?.gmailAccounts?.find((g) => g.isConnected && g.email === currentUser.email);
  const activeResume = resumes.find((r) => r.isActive);

  const handleSelectUser = (newUserId: string) => {
    // Switching user requires entering that user's verified credentials
    setLoginTargetUser(newUserId);
    setIsLoginOpen(true);
  };

  const handleLoginSuccess = (verifiedUserId: string) => {
    setActiveUserId(verifiedUserId);
    setIsLoginOpen(false);
    setNotification({
      type: "success",
      message: `Successfully authenticated as ${verifiedUserId === "user_a" ? "User A" : "User B"}`,
    });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setIsLoginOpen(true);
      setNotification({
        type: "info",
        message: "Session terminated. Please authenticate to access your dashboard.",
      });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Initial session verification: require verified credentials if unauthenticated
  useEffect(() => {
    async function initSession() {
      try {
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        if (sessionData.authenticated && sessionData.user?.id) {
          setActiveUserId(sessionData.user.id);
        } else {
          // Unauthenticated requests cannot obtain a session without credentials
          setIsLoginOpen(true);
        }
      } catch (err) {
        console.error("Session verification error:", err);
        setIsLoginOpen(true);
      }
    }
    void initSession();
  }, []);

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [
        usersRes,
        overviewRes,
        draftsRes,
        linkedInRes,
        appLinksRes,
        historyRes,
        resumesRes,
      ] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/overview"),
        fetch("/api/drafts"),
        fetch("/api/links?type=LINKEDIN"),
        fetch("/api/links?type=APPLICATION_PORTAL"),
        fetch("/api/history"),
        fetch("/api/resumes"),
      ]);

      const [
        usersData,
        overviewData,
        draftsData,
        linkedInData,
        appLinksData,
        historyData,
        resumesData,
      ] = await Promise.all([
        usersRes.json(),
        overviewRes.json(),
        draftsRes.json(),
        linkedInRes.json(),
        appLinksRes.json(),
        historyRes.json(),
        resumesRes.json(),
      ]);

      if (usersData.users) setUsers(usersData.users);
      if (overviewData.stats) setStats(overviewData.stats);
      if (overviewData.batches) setBatches(overviewData.batches);
      if (overviewData.manualReviewItems) setManualReviewItems(overviewData.manualReviewItems);
      if (draftsData.drafts) setDrafts(draftsData.drafts);
      if (linkedInData.links) setLinkedInLinks(linkedInData.links);
      if (appLinksData.links) setAppLinks(appLinksData.links);
      if (historyData.attempts) setHistoryAttempts(historyData.attempts);
      if (resumesData.resumes) setResumes(resumesData.resumes);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      await fetchData();
    };
    void load();
    return () => {
      ignore = true;
      void ignore;
    };
  }, [fetchData, activeUserId]);

  // Check URL query parameters for OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get("auth_success");
    const authError = params.get("auth_error");
    const userParam = params.get("user");

    if (authSuccess || authError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        if (userParam) {
          setActiveUserId(userParam);
        }
        if (authSuccess) {
          setNotification({
            type: "success",
            message: "Google account authorized and connected successfully!",
          });
        } else if (authError) {
          setNotification({
            type: "error",
            message: `OAuth Error: ${decodeURIComponent(authError)}`,
          });
        }
      }, 0);
    }
  }, []);

  // Handle Send Confirmation Trigger
  const handleOpenSendConfirmation = (selectedDrafts: EmailDraftItem[]) => {
    if (!connectedAccount) {
      alert("No connected Gmail account found for this user. Please connect your Gmail in the top bar first.");
      return;
    }
    setDraftsToSend(selectedDrafts);
    setIsSendConfirmOpen(true);
  };

  // Execute Sending via real Gmail API
  const handleExecuteSend = async () => {
    if (draftsToSend.length === 0 || !connectedAccount) return;

    try {
      setIsSendingInProgress(true);
      const res = await fetch("/api/drafts/bulk-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: activeUserId,
          draftIds: draftsToSend.map((d) => d.id),
          senderEmail: connectedAccount.email,
          approveAndSend: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || (!data.success && !Array.isArray(data.results))) {
        throw new Error(data.error || data.summary || "Failed to send emails");
      }

      setNotification({
        type: data.failureCount > 0 ? "info" : "success",
        message: (data.summary || `Dispatched ${data.successCount} emails via Gmail.`) + (data.failureCount > 0 ? " Failed drafts remain in the queue. " + (data.results?.filter((r: { success: boolean }) => !r.success).map((r: { error?: string }) => r.error).filter(Boolean).slice(0, 2).join(" ") || "") : " Sent emails are now in Sent History."),
      });

      setIsSendConfirmOpen(false);
      setDraftsToSend([]);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingInProgress(false);
      fetchData();
    }
  };

  const navTabs = [
    { id: "ats", label: "ATS Review", icon: FileCheck2, count: null },
    { id: "emails", label: "Emails", icon: Mail, count: stats.emailDraftsCount },
    { id: "linkedin", label: "LinkedIn Links", icon: LinkedInIcon, count: stats.linkedInLinksCount },
    { id: "applications", label: "Application Portals", icon: ExternalLink, count: stats.applicationLinksCount },
    { id: "review", label: "Manual Review", icon: AlertTriangle, count: stats.manualReviewCount },
    { id: "history", label: "Sent History", icon: History, count: stats.sentCount },
    { id: "overview", label: "Overview & Batches", icon: Layers, count: batches.length },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Navbar */}
      <Navbar
        users={users}
        activeUserId={activeUserId}
        onSelectUser={handleSelectUser}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenResumes={() => setIsResumeOpen(true)}
        onOpenATS={() => setActiveTab("ats")}
        onRefresh={fetchData}
        onLogout={handleLogout}
      />

      {/* Notification Toast */}
      {notification && (
        <div
          className={`mx-4 lg:mx-8 mt-4 p-4 rounded-2xl border text-xs flex items-center justify-between shadow-xl transition-all ${
            notification.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : notification.type === "error"
              ? "bg-rose-950/80 border-rose-500/40 text-rose-200"
              : "bg-indigo-950/80 border-indigo-500/40 text-indigo-200"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs underline font-semibold ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {currentUser && <SenderSettings key={currentUser.id} user={currentUser} onSaved={fetchData} />}
        {/* Welcome / Context Banner */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2 break-words">
              <span>{currentUser?.name || "User"}&rsquo;s Application Pipeline</span>
              <span className="text-xs font-normal text-slate-400">
                ({activeResume ? `Using: ${activeResume.fileName}` : "No resume active"})
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review AI-matched drafts, verify extracted opportunities, and send via your connected Gmail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab("ats")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-200 text-xs font-semibold transition-all hover:scale-102"
              title="Inspect ATS Score, find mistakes, and get AI rewrites"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-violet-400" />
              <span>Inspect ATS Score</span>
            </button>
            {!connectedAccount && (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl">
                ⚠️ Connect Gmail in top right to send
              </span>
            )}
          </div>
        </div>

        {/* Summary Statistics Cards */}
        <SummaryCards
          stats={stats}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Navigation Tabs Pill Bar */}
        <div aria-label="Dashboard sections" className="flex max-w-full items-center gap-2 border-b border-slate-800 pb-2 mb-6 overflow-x-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== null && <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? "bg-indigo-800 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>}
              </button>
            );
          })}
        </div>

        {/* Active Tab View */}
        <div hidden={activeTab !== "ats"}><ATSReviewTab key={activeUserId} resumes={resumes} /></div>
        <div>
          {activeTab === "emails" && (
            <EmailsTab
              drafts={drafts}
              userId={activeUserId}
              senderEmail={connectedAccount?.email}
              senderName={currentUser?.name}
              activeResumeName={activeResume?.fileName}
              onRefresh={fetchData}
              onOpenSendConfirmation={handleOpenSendConfirmation}
              onViewScreenshot={(id) => setViewingScreenshotId(id)}
            />
          )}

          {activeTab === "linkedin" && (
            <LinkedInTab
              links={linkedInLinks}
              onViewScreenshot={(id) => setViewingScreenshotId(id)}
            />
          )}

          {activeTab === "applications" && (
            <ApplicationsTab
              links={appLinks}
              onViewScreenshot={(id) => setViewingScreenshotId(id)}
            />
          )}

          {activeTab === "review" && (
            <ManualReviewTab
              items={manualReviewItems}
              userId={activeUserId}
              onRefresh={fetchData}
              onViewScreenshot={(id) => setViewingScreenshotId(id)}
            />
          )}

          {activeTab === "history" && (
            <SentHistoryTab attempts={historyAttempts} />
          )}

          {activeTab === "overview" && (
            <OverviewTab
              batches={batches}
              userId={activeUserId}
              onRefresh={fetchData}
            />
          )}
        </div>
      </main>

      {/* Batch Upload Modal */}
      <BatchUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        userId={activeUserId}
        resumes={resumes}
        onUploadSuccess={() => {
          fetchData();
          setActiveTab("emails");
        }}
      />

      {/* Resume Management Modal */}
      <ResumeModal
        isOpen={isResumeOpen}
        onClose={() => setIsResumeOpen(false)}
        userId={activeUserId}
        resumes={resumes}
        onRefresh={fetchData}
        onOpenATS={() => {
          setIsResumeOpen(false);
          setActiveTab("ats");
        }}
      />

      {/* Full Screenshot Inspection Modal */}
      <ScreenshotViewerModal
        screenshotId={viewingScreenshotId}
        userId={activeUserId}
        onClose={() => setViewingScreenshotId(null)}
        onDeleted={fetchData}
      />

      {/* Final Email Dispatch Confirmation Modal */}
      <ConfirmationModal
        isOpen={isSendConfirmOpen}
        onClose={() => setIsSendConfirmOpen(false)}
        onConfirm={handleExecuteSend}
        senderEmail={connectedAccount?.email || "Not Connected"}
        recipientsCount={draftsToSend.length}
        recipientList={draftsToSend.map((d) => ({
          company: d.companyName,
          role: d.jobTitle,
          email: d.recipientEmail,
        }))}
        resumeFileName={activeResume?.fileName}
        hasUnapproved={draftsToSend.some((d) => d.reviewStatus !== "APPROVED")}
        isSending={isSendingInProgress}
      />

      {/* Verified Authentication Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        targetUserId={loginTargetUser}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
