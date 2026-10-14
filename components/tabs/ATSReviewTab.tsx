"use client";

import React, { useRef, useState } from "react";
import {
  FileCheck2,
  Loader2,
  Download,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  Upload,
  FileText,
  Target,
  Search,
} from "lucide-react";
import type { ATSAnalysis } from "@/lib/ats/analysis";
import { scoreResume } from "@/lib/ats/scoring";

type Resume = { id: string; fileName: string; isActive: boolean };

export default function ATSReviewTab({ resumes }: { resumes: Resume[] }) {
  const [resumeId, setResumeId] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobImage, setJobImage] = useState<File | null>(null);
  const [jobText, setJobText] = useState("");
  const [text, setText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [report, setReport] = useState<ATSAnalysis | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [mistakeFilter, setMistakeFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [copied, setCopied] = useState(false);

  const preview = useRef<HTMLDivElement>(null);
  const effectiveId = resumeId || resumes.find((r) => r.isActive)?.id || "";
  const live = text ? scoreResume(text, report?.advice.requirements || []) : null;
  const stale = !!report && text !== originalText;
  const field = "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors";

  function download(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function resetSource() {
    setText("");
    setReport(null);
    setBaseline(null);
    setDismissed([]);
    setFocusLine(null);
  }

  async function analyze(action: "parse" | "analyze") {
    setBusy(true);
    setError("");
    setFocusLine(null);
    try {
      const form = new FormData();
      if (text) form.set("resumeText", text);
      else if (resumeFile) form.set("resume", resumeFile);
      else if (effectiveId) form.set("resumeId", effectiveId);
      else throw new Error("Choose a saved resume or upload a resume file first.");

      form.set("jobText", jobText);
      form.set("action", action);
      if (jobImage) form.set("jobImage", jobImage);

      const response = await fetch("/api/ats", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Analysis failed.");

      setText(data.resumeText);
      setOriginalText(data.resumeText);
      setJobText(data.jobText);
      setMethod(data.method);
      setJobImage(null);
      setDismissed([]);

      if (data.analysis) {
        setReport(data.analysis);
        setBaseline((previous) => previous ?? data.analysis.score);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  const findings = report
    ? [...report.findings, ...report.advice.issues].sort(
        (a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity)
      )
    : [];

  const filteredFindings = findings.filter((f) => {
    if (mistakeFilter === "all") return true;
    return f.severity === mistakeFilter;
  });

  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  const currentScore = live?.score ?? 0;
  const scoreTier =
    currentScore >= 85
      ? { label: "ATS Ready & Optimized", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-950/30" }
      : currentScore >= 70
      ? { label: "Competitive Match", color: "text-indigo-400", border: "border-indigo-500/40", bg: "bg-indigo-950/30" }
      : currentScore >= 50
      ? { label: "Optimization Recommended", color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-950/30" }
      : { label: "High Risk of ATS Filter", color: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-950/30" };

  return (
    <section className="space-y-6" aria-labelledby="ats-title">
      {/* Hero Header */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/50 via-slate-900 to-purple-950/30 p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 id="ats-title" className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold text-white">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <FileCheck2 className="w-5 h-5" />
              </span>
              <span>ATS Resume Audit &amp; Optimization</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Detect ATS parsing bottlenecks, missing target job keywords, and transform weak bullets with Google&rsquo;s XYZ formula.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              Powered by Gemini AI
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
          Advisory scoring based on modern ATS standards (parsing layout, keyword density, section taxonomy, and quantifiable impact). Analysis runs in memory and never modifies your saved resume until you approve edits.
        </p>
      </div>

      {/* Input Selection Form */}
      <fieldset disabled={busy} className="grid min-w-0 gap-4 lg:grid-cols-2 disabled:opacity-70">
        {/* Step 1: Resume Upload / Selection */}
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-xs font-bold">1</span>
              <span>Select or Upload Resume</span>
            </h3>
            {resumeFile && (
              <span className="text-[11px] text-emerald-400 font-medium truncate max-w-[150px]">
                File: {resumeFile.name}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Use Saved Resume
            </label>
            <select
              className={field}
              value={effectiveId}
              onChange={(e) => {
                setResumeId(e.target.value);
                setResumeFile(null);
                resetSource();
              }}
            >
              <option value="">Choose a saved resume...</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fileName} {r.isActive ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Or Upload New File (PDF, DOCX, TXT, or Camera Photo)
            </label>
            <input
              className={field}
              type="file"
              accept=".pdf,.docx,.txt,image/*"
              onChange={(e) => {
                setResumeFile(e.target.files?.[0] || null);
                resetSource();
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Supports scanned PDFs, mobile resume photos, DOCX and text up to 3 MB.
            </p>
          </div>
        </div>

        {/* Step 2: Target Job */}
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Target Job Posting <span className="text-slate-400 font-normal text-xs">(Recommended)</span></span>
            </h3>
            {jobImage && (
              <span className="text-[11px] text-indigo-300 font-medium truncate max-w-[150px]">
                Image: {jobImage.name}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Job Screenshot or Photo
            </label>
            <input
              key={jobImage?.name || "empty-job"}
              className={field}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setJobImage(e.target.files?.[0] || null);
                setReport(null);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Or Paste Job Description Text
            </label>
            <textarea
              className={field}
              rows={4}
              maxLength={30000}
              placeholder="Paste job requirements, required technologies, and responsibilities..."
              value={jobText}
              onChange={(e) => {
                setJobText(e.target.value);
                setReport(null);
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Enables exact keyword matching and gap analysis against job expectations.
            </p>
          </div>
        </div>
      </fieldset>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => analyze("parse")}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-200 disabled:opacity-50 transition-colors"
        >
          Preview Extracted Text
        </button>

        <button
          onClick={() => analyze("analyze")}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-purple-200" />}
          <span>{busy ? "Analyzing with AI..." : report ? "Re-Score Edited Resume" : "Start Full ATS Audit"}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Report View */}
      {report && live && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Main Scores Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Overall Score Dial */}
            <div className={`rounded-2xl border p-5 ${scoreTier.border} ${scoreTier.bg} flex flex-col justify-between`}>
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Overall ATS Compatibility
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-4xl sm:text-5xl font-black ${scoreTier.color}`}>{live.score}</span>
                  <span className="text-sm text-slate-500">/ 100</span>
                </div>
                <p className={`mt-1 text-xs font-semibold ${scoreTier.color}`}>
                  {scoreTier.label}
                </p>
              </div>

              {baseline !== null && (
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>Initial: {baseline}</span>
                  <span className={live.score >= baseline ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {live.score >= baseline ? `+${live.score - baseline}` : live.score - baseline} pts
                  </span>
                </div>
              )}
            </div>

            {/* Keyword Match Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Target Job Keyword Match
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    {live.matchScore === null ? "—" : live.matchScore}
                  </span>
                  {live.matchScore !== null && <span className="text-sm text-slate-500">/ 100</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {live.matchScore === null
                    ? "Add a job posting to measure technical keyword coverage."
                    : "Weighted placement: Experience counts 3×, skills count 1×."}
                </p>
              </div>

              {live.matches.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>Keywords Identified: {live.matches.length}</span>
                  <span className="text-indigo-400 font-semibold">
                    {live.matches.filter((m) => m.multiplier > 0).length} Matched
                  </span>
                </div>
              )}
            </div>

            {/* AI Summary Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:col-span-2 lg:col-span-1 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Executive AI Summary
                </span>
                <p className="mt-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
                  {report.advice.summary}
                </p>
              </div>

              {stale && (
                <div className="mt-4 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-200">
                  ⚡ Scores updated live. Reanalyze when ready for fresh AI feedback.
                </div>
              )}
            </div>
          </div>

          {/* Detailed Category Scoring Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-sm font-bold text-white mb-3">ATS Rubric Breakdown</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {live.categories.map((c) => (
                <div key={c.label} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">{c.label}</span>
                    <span className="text-indigo-400">{c.points.toFixed(0)}/{c.weight} pts</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (c.points / c.weight) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">{c.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mistake & Suggestions Inspector */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Identified Mistakes &amp; Actionable Suggestions</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Specific errors, missing contact details, passive phrasing, and formatting risks found in your resume.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs shrink-0">
                <button
                  onClick={() => setMistakeFilter("all")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    mistakeFilter === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  All ({findings.length})
                </button>
                <button
                  onClick={() => setMistakeFilter("high")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    mistakeFilter === "high" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-rose-300"
                  }`}
                >
                  High ({highCount})
                </button>
                <button
                  onClick={() => setMistakeFilter("medium")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    mistakeFilter === "medium" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-amber-300"
                  }`}
                >
                  Medium ({medCount})
                </button>
                <button
                  onClick={() => setMistakeFilter("low")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    mistakeFilter === "low" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-emerald-300"
                  }`}
                >
                  Low ({lowCount})
                </button>
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No mistakes found in this category.</p>
            ) : (
              <div className="space-y-3">
                {filteredFindings.map((f, i) => (
                  <article
                    key={i}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            f.severity === "high"
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : f.severity === "medium"
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {f.severity}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-white">{f.issue}</h4>
                      </div>

                      {f.line && (
                        <button
                          onClick={() => {
                            setFocusLine(f.line);
                            preview.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 underline font-medium"
                        >
                          Show Line {f.line} in Editor
                        </button>
                      )}
                    </div>

                    {f.quote && (
                      <blockquote className="border-l-2 border-slate-700 pl-3 text-xs text-slate-400 italic break-words">
                        &ldquo;{f.quote}&rdquo;
                      </blockquote>
                    )}

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-indigo-300">Suggestion:</strong> {f.suggestion}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Job Requirements vs Resume Evidence */}
          {live.matches.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-400" />
                <span>Job Keyword Evidence &amp; Placement</span>
              </h3>
              <p className="text-xs text-slate-400">
                Placement in Experience/Projects provides stronger evidence to ATS parsers than just listing in a Skills section.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {live.matches.map((m) => (
                  <div
                    key={m.keyword}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{m.keyword}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          m.multiplier >= 0.6
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : m.multiplier > 0
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {m.placement}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 break-words">
                      <strong className="text-slate-300">Job Evidence:</strong> &ldquo;{m.jobEvidence}&rdquo;
                    </p>

                    {m.evidence.slice(0, 1).map((l) => (
                      <p key={l.number} className="text-[11px] text-slate-400 break-words">
                        <strong className="text-indigo-300">Line {l.number}:</strong> {l.text}
                      </p>
                    ))}

                    {!m.multiplier && (
                      <p className="text-[11px] text-rose-300/80">
                        Keyword not found in resume. Add to your experience if you possess this skill.
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {report.advice.roleFit && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-indigo-400 block mb-1">Qualitative Role Fit Analysis:</strong>
                  {report.advice.roleFit}
                </div>
              )}
            </div>
          )}

          {/* Suggested 1-Click Rewrites */}
          {report.advice.rewrites.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>One-Click Smart Rewrites (Google XYZ Formula)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  AI-improved bullet points with strong action verbs and quantified impact. Applying updates the live text below.
                </p>
              </div>

              <div className="space-y-3">
                {report.advice.rewrites.map(
                  (r, i) =>
                    !dismissed.includes(i) && (
                      <article
                        key={i}
                        className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block mb-1">
                              Original
                            </span>
                            <p className="text-xs text-slate-300 break-words">{r.original}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                              AI Suggested Improvement
                            </span>
                            <p className="text-xs text-emerald-200 font-medium break-words">{r.replacement}</p>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          <strong className="text-slate-300">Why this works:</strong> {r.reason}
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            disabled={!text.includes(r.original)}
                            onClick={() => {
                              setText(text.replace(r.original, r.replacement));
                              setDismissed([...dismissed, i]);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Apply to Resume Text</span>
                          </button>
                          <button
                            onClick={() => setDismissed([...dismissed, i])}
                            className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </article>
                    )
                )}
              </div>
            </div>
          )}

          {/* Export JSON Review */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                download(
                  JSON.stringify({ ...report, currentRubric: live, editedResumeText: text }, null, 2),
                  "ats-audit-report.json"
                )
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-300 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Full Audit JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Text Extraction & Rescoring Editor */}
      {text && (
        <div ref={preview} className="grid min-w-0 gap-4 lg:grid-cols-2 pt-4 border-t border-slate-800">
          {/* Extraction Line Preview */}
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Line-by-Line Extraction</h3>
              <span className="text-[11px] text-slate-400">{method}</span>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs">
              {text.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={`flex gap-3 text-xs leading-6 px-1 rounded transition-colors ${
                    focusLine === i + 1 ? "bg-amber-900/60 text-amber-200" : "hover:bg-slate-900"
                  }`}
                >
                  <span className="w-7 shrink-0 text-slate-600 select-none text-right">{i + 1}</span>
                  <span className="whitespace-pre-wrap break-words min-w-0 text-slate-300">{line || " "}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Live Editor */}
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-white" htmlFor="ats-editor">
                Live Interactive Editor &amp; Rescore
              </label>
              <span className="text-[11px] text-slate-400">{text.length.toLocaleString()} characters</span>
            </div>

            <textarea
              id="ats-editor"
              className={field + " min-h-80 font-mono text-xs leading-relaxed"}
              value={text}
              maxLength={60000}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy Text"}</span>
              </button>

              <button
                onClick={() => download(text, "optimized-resume.txt")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download (.txt)</span>
              </button>

              <button
                onClick={() => {
                  setText(originalText);
                  setDismissed([]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-400 hover:text-rose-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo All Edits</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Edits made here dynamically recalculate your ATS score in real-time above. Once satisfied, copy the text into your master resume document before submitting.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
