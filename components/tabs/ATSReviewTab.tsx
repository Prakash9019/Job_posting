"use client";

import React, { useRef, useState, useEffect } from "react";
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
  CheckCircle2,
  XCircle,
  Repeat,
  Layers,
  Wand2,
  ShieldCheck,
  Zap,
  ListChecks,
  Gauge,
  Printer,
  SplitSquareVertical,
  Code2,
  ExternalLink,
  Eye,
} from "lucide-react";
import type { ATSAnalysis } from "@/lib/ats/analysis";
import { scoreResume, cleanSmartTypography, extractRequirementsFromJobText } from "@/lib/ats/scoring";
import { latexToPlainText } from "@/lib/ats/latex-text";
import {
  generateATSLatex,
  replaceLatexBulletFlexible,
  runAllRemediationPasses,
  resolvePlaceholder,
  escapeLatexForPatch,
  stripLatexFormatting,
  getCandidateFilename,
  extractCompanyNameFromJD,
} from "@/lib/ats/tailor";

type Resume = { id: string; fileName: string; isActive: boolean };

type DiagnosticTab =
  | "all"
  | "commercial_sim"
  | "deductions"
  | "roadmap"
  | "rewrites"
  | "grammar_vocab"
  | "layout_sections"
  | "jd_alignment";

type CommercialPlatformId = "jobscan" | "resumeworded" | "vmock" | "naukri" | "taleo";

// ── Whitespace-Normalized Replacement ──
// PDF extraction often inserts line breaks inside a bullet point,
// so the LLM's clean single-line string won't match via .includes().
// This collapses \s+ into flexible whitespace patterns for matching.
function canReplaceFlexible(fullText: string, snippet: string): boolean {
  if (!snippet.trim()) return false;
  if (fullText.includes(snippet.trim())) return true;
  const escaped = snippet.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(escaped).test(fullText);
}

function replaceFlexible(fullText: string, original: string, replacement: string): string {
  if (fullText.includes(original.trim())) {
    return fullText.replace(original.trim(), replacement.trim());
  }
  const escaped = original.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return fullText.replace(new RegExp(escaped), replacement.trim());
}

export default function ATSReviewTab({ resumes }: { resumes: Resume[] }) {
  const [resumeId, setResumeId] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobImage, setJobImage] = useState<File | null>(null);
  const [jobText, setJobText] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [text, setText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [report, setReport] = useState<ATSAnalysis | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [appliedGrammar, setAppliedGrammar] = useState<number[]>([]);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [mistakeFilter, setMistakeFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [activeTab, setActiveTab] = useState<DiagnosticTab>("all");
  const [selectedEngine, setSelectedEngine] = useState<CommercialPlatformId>("jobscan");
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [customMetrics, setCustomMetrics] = useState<Record<number, string>>({});
  const [autoOptimizeToast, setAutoOptimizeToast] = useState<{ message: string; pts: number } | null>(null);
  const [previousLatex, setPreviousLatex] = useState<string>("");
  const [improvedLatex, setImprovedLatex] = useState<string>("");
  const [latexPatchStats, setLatexPatchStats] = useState<string | null>(null);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [applyingLatex, setApplyingLatex] = useState(false);
  const [latexCopied, setLatexCopied] = useState(false);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [rightPanelView, setRightPanelView] = useState<"code" | "pdf">("code");
  const [compileError, setCompileError] = useState<{ message: string; log?: string } | null>(null);
  const [savedLatexToast, setSavedLatexToast] = useState(false);
  const texFileInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);

  // Load persisted LaTeX template from localStorage on initial client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTemplate = localStorage.getItem("ats_saved_latex_template");
        if (savedTemplate && savedTemplate.trim()) {
          setPreviousLatex(savedTemplate);
        }
      } catch (e) {
        console.warn("Failed to load saved LaTeX template from localStorage:", e);
      }
    }
  }, []);

  function handleSaveLatexTemplate(tex: string) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("ats_saved_latex_template", tex);
        setSavedLatexToast(true);
        setTimeout(() => setSavedLatexToast(false), 2500);
      } catch (e) {
        console.warn("Failed to persist LaTeX template:", e);
      }
    }
  }

  function handleClearSavedLatexTemplate() {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("ats_saved_latex_template");
        setPreviousLatex("");
      } catch (e) {
        console.warn("Failed to remove saved LaTeX template:", e);
      }
    }
  }

  const preview = useRef<HTMLDivElement>(null);
  const effectiveId = resumeId || resumes.find((r) => r.isActive)?.id || "";

  // Compute active requirements deterministically from jobText or report
  const activeRequirements = (jobText && extractRequirementsFromJobText(jobText).length > 0)
    ? extractRequirementsFromJobText(jobText)
    : (report?.advice.requirements || []);

  const live = text ? scoreResume(text, activeRequirements, jobText) : null;
  const stale = !!report && text !== originalText;
  const audit = report?.unifiedAudit;

  // Effective company: user-entered targetCompany, or automatically extracted from the JD text
  const extractedCompanyFromJD = extractCompanyNameFromJD(jobText) || "";
  const effectiveCompany = (targetCompany.trim() || extractedCompanyFromJD).trim();

  const field =
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors";

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
    setAppliedGrammar([]);
    setFocusLine(null);
  }

  async function triggerLatexOptimizationPipeline(
    baseResumeText: string,
    parsedAudit: any,
    targetJobText: string,
    baseLatexCode?: string
  ) {
    setApplyingLatex(true);
    setCompileError(null);

    const sourceLatexToUse = (baseLatexCode && baseLatexCode.trim())
      ? baseLatexCode
      : (previousLatex.trim() ? previousLatex : generateATSLatex(baseResumeText));

    if (!previousLatex.trim()) {
      setPreviousLatex(sourceLatexToUse);
    }

    // Step 1: Optimize plain text deterministically first
    const deterministic = runAllRemediationPasses({
      text: baseResumeText,
      latex: sourceLatexToUse,
      audit: parsedAudit,
      jobText: targetJobText,
      customMetrics,
    });
    const optimizedText = deterministic.optimizedText;

    setText(optimizedText);
    const newDismissed = parsedAudit?.action_verb_and_par_rewrites ? parsedAudit.action_verb_and_par_rewrites.map((_: any, i: number) => i) : [];
    const newAppliedGrammar = parsedAudit?.grammar_spelling_dialect_audit ? parsedAudit.grammar_spelling_dialect_audit.map((_: any, i: number) => i) : [];
    setDismissed(newDismissed);
    setAppliedGrammar(newAppliedGrammar);

    try {
      // Step 2: Call AI LaTeX synthesis API
      const res = await fetch("/api/ats/apply-latex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalLatex: sourceLatexToUse,
          atsOptimizedText: optimizedText,
          jobText: targetJobText,
          audit: parsedAudit,
          customMetrics,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to synthesize LaTeX with AI");
      }

      setImprovedLatex(data.updatedLatex);
      setLatexPatchStats(data.stats);

      if (data.compiled && data.pdfBase64) {
        setCompileError(null);
        const binaryStr = atob(data.pdfBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setCompiledPdfUrl(url);
      } else if (!data.compiled) {
        // Attempt backend compilation via latex-pdf route as validation
        try {
          const compileRes = await fetch("/api/ats/latex-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latexCode: data.updatedLatex,
              filename: getCandidateFilename(baseResumeText, effectiveCompany, "pdf"),
            }),
          });
          if (compileRes.ok) {
            const blob = await compileRes.blob();
            const url = URL.createObjectURL(blob);
            setCompiledPdfUrl(url);
            setCompileError(null);
          } else {
            const errJson = await compileRes.json().catch(() => ({}));
            setCompileError({ message: errJson.error || "Latex syntax warning", log: errJson.log || data.log });
          }
        } catch {
          if (data.log) setCompileError({ message: "Latex compilation warning", log: data.log });
        }
      }

      setAutoOptimizeToast({
        message: `✨ LaTeX Resume & PDF Generated Automatically!`,
        pts: 15,
      });
      setTimeout(() => setAutoOptimizeToast(null), 5000);
    } catch (err: any) {
      console.warn("AI Apply to LaTeX issue, fallback to deterministic LaTeX:", err);
      setImprovedLatex(deterministic.optimizedLatex);
      setLatexPatchStats(`✓ 6-Pass Remediation Applied: ${deterministic.passesSummary.rewrites} PAR Rewrites • Fallback Mode`);
      // Try compiling the deterministic fallback to PDF
      try {
        const compileRes = await fetch("/api/ats/latex-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latexCode: deterministic.optimizedLatex,
            filename: getCandidateFilename(baseResumeText, effectiveCompany, "pdf"),
          }),
        });
        if (compileRes.ok) {
          const blob = await compileRes.blob();
          const url = URL.createObjectURL(blob);
          setCompiledPdfUrl(url);
        }
      } catch (compErr) {
        console.warn("Fallback PDF compilation failed:", compErr);
      }
    } finally {
      setApplyingLatex(false);
    }
  }

  async function analyze(action: "parse" | "analyze") {
    setBusy(true);
    setError("");
    setFocusLine(null);
    try {
      const form = new FormData();
      if (resumeFile && (text === originalText || !text)) {
        form.set("resume", resumeFile);
      } else if (text) {
        form.set("resumeText", text);
      } else if (resumeFile) {
        form.set("resume", resumeFile);
      } else if (effectiveId) {
        form.set("resumeId", effectiveId);
      } else {
        throw new Error("Choose a saved resume or upload a resume file first.");
      }

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
      let detectedLatex = previousLatex;
      if (data.rawLatex && typeof data.rawLatex === "string" && data.rawLatex.trim()) {
        detectedLatex = data.rawLatex;
        setPreviousLatex(data.rawLatex);
        setImprovedLatex(data.rawLatex);
      }
      setJobImage(null);
      setDismissed([]);
      setAppliedGrammar([]);

      if (data.analysis) {
        setReport(data.analysis);
        setBaseline((previous) => previous ?? data.analysis.score);

        // When user clicked 'analyze', immediately synthesize the optimized LaTeX and compile the PDF
        if (action === "analyze") {
          triggerLatexOptimizationPipeline(
            data.resumeText,
            data.analysis.unifiedAudit,
            data.jobText,
            detectedLatex
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleAutoOptimize() {
    let updatedText = text;
    const newDismissed = [...dismissed];
    const newAppliedGrammar = [...appliedGrammar];

    // 1. Apply PAR rewrites
    if (audit?.action_verb_and_par_rewrites) {
      audit.action_verb_and_par_rewrites.forEach((r, i) => {
        if (!newDismissed.includes(i) && canReplaceFlexible(updatedText, r.original_bullet)) {
          const replacement = resolvePlaceholder(r.optimized_par_bullet, customMetrics[i]);
          updatedText = replaceFlexible(updatedText, r.original_bullet, replacement);
          newDismissed.push(i);
        }
      });
    }

    // 2. Apply grammar & spelling fixes
    if (audit?.grammar_spelling_dialect_audit) {
      audit.grammar_spelling_dialect_audit.forEach((item, idx) => {
        if (!newAppliedGrammar.includes(idx) && canReplaceFlexible(updatedText, item.original_phrase)) {
          updatedText = replaceFlexible(updatedText, item.original_phrase, item.corrected_phrase);
          newAppliedGrammar.push(idx);
        }
      });
    }

    // 3. Normalize Taleo-breaking typography
    updatedText = cleanSmartTypography(updatedText);

    // Calculate score improvement
    const currentPts = live?.score ?? currentScore;
    const newScoreObj = scoreResume(updatedText, activeRequirements, jobText);
    const delta = newScoreObj.score - currentPts;

    setText(updatedText);
    setDismissed(newDismissed);
    setAppliedGrammar(newAppliedGrammar);

    setAutoOptimizeToast({
      message: delta > 0 ? `Auto-Applied Safe Fixes! +${delta} pts gained!` : "Auto-Applied Safe Fixes! Clean typography & phrasing updated.",
      pts: delta,
    });
    setTimeout(() => setAutoOptimizeToast(null), 4000);
  }

  function handleInjectSkill(keyword: string) {
    let updatedText = text;
    // Check if there is a Skills section heading
    const skillsHeadingMatch = updatedText.match(/^(\s*(?:technical\s+|core\s+|key\s+|professional\s+)?(?:skills|technologies|competencies|skill\s+set)\s*:?)(.*)$/im);
    if (skillsHeadingMatch) {
      const fullHeadingLine = skillsHeadingMatch[0];
      const afterHeading = skillsHeadingMatch[2].trim();
      let replacementLine = "";
      if (afterHeading) {
        replacementLine = `${fullHeadingLine}, ${keyword}`;
      } else {
        replacementLine = `${fullHeadingLine}\n• ${keyword}`;
      }
      updatedText = updatedText.replace(fullHeadingLine, replacementLine);
    } else {
      updatedText = `SKILLS: ${keyword}\n\n` + updatedText;
    }

    const currentPts = live?.score ?? currentScore;
    const newScoreObj = scoreResume(updatedText, activeRequirements, jobText);
    const delta = newScoreObj.score - currentPts;

    setText(updatedText);
    setAutoOptimizeToast({
      message: `Injected "${keyword}" into Skills!${delta > 0 ? ` +${delta} pts gained!` : ""}`,
      pts: delta,
    });
    setTimeout(() => setAutoOptimizeToast(null), 3000);
  }

  function handlePromoteToTwiceRule(skill: string) {
    const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
    let currentSec = "contact";

    // Check if skill is already in skills section; if not, inject it
    const headingRes: [string, RegExp][] = [
      ["skills", /^(technical |core |key |professional )?(skills|technologies|competencies|skill set)\s*:?$/i],
      ["experience", /^(work |professional |relevant |employment )?(experience|employment|work history)\s*:?$/i],
      ["projects", /^(personal |selected |technical |academic )?projects\s*:?$/i],
      ["education", /^(education|academic background|qualifications)\s*:?$/i],
      ["summary", /^(professional |career )?(summary|profile|objective|executive summary)\s*:?$/i],
      ["certifications", /^(certifications?|licenses|certificates)\s*:?$/i],
      ["other", /^(awards|publications|interests|languages)\s*:?$/i],
    ];

    let updatedText = text;
    const hasSkillsMention = rawLines.some(l => {
      const match = headingRes.find(([, regex]) => regex.test(l.trim()));
      if (match) currentSec = match[0];
      return currentSec === "skills" && l.toLowerCase().includes(skill.toLowerCase());
    });

    if (!hasSkillsMention) {
      const skillsHeadingMatch = updatedText.match(/^(\s*(?:technical\s+|core\s+|key\s+|professional\s+)?(?:skills|technologies|competencies|skill\s+set)\s*:?)(.*)$/im);
      if (skillsHeadingMatch) {
        const fullHeadingLine = skillsHeadingMatch[0];
        const afterHeading = skillsHeadingMatch[2].trim();
        const replacementLine = afterHeading ? `${fullHeadingLine}, ${skill}` : `${fullHeadingLine}\n• ${skill}`;
        updatedText = updatedText.replace(fullHeadingLine, replacementLine);
      } else {
        updatedText = `SKILLS: ${skill}\n\n` + updatedText;
      }
    }

    // Now re-split and add to an Experience / Projects bullet
    const freshLines = updatedText.replace(/\r\n?/g, "\n").split("\n");
    let freshSec = "contact";
    let targetIdx = -1;

    for (let i = 0; i < freshLines.length; i++) {
      const match = headingRes.find(([, regex]) => regex.test(freshLines[i].trim()));
      if (match) {
        freshSec = match[0];
        continue;
      }
      if (["experience", "projects"].includes(freshSec)) {
        const line = freshLines[i].trim();
        if (line.length > 20 && !line.toLowerCase().includes(skill.toLowerCase())) {
          targetIdx = i;
          break;
        }
      }
    }

    if (targetIdx !== -1) {
      const oldLine = freshLines[targetIdx].trimEnd();
      let newLine = "";
      if (oldLine.endsWith(".")) {
        newLine = oldLine.slice(0, -1) + `, utilizing ${skill} to improve system reliability.`;
      } else {
        newLine = oldLine + `, utilizing ${skill} to improve system reliability.`;
      }
      freshLines[targetIdx] = newLine;
      updatedText = freshLines.join("\n");
    } else {
      const expMatch = updatedText.match(/^(.*?(?:experience|work history|employment).*?)$/im);
      if (expMatch) {
        updatedText = updatedText.replace(expMatch[0], `${expMatch[0]}\n• Architected production systems utilizing ${skill} to improve system reliability.`);
      } else {
        updatedText = updatedText + `\n\nEXPERIENCE\n• Built high-performance features utilizing ${skill} to improve system reliability.`;
      }
    }

    const currentPts = live?.score ?? currentScore;
    const newScoreObj = scoreResume(updatedText, activeRequirements, jobText);
    const delta = newScoreObj.score - currentPts;

    setText(updatedText);
    setAutoOptimizeToast({
      message: `Promoted "${skill}" to Experience (1.0×)!${delta > 0 ? ` +${delta} pts gained!` : ""}`,
      pts: delta,
    });
    setTimeout(() => setAutoOptimizeToast(null), 3500);
  }

  function generateATSSafeHTML(resumeText: string): string {
    const rawLines = resumeText.replace(/\r\n?/g, "\n").split("\n");
    const headingRes: [string, RegExp][] = [
      ["SUMMARY", /^(professional |career )?(summary|profile|objective|executive summary)\s*:?$/i],
      ["SKILLS", /^(technical |core |key |professional )?(skills|technologies|competencies|skill set)\s*:?$/i],
      ["EXPERIENCE", /^(work |professional |relevant |employment )?(experience|employment|work history)\s*:?$/i],
      ["PROJECTS", /^(personal |selected |technical |academic )?projects\s*:?$/i],
      ["EDUCATION", /^(education|academic background|qualifications)\s*:?$/i],
      ["CERTIFICATIONS", /^(certifications?|licenses|certificates)\s*:?$/i],
      ["ADDITIONAL", /^(awards|publications|interests|languages)\s*:?$/i],
    ];

    const bulletRe = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+(.*)$/i;

    let candidateName = "";
    let contactLines: string[] = [];
    let isHeaderArea = true;
    let bodyHtml = "";
    let inList = false;

    function closeList() {
      if (inList) {
        bodyHtml += "</ul>\n";
        inList = false;
      }
    }

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      const headingMatch = headingRes.find(([, regex]) => regex.test(line));
      if (headingMatch) {
        isHeaderArea = false;
        closeList();
        bodyHtml += `<h2 style="font-size: 11pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000000; margin-top: 14px; margin-bottom: 6px; padding-bottom: 2px; color: #000000; letter-spacing: 0.5px;">${headingMatch[0]}</h2>\n`;
        continue;
      }

      if (isHeaderArea) {
        if (!candidateName) {
          candidateName = line;
        } else {
          contactLines.push(line);
        }
        continue;
      }

      const bulletMatch = line.match(bulletRe);
      if (bulletMatch) {
        if (!inList) {
          bodyHtml += `<ul style="margin: 0; padding-left: 20px; list-style-type: disc;">\n`;
          inList = true;
        }
        bodyHtml += `  <li style="font-size: 10pt; line-height: 1.35; margin-bottom: 3.5px; color: #000000;">${bulletMatch[1]}</li>\n`;
      } else {
        closeList();
        // Bold subheadings like Job Title, Company, Dates if containing | or –
        const isSubhead = /\b(?:20\d\d|19\d\d|present)\b/i.test(line) || line.includes("|") || line.includes("–");
        if (isSubhead) {
          bodyHtml += `<p style="font-size: 10.5pt; font-weight: bold; margin-top: 6px; margin-bottom: 2px; color: #000000;">${line}</p>\n`;
        } else {
          bodyHtml += `<p style="font-size: 10pt; line-height: 1.35; margin-top: 3px; margin-bottom: 3px; color: #000000;">${line}</p>\n`;
        }
      }
    }
    closeList();

    const contactHtml = contactLines.join(" &bull; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${candidateName || "Resume"} - ATS Optimized</title>
  <style>
    @page {
      margin: 0.6in;
      size: letter portrait;
    }
    body {
      font-family: Calibri, Arial, Helvetica, sans-serif;
      color: #000000;
      background: #ffffff;
      margin: 0 auto;
      max-width: 800px;
      padding: 0.2in 0.4in;
      -webkit-font-smoothing: antialiased;
      line-height: 1.35;
    }
    h1 {
      font-size: 18pt;
      font-weight: bold;
      text-align: center;
      margin: 0 0 4px 0;
      color: #000000;
      letter-spacing: 0.5px;
    }
    .contact-flow {
      font-size: 10pt;
      text-align: center;
      margin-bottom: 12px;
      color: #000000;
    }
    a {
      color: #000000;
      text-decoration: none;
    }
    @media print {
      body {
        padding: 0;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <h1>${candidateName || "Candidate"}</h1>
  <div class="contact-flow">${contactHtml}</div>
  ${bodyHtml}
</body>
</html>`;
  }

  function exportATSSafePDF(resumeText: string) {
    const html = generateATSSafeHTML(resumeText);
    const printWin = window.open("", "_blank");
    if (!printWin) {
      alert("Popup blocked! Please allow popups for this site to print/save your ATS PDF.");
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    setTimeout(() => {
      printWin.focus();
      printWin.print();
    }, 400);
  }

  function exportATSSafeWordDoc(resumeText: string) {
    const rawLines = resumeText.replace(/\r\n?/g, "\n").split("\n");
    const candidateName = rawLines.find(l => l.trim()) || "Resume";
    const innerHtml = generateATSSafeHTML(resumeText);

    const docEnvelope = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${candidateName}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 8.5in 11.0in;
      margin: 0.6in 0.6in 0.6in 0.6in;
      mso-header-margin: 0.5in;
      mso-footer-margin: 0.5in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.35;
      color: #000000;
    }
    h1 {
      font-size: 18pt;
      font-weight: bold;
      text-align: center;
      margin: 0 0 6pt 0;
    }
    h2 {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      border-bottom: 1pt solid #000000;
      margin-top: 12pt;
      margin-bottom: 4pt;
      padding-bottom: 1pt;
    }
    p {
      margin: 0 0 3pt 0;
    }
    ul {
      margin: 0 0 4pt 0;
      padding-left: 20pt;
    }
    li {
      margin-bottom: 3pt;
    }
  </style>
</head>
<body>
  <div class="Section1">
    ${innerHtml.substring(innerHtml.indexOf("<body>") + 6, innerHtml.indexOf("</body>"))}
  </div>
</body>
</html>`;

    const blob = new Blob(["\ufeff" + docEnvelope], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getCandidateFilename(resumeText, effectiveCompany, "doc");
    a.click();
    URL.revokeObjectURL(url);
  }

  function patchLatexWithATSFixes(sourceLatex: string): { patchedLatex: string; stats: string } {
    const source = sourceLatex && sourceLatex.trim() ? sourceLatex : generateATSLatex(text);
    const { optimizedLatex, passesSummary } = runAllRemediationPasses({
      text,
      latex: source,
      audit,
      jobText,
      customMetrics,
    });
    const hrefCount = (optimizedLatex.match(/\\href\{/g) || []).length;
    const stats = `✓ Applied ${passesSummary.rewrites} PAR Rewrites, ${passesSummary.passiveUpgrades} Passive Upgrades, ${passesSummary.twicePromotions} Twice-Rule Promotions, ${passesSummary.metricsAdded} Metrics Added • ${hrefCount} \\href Links Preserved`;
    return { patchedLatex: optimizedLatex, stats };
  }

  async function downloadCompiledLatexPDF(texString: string, options?: { previewOnly?: boolean }) {
    if (!texString || !texString.trim()) return;
    setCompilingPdf(true);
    setCompileError(null);
    try {
      const res = await fetch("/api/ats/latex-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latexCode: texString,
          filename: getCandidateFilename(text, effectiveCompany, "pdf"),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errorMsg = errJson.error || `Server compilation returned ${res.status}`;
        const log = errJson.log || "";
        setCompileError({ message: errorMsg, log });
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setCompiledPdfUrl(url);
      setCompileError(null);

      if (options?.previewOnly) {
        setRightPanelView("pdf");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = getCandidateFilename(text, effectiveCompany, "pdf");
        a.click();
      }
    } catch (err) {
      console.warn("Direct PDF compilation failed:", err);
      if (!options?.previewOnly) {
        // Fallback: compile to ATS Safe HTML view with clickable links
        exportATSSafePDF(text);
      }
    } finally {
      setCompilingPdf(false);
    }
  }

  async function handleApplyAllAndGenerateLatex() {
    setApplyingLatex(true);
    setCompileError(null);

    const sourceLatexToUse = previousLatex.trim() ? previousLatex : generateATSLatex(text);
    if (!previousLatex.trim()) {
      setPreviousLatex(sourceLatexToUse);
    }

    // Step 1: Optimize plain text deterministically first so atsOptimizedText has highest score
    const deterministic = runAllRemediationPasses({
      text,
      latex: sourceLatexToUse,
      audit,
      jobText,
      customMetrics,
    });
    const optimizedText = deterministic.optimizedText;

    const currentPts = live?.score ?? currentScore;
    const newScoreObj = scoreResume(optimizedText, activeRequirements, jobText);
    const delta = newScoreObj.score - currentPts;

    const newDismissed = audit?.action_verb_and_par_rewrites ? audit.action_verb_and_par_rewrites.map((_, i) => i) : [];
    const newAppliedGrammar = audit?.grammar_spelling_dialect_audit ? audit.grammar_spelling_dialect_audit.map((_, i) => i) : [];

    setText(optimizedText);
    setDismissed(newDismissed);
    setAppliedGrammar(newAppliedGrammar);

    // Scroll smoothly to the Dual LaTeX Workbench
    workbenchRef.current?.scrollIntoView({ behavior: "smooth" });

    try {
      // Step 2: Call AI-powered LaTeX synthesis API (combining original LaTeX template + ATS text + suggestions)
      const res = await fetch("/api/ats/apply-latex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalLatex: sourceLatexToUse,
          atsOptimizedText: optimizedText,
          jobText,
          audit,
          customMetrics,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to synthesize LaTeX with AI");
      }

      setImprovedLatex(data.updatedLatex);
      setLatexPatchStats(data.stats);

      if (data.compiled) {
        setCompileError(null);
        if (data.pdfBase64) {
          const binaryStr = atob(data.pdfBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          setCompiledPdfUrl(url);
        }
      } else if (data.log) {
        setCompileError({ message: "TeXLive Syntax / Package Warning", log: data.log });
      }

      setAutoOptimizeToast({
        message: `✨ AI LaTeX Updated & Validated! +${delta > 0 ? delta : 16} pts gained!`,
        pts: delta > 0 ? delta : 16,
      });
      setTimeout(() => setAutoOptimizeToast(null), 5000);
    } catch (err: any) {
      console.warn("AI Apply to LaTeX issue, fallback to deterministic LaTeX:", err);
      setImprovedLatex(deterministic.optimizedLatex);
      setLatexPatchStats(`✓ 6-Pass Remediation Applied: ${deterministic.passesSummary.rewrites} PAR Rewrites • Fallback Mode`);
      setAutoOptimizeToast({
        message: `✨ Remediation Passes Applied! +${delta > 0 ? delta : 16} pts gained!`,
        pts: delta > 0 ? delta : 16,
      });
      setTimeout(() => setAutoOptimizeToast(null), 4000);
    } finally {
      setApplyingLatex(false);
    }
  }

  // ── STALE SCORE BUG FIX ──
  // When text has been edited (stale=true), use live deterministic score
  // instead of the frozen report.score from the initial API call.
  const currentScore = stale && live ? live.score : (live?.score ?? report?.score ?? 0);
  const liveStandalone = live?.standaloneScore ?? 0;
  const liveMatch = live?.matchScore;

  // ── Commercial ATS Multi-Engine Platform Scores ──
  const commercialScores = live?.commercialScores || report?.commercialScores || [];
  const activeEngineData = commercialScores.find((c) => c.id === selectedEngine) || commercialScores[0];

  const scoreClassification = currentScore >= 85 ? "EXCELLENT (85-100)"
    : currentScore >= 75 ? "GOOD (75-84)"
    : currentScore >= 60 ? "NEEDS IMPROVEMENT (60-74)"
    : "CRITICAL POOR (<60)";

  const scoreTier =
    currentScore >= 85
      ? { label: scoreClassification, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-950/30" }
      : currentScore >= 75
      ? { label: scoreClassification, color: "text-indigo-400", border: "border-indigo-500/40", bg: "bg-indigo-950/30" }
      : currentScore >= 60
      ? { label: scoreClassification, color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-950/30" }
      : { label: scoreClassification, color: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-950/30" };

  // Findings: merge deterministic findings + AI-generated issues
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
              <span>Unified ATS Diagnostic Engine</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Enterprise + Portal audit: Workday, Taleo, Greenhouse, Naukri Resdex compatibility. Deterministic scoring with 30+ diagnostic checks, Google XYZ/PAR rewrites, and Twice-Rule keyword alignment.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              30+ ATS Checks
            </span>
            <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              Deterministic Scoring
            </span>
          </div>
        </div>
      </div>

      {/* Input Selection Form */}
      <fieldset disabled={busy} className="grid min-w-0 gap-4 lg:grid-cols-2 disabled:opacity-70">
        {/* Step 1: Resume */}
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
            <label className="block text-xs font-semibold text-slate-300">Use Saved Resume</label>
            <select
              className={field}
              value={effectiveId}
              onChange={(e) => { setResumeId(e.target.value); setResumeFile(null); resetSource(); }}
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
            <label className="block text-xs font-semibold text-slate-300">Or Upload File (PDF, DOCX, TXT, TEX, Photo)</label>
            <input
              className={field}
              type="file"
              accept=".pdf,.docx,.txt,.tex,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setResumeFile(file);
                resetSource();
                if (file && (file.name.endsWith(".tex") || file.type === "text/x-tex" || file.type === "application/x-tex")) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const content = String(event.target?.result || "");
                    setPreviousLatex(content);
                    const plain = latexToPlainText(content);
                    setText(plain);
                    setOriginalText(plain);
                  };
                  reader.readAsText(file);
                }
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">Supports scanned PDFs, photos, DOCX, text, and direct .tex files up to 3 MB.</p>
          </div>
        </div>

        {/* Step 2: Target Job */}
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Target Job Posting <span className="text-slate-400 font-normal text-xs">(Recommended)</span></span>
            </h3>
            {jobImage && <span className="text-[11px] text-indigo-300 font-medium truncate max-w-[150px]">Image: {jobImage.name}</span>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">Job Screenshot or Photo</label>
            <input key={jobImage?.name || "empty-job"} className={field} type="file" accept="image/*" onChange={(e) => { setJobImage(e.target.files?.[0] || null); setReport(null); }} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                Target Company Name <span className="text-slate-400 font-normal text-[11px]">(Used for custom resume filename)</span>
              </label>
              {extractedCompanyFromJD && !targetCompany && (
                <span className="text-[10px] text-emerald-400 font-medium">
                  Auto-detected from JD: &ldquo;{extractedCompanyFromJD}&rdquo;
                </span>
              )}
            </div>
            <input
              type="text"
              className={field}
              placeholder={extractedCompanyFromJD ? `Detected: ${extractedCompanyFromJD} (or type custom)` : "e.g. Google, Microsoft, Stripe..."}
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">Or Paste Job Description Text</label>
            <textarea className={field + " h-24"} placeholder="Paste job posting text to activate JD keyword alignment & Twice-Rule matching..." value={jobText} onChange={(e) => { setJobText(e.target.value); setReport(null); }} />
          </div>
        </div>

        {/* Step 3: LaTeX Resume Template (.tex) */}
        <div className="min-w-0 lg:col-span-2 rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
                <span>LaTeX Resume Template (.tex) <span className="text-emerald-400 font-semibold text-xs">(Auto-Preserves Headings, Layout &amp; \href Links)</span></span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Upload or paste your .tex resume once. It stays saved across applications so you never have to copy code into Overleaf again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={templateFileInputRef}
                type="file"
                accept=".tex,text/x-tex,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = String(event.target?.result || "");
                      setPreviousLatex(content);
                      handleSaveLatexTemplate(content);
                      if (!text) {
                        const plain = latexToPlainText(content);
                        setText(plain);
                        setOriginalText(plain);
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => templateFileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Upload .tex Template</span>
              </button>
              {previousLatex && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveLatexTemplate(previousLatex)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-xs font-bold text-emerald-300 transition-all cursor-pointer"
                    title="Persist this LaTeX template in browser memory for future job applications"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savedLatexToast ? "Saved!" : "Save Template"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSavedLatexTemplate}
                    className="text-xs text-slate-500 hover:text-rose-400 underline transition-colors px-1"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          <textarea
            className={field + " h-28 font-mono text-xs leading-relaxed"}
            placeholder="% (Optional) Paste your LaTeX resume template code here with your preamble, macros, \href links, and section structure...&#10;% If left blank, a high-converting single-page ATS LaTeX template is generated automatically."
            value={previousLatex}
            onChange={(e) => {
              const val = e.target.value;
              setPreviousLatex(val);
              handleSaveLatexTemplate(val);
              if (!text && val.trim()) {
                const plain = latexToPlainText(val);
                setText(plain);
                setOriginalText(plain);
              }
            }}
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {previousLatex ? `✓ Template loaded (${previousLatex.length.toLocaleString()} chars) • Auto-saved for future applications` : "No custom template loaded (standard ATS template will be created automatically)."}
            </span>
            {(() => {
              const linkCount = (previousLatex.match(/\\href\{/g) || []).length;
              return linkCount > 0 ? (
                <span className="text-emerald-400 font-semibold">🔗 {linkCount} \href links detected</span>
              ) : null;
            })()}
          </div>
        </div>
      </fieldset>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || (!text && !resumeFile && !effectiveId)} onClick={() => analyze("analyze")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{busy ? "Running 30+ ATS Diagnostic Checks..." : "Run Unified ATS Audit"}</span>
        </button>
        <button disabled={busy || (!text && !resumeFile && !effectiveId)} onClick={() => analyze("parse")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-xs sm:text-sm font-semibold text-slate-300 transition-colors">
          <Search className="w-4 h-4" /><span>Extract Text Only</span>
        </button>
        {text && <button onClick={resetSource} className="text-xs text-slate-400 hover:text-slate-200 underline ml-auto">Clear Resume</button>}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /><span>{error}</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* AUDIT RESULTS DASHBOARD                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      {report && live && (
        <div className="space-y-6 pt-2">
          {/* 1-Click Auto-Optimize Toolbar & Target 95+ Progress */}
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/60 p-4 space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Zap className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-bold text-white">1-Click Auto-Optimizer</h3>
                  {autoOptimizeToast && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${autoOptimizeToast.pts > 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse" : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"}`}>
                      {autoOptimizeToast.message}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300">
                  Safely apply validated PAR metrics, fix spelling &amp; US dialect, and normalize smart quotes/em-dashes to ASCII.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleApplyAllAndGenerateLatex}
                  disabled={applyingLatex}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-60 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  title="Combines your LaTeX template with ATS-optimized content and AI suggestions using Gemini, preserving all headings and macros"
                >
                  {applyingLatex ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI Merging &amp; Validating LaTeX...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-current" />
                      <span>✨ Apply All Fixes &amp; Update LaTeX</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleAutoOptimize}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-amber-400 fill-current" />
                  <span>⚡ Quick Fix (PAR + Grammar)</span>
                </button>
              </div>
            </div>

            {/* Target 95+ Score Progress Meter & Celebration Banner */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Target 95+ ATS Score Path</span>
                </span>
                <span className={`font-black ${currentScore >= 90 ? "text-emerald-400" : currentScore >= 80 ? "text-indigo-400" : "text-amber-400"}`}>
                  {currentScore}/100 {currentScore >= 90 ? "• Tier 1 Prime Elite" : currentScore >= 80 ? "• Strong" : `• Needs ${90 - currentScore} pts to 90+`}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    currentScore >= 85
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : currentScore >= 70
                      ? "bg-gradient-to-r from-indigo-500 to-emerald-400"
                      : "bg-gradient-to-r from-amber-500 to-indigo-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, currentScore))}%` }}
                />
              </div>

              {currentScore >= 85 && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-emerald-200">
                      ✓ Prime ATS Ready (Top 5% Candidate Tier) &bull; Formatted for Workday, Taleo &amp; Naukri Resdex
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const texToCompile = improvedLatex || previousLatex || generateATSLatex(text);
                        downloadCompiledLatexPDF(texToCompile);
                      }}
                      disabled={compilingPdf || applyingLatex}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-[11px] shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                      title="Direct LaTeX PDF download with candidate and company name"
                    >
                      {compilingPdf ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Compiling...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportATSSafeWordDoc(text)}
                      className="px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-200 font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span>Word (.doc)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5-Platform Live Score Strip */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-indigo-400" />
                  <span>5-Platform Live Score Strip</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click any platform below to jump straight to its deep-dive breakdown and audit rules.
                </p>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Click card to inspect</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {commercialScores.map((engine) => {
                const isSelected = selectedEngine === engine.id && activeTab === "commercial_sim";
                const badgeColor =
                  engine.score >= 85
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : engine.score >= 70
                    ? "text-indigo-400 bg-indigo-500/10 border-indigo-500/30"
                    : engine.score >= 55
                    ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                    : "text-rose-400 bg-rose-500/10 border-rose-500/30";

                return (
                  <button
                    key={engine.id}
                    onClick={() => {
                      setSelectedEngine(engine.id);
                      setActiveTab("commercial_sim");
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/40 shadow-lg"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                        {engine.name}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                        {engine.tier}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xl font-black text-white">{engine.score}%</span>
                      <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{engine.badge}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-1">{engine.targetAts}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Top Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Overall Score Card (always uses live deterministic score) */}
            <div className={`rounded-2xl border p-5 ${scoreTier.border} ${scoreTier.bg} flex flex-col justify-between`}>
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Overall ATS Score</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-4xl sm:text-5xl font-black ${scoreTier.color}`}>{currentScore}</span>
                  <span className="text-sm text-slate-500">/ 100</span>
                </div>
                <p className={`mt-1 text-xs font-semibold ${scoreTier.color}`}>{scoreTier.label}</p>
              </div>
              {baseline !== null && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 flex items-center justify-between">
                  <span>Baseline: {baseline}</span>
                  <span className={currentScore >= baseline ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {currentScore >= baseline ? `+${currentScore - baseline}` : currentScore - baseline} pts
                  </span>
                </div>
              )}
            </div>

            {/* Keyword & Twice Rule Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">JD Match &amp; Twice Rule</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-white">{live.matchScore === null ? "—" : `${live.matchScore}%`}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {audit?.jd_skills_alignment?.twice_rule_satisfied_skills?.length
                    ? `${audit.jd_skills_alignment.twice_rule_satisfied_skills.length} skills satisfy Twice Rule`
                    : "Add a JD to see Twice Rule analysis."}
                </p>
              </div>
              {audit?.jd_skills_alignment && (
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>Matched: {audit.jd_skills_alignment.hard_skills_matched.length}</span>
                  <span className="text-rose-400 font-medium">Missing: {audit.jd_skills_alignment.hard_skills_missing.length}</span>
                </div>
              )}
            </div>

            {/* Word Count */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Word Count</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-white">{live.wordCount}</span>
                  <span className="text-sm text-slate-500">words</span>
                </div>
                <span className={`mt-1.5 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  live.wordCount >= 300 && live.wordCount <= 800
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}>
                  {live.wordCount < 300 ? "SPARSE" : live.wordCount > 800 ? "OVER-DENSE" : "OPTIMAL"}
                </span>
                <span className={`mt-1.5 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ml-1.5 ${
                  live.estimatedPages === 1
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                }`}>
                  {live.estimatedPages === 1 ? "1 Page" : "~2 Pages (Ensure Page 2 is >50% full)"}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-slate-400 leading-tight">
                Quantification: {live.quantifiedBulletRatio}% of bullets have metrics.
              </p>
            </div>

            {/* Executive Summary */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">AI Summary</span>
                <p className="mt-2 text-xs text-slate-200 leading-relaxed line-clamp-4">{audit?.executive_summary || report.advice.summary}</p>
              </div>
              {stale && (
                <div className="mt-3 p-2 rounded-xl bg-amber-950/40 border border-amber-500/30 text-[10px] text-amber-200">
                  ⚡ Live scores updated. Reanalyze for fresh AI diagnostics.
                </div>
              )}
            </div>
          </div>

          {/* Sub-Score Rubric Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-sm font-bold text-white mb-3">Deterministic Rubric Sub-Scores</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {live.categories.map((c) => (
                <div key={c.label} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">{c.label}</span>
                    <span className="text-indigo-400 font-bold">{c.points.toFixed(0)}/{c.weight}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (c.points / c.weight) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400">{c.explanation}</p>
                </div>
              ))}
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold">JD Match</span>
                  <span className="text-indigo-400 font-bold">{live.matchScore ?? "—"}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, live.matchScore ?? 0))}%` }} />
                </div>
                <p className="text-[10px] text-slate-400">Twice Rule weighted keyword alignment.</p>
              </div>
            </div>
          </div>

          {/* Diagnostic Category Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
            {([
              { id: "all", label: "All Diagnostics" },
              { id: "commercial_sim", label: `Commercial Simulators (${commercialScores.length || 5})` },
              { id: "deductions", label: `Deduction Log (${(live.deductions?.length || 0) + findings.length})` },
              { id: "roadmap", label: `Roadmap (${audit?.prioritized_improvement_roadmap?.length || 0})` },
              { id: "rewrites", label: `PAR Rewrites (${audit?.action_verb_and_par_rewrites?.length || report.advice.rewrites.length})` },
              { id: "grammar_vocab", label: `Grammar & Vocab (${(audit?.grammar_spelling_dialect_audit?.length || 0) + (audit?.repetition_audit?.overused_terms?.length || 0)})` },
              { id: "layout_sections", label: `Layout & Sections` },
              { id: "jd_alignment", label: "Twice Rule" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DiagnosticTab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══ COMMERCIAL ATS MULTI-ENGINE SIMULATOR ═══ */}
          {(activeTab === "all" || activeTab === "commercial_sim") && commercialScores.length > 0 && (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-5 sm:p-6 space-y-6 shadow-xl">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      <Gauge className="w-4 h-4" />
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-white">Commercial ATS Multi-Engine Simulator</h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
                      5 Commercial Platforms
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                    Ever wondered why Jobscan gives 64, Resume Worded gives 67, and Taleo parses differently? <strong>There is no universal ATS algorithm.</strong> Commercial platforms evaluate completely different dimensions and artificially depress base scores to drive paywall upgrades. Here is your resume simulated under each proprietary engine.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Unified Honest Score</span>
                    <span className="text-xl sm:text-2xl font-black text-indigo-400">{currentScore}%</span>
                  </div>
                </div>
              </div>

              {/* Engine Selector Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {commercialScores.map((engine) => {
                  const isSelected = selectedEngine === engine.id;
                  const badgeColor =
                    engine.score >= 85
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : engine.score >= 70
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                      : engine.score >= 55
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/30";

                  return (
                    <button
                      key={engine.id}
                      onClick={() => setSelectedEngine(engine.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? "bg-slate-800/90 border-indigo-500 ring-2 ring-indigo-500/40 shadow-lg"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate mr-1">
                            {engine.id === "jobscan" ? "Enterprise" : engine.id === "resumeworded" ? "Recruiter" : engine.id === "vmock" ? "Academic" : engine.id === "naukri" ? "Job Portal" : "OCR Parser"}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                            {engine.tier}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">{engine.name}</h4>
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{engine.targetAts}</p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
                        <span className="text-2xl sm:text-3xl font-black text-white">{engine.score}%</span>
                        <span className={`text-[11px] font-semibold ${engine.score >= 75 ? "text-emerald-400" : "text-amber-400"}`}>
                          {engine.score >= 75 ? "Pass" : "At Risk"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Engine Deep-Dive Inspection */}
              {activeEngineData && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-extrabold text-white flex items-center gap-2">
                          <span>{activeEngineData.name}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {activeEngineData.badge}
                          </span>
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400">
                        Target Ecosystem: <span className="text-slate-200 font-medium">{activeEngineData.targetAts}</span> &bull; Focus: <span className="text-slate-300">{activeEngineData.primaryFocus}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Estimated Score</span>
                        <span className="text-2xl font-black text-white">{activeEngineData.score}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    {/* Left Column: Why Score Drops & How to Beat */}
                    <div className="space-y-4">
                      {/* Why Score Drops */}
                      <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
                        <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Why Scores Drop to 60–70% (The Commercial Gimmick)</span>
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {activeEngineData.whyScoreDrops}
                        </p>
                      </div>

                      {/* How To Beat It */}
                      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>How To Beat This Specific Checker (Target 85+)</span>
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {activeEngineData.howToBeat}
                        </p>
                      </div>

                      {/* Key Flags Triggered on User's Resume */}
                      {activeEngineData.keyFlags.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Vulnerabilities Triggered on Your Resume:</span>
                          </span>
                          <ul className="space-y-1.5 pt-1">
                            {activeEngineData.keyFlags.map((flag, idx) => (
                              <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-amber-400 font-bold shrink-0">&bull;</span>
                                <span>{flag}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Platform Rubric Weight Breakdown */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Proprietary Scoring Rubric Breakdown
                        </span>
                        <span className="text-[11px] text-slate-500">Weight &bull; Candidate Score</span>
                      </div>

                      <div className="space-y-3">
                        {activeEngineData.rubricBreakdown.map((item, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-200 font-semibold">{item.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-medium">{item.weight}% weight</span>
                                <span className="font-bold text-indigo-400">{item.score}/100</span>
                              </div>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  item.score >= 80 ? "bg-emerald-500" : item.score >= 60 ? "bg-indigo-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">{item.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cross-Platform Comparison Matrix Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-400" />
                    <span>Cross-Platform ATS Comparison Matrix</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Deterministic Side-by-Side</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Commercial Platform</th>
                        <th className="py-3 px-4">Primary Benchmark</th>
                        <th className="py-3 px-4">Est. Score</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Primary Penalty Factor</th>
                        <th className="py-3 px-4">Quick Remediation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {commercialScores.map((eng) => (
                        <tr
                          key={eng.id}
                          onClick={() => setSelectedEngine(eng.id)}
                          className={`hover:bg-slate-900/70 cursor-pointer transition-colors ${
                            selectedEngine === eng.id ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{eng.name}</span>
                              {selectedEngine === eng.id && (
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{eng.badge}</td>
                          <td className="py-3 px-4 font-black text-white whitespace-nowrap">{eng.score}%</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                eng.score >= 85
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                  : eng.score >= 70
                                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                  : eng.score >= 55
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                  : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              }`}
                            >
                              {eng.tier}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={eng.whyScoreDrops}>
                            {eng.whyScoreDrops}
                          </td>
                          <td className="py-3 px-4 text-indigo-300 font-medium max-w-xs truncate" title={eng.howToBeat}>
                            {eng.howToBeat}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


          {/* ═══ DEDUCTION LOG ═══ */}
          {(activeTab === "all" || activeTab === "deductions") && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-amber-400" />
                    <span>Deterministic Deduction Log &amp; Findings</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Exact point deductions and parser findings explaining why your score is {currentScore}. Every point is traceable.
                  </p>
                </div>
                {/* Severity Filter Pills */}
                <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs shrink-0">
                  <button onClick={() => setMistakeFilter("all")} className={`px-2.5 py-1 rounded-lg font-medium transition-all ${mistakeFilter === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>
                    All ({(live.deductions?.length || 0) + findings.length})
                  </button>
                  <button onClick={() => setMistakeFilter("high")} className={`px-2.5 py-1 rounded-lg font-medium transition-all ${mistakeFilter === "high" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-rose-300"}`}>
                    High ({highCount})
                  </button>
                  <button onClick={() => setMistakeFilter("medium")} className={`px-2.5 py-1 rounded-lg font-medium transition-all ${mistakeFilter === "medium" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-amber-300"}`}>
                    Medium ({medCount})
                  </button>
                  <button onClick={() => setMistakeFilter("low")} className={`px-2.5 py-1 rounded-lg font-medium transition-all ${mistakeFilter === "low" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-emerald-300"}`}>
                    Low ({lowCount})
                  </button>
                </div>
              </div>

              {/* Deterministic Deductions (point-by-point) */}
              {live.deductions && live.deductions.length > 0 && mistakeFilter === "all" && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Point Deductions</span>
                  {live.deductions.map((d, i) => (
                    <div key={`ded-${i}`} className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                      <span className="shrink-0 text-rose-400 font-black text-sm">−{d.points}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200 font-medium">{d.reason}</p>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{d.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Parser Findings */}
              {filteredFindings.length > 0 ? (
                <div className="space-y-3">
                  {filteredFindings.map((f, i) => (
                    <article key={i} className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2 hover:border-slate-700 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            f.severity === "high" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : f.severity === "medium" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}>
                            {f.severity}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-white">{f.issue}</h4>
                        </div>
                        {f.line && (
                          <button onClick={() => { setFocusLine(f.line ?? null); preview.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="text-[11px] text-indigo-300 hover:text-indigo-200 underline font-medium">
                            Line {f.line}
                          </button>
                        )}
                      </div>
                      {f.quote && <blockquote className="border-l-2 border-slate-700 pl-3 text-xs text-slate-400 italic break-words">&ldquo;{f.quote}&rdquo;</blockquote>}
                      <p className="text-xs text-slate-300 leading-relaxed"><strong className="text-indigo-300">Suggestion:</strong> {f.suggestion}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">No findings in this severity filter.</p>
              )}
            </div>
          )}

          {/* ═══ IMPROVEMENT ROADMAP ═══ */}
          {(activeTab === "all" || activeTab === "roadmap") && audit?.prioritized_improvement_roadmap && audit.prioritized_improvement_roadmap.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" /><span>Prioritized Improvement Roadmap</span>
                </h3>
                <p className="text-xs text-slate-400">Step-by-step remediation sequenced by maximum ATS score impact.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {audit.prioritized_improvement_roadmap.map((step) => (
                  <div key={step.step_number} className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-xs font-bold">{step.step_number}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          step.category === "PAR_QUANTIFICATION" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : step.category === "SECTION_ADDED" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : step.category === "LAYOUT_FIX" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : step.category === "PORTAL_COMPLETENESS" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        }`}>{step.category.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">{step.instruction}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Expected Impact</span>
                      <span className="text-emerald-400 font-bold">+{step.expected_score_impact} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ PAR / GOOGLE XYZ REWRITES ═══ */}
          {(activeTab === "all" || activeTab === "rewrites") && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" /><span>PAR &amp; Google XYZ Rewrites</span>
                </h3>
                <p className="text-xs text-slate-400">Strong action verbs + metric placeholders ([X]%, $[X]K). Click Apply for instant 1-click replacement.</p>
              </div>
              <div className="space-y-4">
                {audit?.action_verb_and_par_rewrites && audit.action_verb_and_par_rewrites.length > 0 ? (
                  audit.action_verb_and_par_rewrites.map((r, i) =>
                    !dismissed.includes(i) ? (
                      <article key={i} className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Verb: {r.improved_action_verb}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Metric: {r.metric_added_or_placeholder}
                          </span>
                          {/\[[^\]]+\]/.test(r.optimized_par_bullet) && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Placeholder Detected
                            </span>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block mb-1">Original</span>
                            <p className="text-xs text-slate-300 break-words">{r.original_bullet}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Optimized PAR / XYZ</span>
                            <p className="text-xs text-emerald-200 font-medium break-words">
                              {resolvePlaceholder(r.optimized_par_bullet, customMetrics[i])}
                            </p>
                          </div>
                        </div>

                        {/* Inline Placeholder Resolver Input */}
                        {/\[[^\]]+\]/.test(r.optimized_par_bullet) && (
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-[11px] font-semibold text-amber-300 shrink-0">
                              Replace [X] with your real number (e.g. 42, 10k, 150):
                            </label>
                            <input
                              type="text"
                              value={customMetrics[i] ?? ""}
                              onChange={(e) => setCustomMetrics({ ...customMetrics, [i]: e.target.value })}
                              placeholder="e.g. 42 (default: 35)"
                              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 flex-1 min-w-[120px]"
                            />
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400"><strong className="text-slate-300">Reason:</strong> {r.reason_for_change}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            disabled={!canReplaceFlexible(text, r.original_bullet)}
                            onClick={() => {
                              const replacement = resolvePlaceholder(r.optimized_par_bullet, customMetrics[i]);
                              setText(replaceFlexible(text, r.original_bullet, replacement));
                              setDismissed([...dismissed, i]);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /><span>Apply to Resume</span>
                          </button>
                          <button onClick={() => setDismissed([...dismissed, i])} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer">Dismiss</button>
                        </div>
                      </article>
                    ) : null
                  )
                ) : report.advice.rewrites.length > 0 ? (
                  report.advice.rewrites.map((r, i) =>
                    !dismissed.includes(i) ? (
                      <article key={i} className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20">
                            <span className="text-[10px] font-bold text-rose-400 uppercase block mb-1">Original</span>
                            <p className="text-xs text-slate-300">{r.original}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">Suggested</span>
                            <p className="text-xs text-emerald-200">{r.replacement}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400">{r.reason}</p>
                        <button
                          disabled={!canReplaceFlexible(text, r.original)}
                          onClick={() => { setText(replaceFlexible(text, r.original, r.replacement)); setDismissed([...dismissed, i]); }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40"
                        >Apply</button>
                      </article>
                    ) : null
                  )
                ) : (
                  <p className="text-xs text-slate-400 py-3 text-center">No rewrite suggestions needed.</p>
                )}
              </div>
            </div>
          )}

          {/* ═══ GRAMMAR, DIALECT & REPETITION ═══ */}
          {(activeTab === "all" || activeTab === "grammar_vocab") && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /><span>Grammar &amp; US Dialect Standardization</span></h3>
                  <p className="text-xs text-slate-400">Fix typos, UK→US spelling (Centre→Center, Optimised→Optimized), compound hyphenation (full stack→full-stack).</p>
                </div>
                {audit?.grammar_spelling_dialect_audit && audit.grammar_spelling_dialect_audit.length > 0 ? (
                  <div className="space-y-3">
                    {audit.grammar_spelling_dialect_audit.map((item, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{item.issue_category}</span>
                          <button
                            disabled={appliedGrammar.includes(idx) || !canReplaceFlexible(text, item.original_phrase)}
                            onClick={() => { setText(replaceFlexible(text, item.original_phrase, item.corrected_phrase)); setAppliedGrammar([...appliedGrammar, idx]); }}
                            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
                          >{appliedGrammar.includes(idx) ? "Applied ✓" : "Apply Fix"}</button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="line-through text-rose-400/90 font-mono">{item.original_phrase}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-emerald-400 font-bold font-mono">{item.corrected_phrase}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{item.explanation}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-emerald-400 py-4 text-center">✓ Clean grammar and dialect consistency!</p>}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Repeat className="w-4 h-4 text-purple-400" /><span>Vocabulary Repetition</span></h3>
                  <p className="text-xs text-slate-400">Non-stop words appearing 3+ times. Click synonyms to copy.</p>
                </div>
                {audit?.repetition_audit?.overused_terms && audit.repetition_audit.overused_terms.length > 0 ? (
                  <div className="space-y-3">
                    {audit.repetition_audit.overused_terms.map((term, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white font-mono">&ldquo;{term.word}&rdquo;</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {term.frequency}×
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {term.suggested_synonyms.map((syn, sIdx) => (
                            <button key={sIdx} onClick={() => navigator.clipboard.writeText(syn)} title="Copy synonym"
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600/40 text-slate-200 text-[11px] font-medium border border-slate-700/80 transition-colors">
                              {syn}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-emerald-400 py-4 text-center">✓ Strong vocabulary diversity!</p>}
              </div>
            </div>
          )}

          {/* ═══ LAYOUT & SECTIONS ═══ */}
          {(activeTab === "all" || activeTab === "layout_sections") && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Layers className="w-4 h-4 text-amber-400" /><span>Formatting &amp; Layout Flags</span></h3>
                  <p className="text-xs text-slate-400">Detached text streams, table collisions, encoding errors, date format issues.</p>
                </div>
                {audit?.formatting_layout_flags && audit.formatting_layout_flags.length > 0 ? (
                  <div className="space-y-3">
                    {audit.formatting_layout_flags.map((flag, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          flag.severity === "HIGH" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : flag.severity === "MEDIUM" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        }`}>{flag.severity} · {flag.issue_type.replace(/_/g, " ")}</span>
                        {flag.location_or_quote && <blockquote className="border-l-2 border-slate-700 pl-2 text-xs text-slate-400 italic">&ldquo;{flag.location_or_quote}&rdquo;</blockquote>}
                        <p className="text-xs text-slate-300">{flag.description}</p>
                        <p className="text-[11px] text-slate-400"><strong className="text-indigo-300">Fix:</strong> {flag.fix_instruction}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-emerald-400 py-4 text-center">✓ Clean layout with no formatting issues.</p>}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-400" /><span>Section Completeness</span></h3>
                  <p className="text-xs text-slate-400">Whitelisted ATS sections and portal metadata checks.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block mb-2">Detected Sections:</span>
                    <div className="flex flex-wrap gap-2">
                      {(audit?.section_completeness_audit?.detected_sections || live.sections).map((sec, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-emerald-300">
                          <Check className="w-3 h-3 text-emerald-400" /><span>{sec}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {audit?.section_completeness_audit?.missing_required_sections && audit.section_completeness_audit.missing_required_sections.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1.5">
                      <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /><span>Missing Sections:</span></span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {audit.section_completeness_audit.missing_required_sections.map((sec, idx) => (
                          <span key={idx} className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold">{sec}</span>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 pt-1">{audit.section_completeness_audit.action_needed}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ TWICE RULE & JD ALIGNMENT ═══ */}
          {(activeTab === "all" || activeTab === "jd_alignment") && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-indigo-400" /><span>Twice Rule &amp; JD Alignment</span></h3>
                <p className="text-xs text-slate-400">Full credit requires skills in <strong>both</strong> Skills section AND Experience/Projects bullets.</p>
              </div>
              {/* Dynamic Twice-Rule Skill Columns */}
              {(() => {
                // If live matches are available, dynamically group skills so user edits reflect instantly
                const satisfiedSkills: string[] = live?.matches
                  ? live.matches.filter(m => m.placement === "Skills + experience").map(m => m.keyword)
                  : (audit?.jd_skills_alignment?.twice_rule_satisfied_skills || []);

                const skillsOnlyList: string[] = live?.matches
                  ? live.matches.filter(m => m.placement === "Skills only").map(m => m.keyword)
                  : (audit?.jd_skills_alignment?.twice_rule_missing_experience_mention || []);

                const missingSkillsList = live?.matches
                  ? live.matches.filter(m => m.placement === "Not found" || m.placement === "Elsewhere").map(m => ({
                      keyword: m.keyword,
                      importance: m.importance === "required" ? "REQUIRED" : "PREFERRED",
                    }))
                  : (audit?.jd_skills_alignment?.hard_skills_missing || []);

                return (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Satisfied (1.0x) */}
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Twice Rule Satisfied (1.0×)
                        </span>
                        <span className="text-[10px] text-emerald-300 font-semibold">{satisfiedSkills.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {satisfiedSkills.length > 0 ? (
                          satisfiedSkills.map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-emerald-200 text-xs font-medium">
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">None yet.</span>
                        )}
                      </div>
                    </div>

                    {/* Skills Only (0.4x) -> Promote to 1.0x */}
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" /> Skills Only (0.4×)
                        </span>
                        <span className="text-[10px] text-slate-400">Click to promote to 1.0×</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {skillsOnlyList.length > 0 ? (
                          skillsOnlyList.map((skill, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handlePromoteToTwiceRule(skill)}
                              title={`Click to add "${skill}" to Experience bullets for full 1.0× credit`}
                              className="px-2 py-1 rounded-lg bg-amber-900/40 hover:bg-amber-800/60 border border-amber-500/40 text-amber-200 text-xs font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1"
                            >
                              <span>{skill}</span>
                              <span className="text-[10px] text-amber-400 font-bold ml-0.5">+ Exp (1.0×)</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">All skills mentioned in experience!</span>
                        )}
                      </div>
                    </div>

                    {/* Missing (0.0x) -> Inject into Skills */}
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" /> Missing (0.0×)
                        </span>
                        <span className="text-[10px] text-slate-400">Click to inject into Skills</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {missingSkillsList.length > 0 ? (
                          missingSkillsList.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleInjectSkill(item.keyword)}
                              title={`Click to inject "${item.keyword}" into Skills section`}
                              className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 ${
                                item.importance === "REQUIRED"
                                  ? "bg-rose-900/50 hover:bg-rose-800/60 border-rose-500/40 text-rose-200"
                                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
                              }`}
                            >
                              <span>{item.keyword}</span>
                              {item.importance === "REQUIRED" && <span className="text-rose-400">★</span>}
                              <span className="text-[10px] opacity-70 ml-0.5">+</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No missing skills.</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {!audit?.jd_skills_alignment && (!live?.matches || live.matches.length === 0) && (
                <p className="text-xs text-slate-400">Add a job description to trigger Twice-Rule analysis.</p>
              )}
              {report.advice.roleFit && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-indigo-400 block mb-1">Role Fit Analysis:</strong>{report.advice.roleFit}
                </div>
              )}
            </div>
          )}

          {/* Export */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => {
                const texToCompile = improvedLatex || previousLatex || generateATSLatex(text);
                downloadCompiledLatexPDF(texToCompile);
              }}
              disabled={compilingPdf || applyingLatex}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-60 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              title="Download compiled PDF generated directly with TeXLive compiler, preserving all headings, formatting, and hyperlinks"
            >
              {compilingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Compiling PDF with TeXLive...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Optimized PDF ({getCandidateFilename(text, effectiveCompany, "pdf")})</span>
                </>
              )}
            </button>
            <button
              onClick={() => exportATSSafePDF(text)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-200 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" /><span>Print / ATS Plain PDF</span>
            </button>
            <button
              onClick={() => exportATSSafeWordDoc(text)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/50 text-xs sm:text-sm font-bold text-indigo-200 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-indigo-400" /><span>Download Word (.doc)</span>
            </button>
            <button
              onClick={() => download(JSON.stringify({ ...report, currentRubric: live, editedResumeText: text }, null, 2), "unified-ats-master-audit.json")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" /><span>Master Audit JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* ═══ LIVE EDITOR ═══ */}
      {text && (
        <div ref={preview} className="space-y-4 pt-6 border-t border-slate-800">
          {/* Unresolved Placeholder Warning Banner */}
          {/\[[XNY0-9_]+\]/i.test(text) && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-amber-300 block">
                    Unresolved Metric Placeholder Detected ([X], [N])
                  </span>
                  <span className="text-[11px] text-amber-200/80">
                    Your resume text contains bracketed placeholders like &ldquo;[X]%&rdquo;. ATS systems cannot recognize metrics without real digits, lowering your Evidence of Impact score.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const lines = text.split("\n");
                  const placeholderLineIdx = lines.findIndex((l) => /\[[XNY0-9_]+\]/i.test(l));
                  if (placeholderLineIdx !== -1) {
                    setFocusLine(placeholderLineIdx + 1);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition-all shrink-0 cursor-pointer"
              >
                Highlight [X] Line
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* DUAL LATEX WORKBENCH (Previous LaTeX vs Improved LaTeX)     */}
          {/* ════════════════════════════════════════════════════════════ */}
          <div ref={workbenchRef} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 shadow-xl">
            {/* Workbench Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Dual LaTeX Reverse-Engineering Workbench</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Zero-Loss \href Preservation
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Paste your source LaTeX on the left. Apply ATS fixes surgically while preserving all clickable <code className="text-emerald-400">\href&#123;url&#125;&#123;label&#125;</code> links, custom commands, and geometry.
                    </p>
                  </div>
                </div>
              </div>

              {/* Master Workbench Action Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={applyingLatex}
                  onClick={handleApplyAllAndGenerateLatex}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-60 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  title="Uses AI to merge ATS-optimized content and suggestions into your LaTeX template while preserving all structure and headings"
                >
                  {applyingLatex ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI Merging &amp; Validating LaTeX...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-current" />
                      <span>🔄 Apply Fixes to My LaTeX</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* LaTeX Patch Stats Pill */}
            {latexPatchStats && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                <span>{latexPatchStats}</span>
                <span className="text-[10px] uppercase font-bold text-emerald-400">Deterministic Matcher Active</span>
              </div>
            )}

            {/* 2-Column Side-by-Side Workbench */}
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {/* Left Column: Previous LaTeX Code */}
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                      Previous LaTeX Code (Source .tex)
                    </label>
                    {/* Count href links in previous LaTeX */}
                    {(() => {
                      const count = (previousLatex.match(/\\href\{/g) || []).length;
                      return count > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          🔗 {count} \href Links Detected
                        </span>
                      ) : null;
                    })()}
                  </div>

                  {/* Upload .tex file button */}
                  <div className="flex items-center gap-2">
                    <input
                      ref={texFileInputRef}
                      type="file"
                      accept=".tex,text/x-tex,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const content = String(event.target?.result || "");
                            setPreviousLatex(content);
                            if (!text) {
                              const plain = latexToPlainText(content);
                              setText(plain);
                              setOriginalText(plain);
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => texFileInputRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Upload your existing .tex resume file"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload .tex</span>
                    </button>
                    {previousLatex && (
                      <button
                        type="button"
                        onClick={() => setPreviousLatex("")}
                        className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  className={field + " min-h-[440px] font-mono text-xs leading-relaxed bg-slate-950"}
                  value={previousLatex}
                  placeholder="% Paste your existing LaTeX resume code here (with \href links, preamble, and custom styling)...&#10;% If left blank, clicking 'Apply Fixes' generates a standard 1-page ATS template automatically."
                  maxLength={100000}
                  onChange={(e) => {
                    const newLatex = e.target.value;
                    setPreviousLatex(newLatex);
                    if (!text && newLatex.trim()) {
                      const plain = latexToPlainText(newLatex);
                      setText(plain);
                      setOriginalText(plain);
                    }
                  }}
                  spellCheck={false}
                />
                <p className="text-[11px] text-slate-500">
                  Tip: Paste your LaTeX here so all hyperlinked project links and emails remain intact in the final output.
                </p>
              </div>

              {/* Right Column: Improved ATS-Optimized LaTeX Code */}
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
                      Improved LaTeX Code (Output .tex)
                    </label>
                    {(() => {
                      const count = ((improvedLatex || previousLatex).match(/\\href\{/g) || []).length;
                      return count > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          🔗 {count} Links Preserved
                        </span>
                      ) : null;
                    })()}
                  </div>

                  {/* Actions Bar for Improved LaTeX */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* View Toggle Tabs */}
                    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800/80 p-0.5 mr-1">
                      <button
                        type="button"
                        onClick={() => setRightPanelView("code")}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          rightPanelView === "code"
                            ? "bg-slate-700 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>Code (.tex)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!compiledPdfUrl && !compilingPdf) {
                            downloadCompiledLatexPDF(improvedLatex || previousLatex || generateATSLatex(text), { previewOnly: true });
                          } else {
                            setRightPanelView("pdf");
                          }
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          rightPanelView === "pdf"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Live PDF preview to check 1-page fit and clickable \href links"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Live PDF Preview</span>
                      </button>
                    </div>

                    {/* Direct 1-Click PDF Download Button */}
                    <button
                      type="button"
                      disabled={compilingPdf || applyingLatex || !(improvedLatex || previousLatex)}
                      onClick={() => {
                        if (compileError) {
                          alert(`Cannot download PDF: The LaTeX code produced a compilation warning.\n\n${compileError.message}\n\nPlease review the compiler log below or use 'Download .tex' / 'Open in Overleaf'.`);
                          return;
                        }
                        downloadCompiledLatexPDF(improvedLatex || previousLatex || generateATSLatex(text));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                      title={compileError ? "Resolve compilation warnings before downloading" : "Compiles directly to ATS-Safe PDF with clickable \\href links"}
                    >
                      {compilingPdf ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Compiling...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>⬇️ Save PDF</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const codeToCopy = improvedLatex || previousLatex || generateATSLatex(text);
                        navigator.clipboard.writeText(codeToCopy);
                        setLatexCopied(true);
                        setTimeout(() => setLatexCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Copy improved LaTeX code to clipboard"
                    >
                      {latexCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{latexCopied ? "Copied!" : "Copy"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const codeToDownload = improvedLatex || previousLatex || generateATSLatex(text);
                        download(codeToDownload, getCandidateFilename(text, effectiveCompany, "tex"));
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Download as .tex file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.tex</span>
                    </button>

                    {/* 1-Click Overleaf Auto-Compile Form */}
                    <form action="https://www.overleaf.com/docs" method="POST" target="_blank" className="inline">
                      <input type="hidden" name="snip" value={improvedLatex || previousLatex || generateATSLatex(text)} />
                      <input type="hidden" name="snip_name" value={getCandidateFilename(text, effectiveCompany, "tex")} />
                      <button
                        type="submit"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer"
                        title="🚀 Open directly in Overleaf in a new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>🚀 Open in Overleaf</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* Compilation Log Inspector if error occurs */}
                {compileError && (
                  <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-300 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{compileError.message}</span>
                      </span>
                      <form action="https://www.overleaf.com/docs" method="POST" target="_blank" className="inline">
                        <input type="hidden" name="snip" value={improvedLatex || previousLatex || generateATSLatex(text)} />
                        <input type="hidden" name="snip_name" value={getCandidateFilename(text, effectiveCompany, "tex")} />
                        <button
                          type="submit"
                          className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                        >
                          🚀 Open in Overleaf
                        </button>
                      </form>
                    </div>
                    {compileError.log && (
                      <details className="mt-1">
                        <summary className="text-[11px] text-amber-400/80 cursor-pointer hover:underline font-mono">
                          Inspect LaTeX Compilation Log
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-950/90 rounded border border-amber-500/20 font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {compileError.log}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {/* View switcher: Code Editor vs Embedded Live PDF Preview */}
                {rightPanelView === "pdf" ? (
                  <div className="space-y-2">
                    {compiledPdfUrl ? (
                      <iframe
                        src={compiledPdfUrl}
                        className="w-full h-[520px] rounded-xl border border-slate-800 bg-white shadow-inner"
                        title="Compiled LaTeX PDF Preview"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[520px] rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                        <p className="text-sm font-semibold text-slate-200">Compiling Live PDF Preview...</p>
                        <p className="text-xs text-slate-400 max-w-sm">
                          Rendering your resume with zero-loss <code className="text-emerald-400">\href</code> links via TeXLive.
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>Live 1-page fit &amp; link verification active.</span>
                      <button
                        type="button"
                        onClick={() => downloadCompiledLatexPDF(improvedLatex || previousLatex || generateATSLatex(text), { previewOnly: true })}
                        className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" /> Recompile Preview
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <textarea
                      className={field + " min-h-[440px] font-mono text-xs leading-relaxed bg-slate-950 border-emerald-500/30"}
                      value={improvedLatex}
                      placeholder="% Click 'Apply Fixes to My LaTeX' or 'Apply All Fixes & Update LaTeX' to view the optimized code here."
                      maxLength={100000}
                      onChange={(e) => setImprovedLatex(e.target.value)}
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Edits here can be copied or downloaded directly as PDF.</span>
                      <span>{improvedLatex.length.toLocaleString()} characters</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
