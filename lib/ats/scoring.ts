export type Requirement = { keyword: string; importance: "required" | "preferred"; jobEvidence: string };
export type ResumeLine = { number: number; text: string; section: string };
export type Finding = { severity: "high" | "medium" | "low"; line: number | null; quote: string; issue: string; suggestion: string };
export type Deduction = { points: number; reason: string; category: string };

export interface CommercialPlatformScore {
  id: "jobscan" | "resumeworded" | "vmock" | "naukri" | "taleo";
  name: string;
  badge: string;
  targetAts: string;
  score: number;
  tier: "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR";
  primaryFocus: string;
  whyScoreDrops: string;
  howToBeat: string;
  rubricBreakdown: { label: string; score: number; weight: number; explanation: string }[];
  keyFlags: string[];
}

const headings: [string, RegExp][] = [
  ["skills", /^(technical |core |key |professional )?(skills|technologies|competencies|skill set)\s*:?$/i],
  ["experience", /^(work |professional |relevant |employment )?(experience|employment|work history)\s*:?$/i],
  ["projects", /^(personal |selected |technical |academic )?projects\s*:?$/i],
  ["education", /^(education|academic background|qualifications)\s*:?$/i],
  ["summary", /^(professional |career )?(summary|profile|objective|executive summary)\s*:?$/i],
  ["certifications", /^(certifications?|licenses|certificates)\s*:?$/i],
  ["other", /^(awards|publications|interests|languages)\s*:?$/i],
];

const aliases = [
  ["javascript", "js", "ecmascript", "es6"],
  ["typescript", "ts"],
  ["python", "py", "python3"],
  ["c++", "cpp", "c plus plus"],
  ["c#", "csharp", ".net", "dotnet", "asp.net"],
  ["golang", "go", "go lang"],
  ["java", "j2ee", "jdk", "jvm"],
  ["react", "react.js", "reactjs"],
  ["react native", "react-native", "rn"],
  ["next.js", "nextjs", "next"],
  ["vue", "vue.js", "vuejs", "vue3"],
  ["angular", "angularjs", "angular 2+"],
  ["node.js", "nodejs", "node"],
  ["express", "express.js", "expressjs"],
  ["fastapi", "fast api"],
  ["spring boot", "springboot", "spring framework"],
  ["tailwind", "tailwind css", "tailwindcss"],
  ["html", "html5"],
  ["css", "css3", "scss", "sass"],
  ["postgresql", "postgres", "psql"],
  ["mongodb", "mongo", "nosql"],
  ["mysql", "my sql", "mariadb"],
  ["redis", "redis cache", "in-memory cache"],
  ["aws", "amazon web services", "ec2", "s3", "lambda"],
  ["gcp", "google cloud", "google cloud platform"],
  ["azure", "microsoft azure"],
  ["docker", "containerization", "containers"],
  ["kubernetes", "k8s", "eks", "gke"],
  ["ci/cd", "cicd", "continuous integration", "continuous deployment", "github actions", "jenkins"],
  ["terraform", "iac", "infrastructure as code"],
  ["rest", "rest api", "restful", "restful api", "restful apis"],
  ["graphql", "gql", "apollo"],
  ["websocket", "websockets", "socket.io", "ws"],
  ["webrtc", "web rtc", "real-time streaming"],
  ["microservices", "microservice", "microservice architecture"],
  ["distributed systems", "distributed computing", "scalable systems"],
  ["oop", "object-oriented programming", "object oriented programming"],
  ["dsa", "data structures and algorithms", "data structures", "algorithms"],
  ["machine learning", "ml", "deep learning", "dl"],
  ["artificial intelligence", "ai", "genai", "generative ai"],
  ["llm", "llms", "large language models", "large language model"],
  ["rag", "retrieval-augmented generation", "retrieval augmented generation"],
  ["agentic ai", "ai agents", "multi-agent systems", "langchain", "langgraph"],
  ["nlp", "natural language processing"],
  ["computer vision", "cv", "opencv", "yolo", "ocr"],
  ["git", "github", "gitlab", "version control"],
  ["linux", "unix", "bash", "shell scripting"],
  ["agile", "scrum", "agile/scrum", "kanban", "jira"],
  ["sql", "relational databases", "rdbms"],
  ["system design", "high level design", "hld", "low level design", "lld"]
];

const WEAK_VERBS_RE = /\b(responsible for|duties included|assisted with|assisted in|worked on|helped with|helped|participated in|handled|was involved in)\b/gi;
export const METRIC_RE = /(?:\b\d+(?:\.\d+)?%|\$\s*\d+(?:\.\d+)?[kmbKMB]?|\b\d+(?:\.\d+)?x\b|\b\d[\d,.]*\+?\s*(?:ms|sec|seconds|mins|minutes|hours|days|weeks|months|years|users|clients|customers|tenants|organizations|companies|requests|req\/s|rps|tps|queries|apis|microservices|services|endpoints|routes|nodes|drones|devices|sensors|engineers|developers|members|teams|projects|applications|apps|modules|components|screens|pages|models|datasets|classes|tables|schemas|containers|clusters|pipelines|workflows|records|transactions|downloads|views|visits|stars|problems|bugs|issues|tickets|tests|metrics|reports|documents|drawings|channels|streams)\b|\b(?:reduced|increased|improved|accelerated|boosted|cut|saved|scaled|grew|achieved|delivered|optimized|automated|eliminated|decreased|expanded|supported|handled|processed)\b[^.]{1,50}\b\d+|\b(?:zero[\s-]downtime|sub-second|real-time|multi-tenant|high-availability|production-grade)\b)/i;
const DATE_RE = /\b(?:0?[1-9]|1[0-2])\/\d{4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b|\b\d{4}\s*[-–—]\s*(?:present|current|\d{4})\b/gi;

const monthMap: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDatePoint(str: string): Date | null {
  const s = str.trim().toLowerCase();
  if (s === "present" || s === "current" || s === "now") return new Date();
  // MM/YYYY
  const mmYyyy = s.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  if (mmYyyy) return new Date(parseInt(mmYyyy[2], 10), parseInt(mmYyyy[1], 10) - 1, 1);
  // Month YYYY
  const monYyyy = s.match(/^([a-z]{3})[a-z]*\s+(\d{4})$/);
  if (monYyyy && monthMap[monYyyy[1]] !== undefined) {
    return new Date(parseInt(monYyyy[2], 10), monthMap[monYyyy[1]], 1);
  }
  // Just YYYY
  const yyyy = s.match(/^(\d{4})$/);
  if (yyyy) return new Date(parseInt(yyyy[1], 10), 0, 1);
  return null;
}

/**
 * Normalizes Taleo-breaking smart typography: curly quotes, dashes, and bullet marks to clean ASCII.
 */
export function cleanSmartTypography(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

/**
 * Merges multi-line PDF/DOCX wrapped bullets inside experience and projects sections into
 * complete, unbroken lines so no sentences or metrics are lost on wrapped lines.
 */
export function normalizeWrappedBullets(rawText: string): string {
  if (!rawText) return "";
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+/;
  const SUBHEADER_RE = /\b(?:20\d\d|19\d\d|present|current)\b|\|/i;

  let currentSection = "contact";
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    const headingMatch = headings.find(([, regex]) => regex.test(trimmed));
    if (headingMatch) {
      currentSection = headingMatch[0];
      result.push(rawLine);
      continue;
    }

    const inBulletSection = ["experience", "projects"].includes(currentSection);

    if (inBulletSection && BULLET_START_RE.test(rawLine)) {
      let mergedBullet = rawLine;

      while (i + 1 < lines.length) {
        const nextRaw = lines[i + 1];
        const nextTrimmed = nextRaw.trim();

        if (!nextTrimmed) break;

        const nextIsHeading = headings.some(([, regex]) => regex.test(nextTrimmed));
        if (nextIsHeading) break;

        if (BULLET_START_RE.test(nextRaw)) break;

        if (SUBHEADER_RE.test(nextTrimmed)) break;

        const startsWithLower = /^[a-z]/.test(nextTrimmed);
        const prevEndsWithoutPunctuation = !/[.!?]$/.test(mergedBullet.trim());
        const isContinuingPhrase = /^(?:and|or|to|for|with|by|in|at|on|using|which|that|reducing|improving|resulting|saving|increasing|scaling|delivering|achieving|across|over|from|into|through|via|\d+(?:\.\d+)?%|\$\d+)\b/i.test(nextTrimmed);

        if (startsWithLower || prevEndsWithoutPunctuation || isContinuingPhrase) {
          if (mergedBullet.trimEnd().endsWith("-") && !mergedBullet.trimEnd().endsWith(" -")) {
            mergedBullet = mergedBullet.trimEnd().slice(0, -1) + nextTrimmed;
          } else {
            mergedBullet = mergedBullet.trimEnd() + " " + nextTrimmed;
          }
          i++;
        } else {
          break;
        }
      }

      result.push(mergedBullet);
    } else {
      result.push(rawLine);
    }
  }

  return result.join("\n");
}

export function resumeLines(text: string): ResumeLine[] {
  const normalized = normalizeWrappedBullets(text);
  let section = "contact";
  return normalized.replace(/\r\n?/g, "\n").split("\n").map((text, index) => {
    const match = headings.find(([, regex]) => regex.test(text.trim()));
    if (match) section = match[0];
    return { number: index + 1, text, section };
  });
}

export function containsSkill(text: string, keyword: string): boolean {
  const key = keyword.toLowerCase().trim();
  const terms = aliases.find(group => group.includes(key)) || [key];
  return terms.some(term => {
    const escaped = [...term].map(c => /[a-z0-9 ]/i.test(c) ? c : "\\" + c).join("");
    return new RegExp("(^|[^a-z0-9+#])" + escaped + "(?=$|[^a-z0-9+#])", "i").test(text);
  });
}

/**
 * Count how many times a keyword (or its aliases) appears in the full text.
 * Used for keyword stuffing penalty.
 */
function countKeywordOccurrences(text: string, keyword: string): number {
  const key = keyword.toLowerCase().trim();
  const terms = aliases.find(group => group.includes(key)) || [key];
  let count = 0;
  for (const term of terms) {
    const escaped = [...term].map(c => /[a-z0-9 ]/i.test(c) ? c : "\\" + c).join("");
    const re = new RegExp("(^|[^a-z0-9+#])" + escaped + "(?=$|[^a-z0-9+#])", "gi");
    const matches = text.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Deterministically extracts technical requirements from Job Description text using the synonym taxonomy.
 */
export function extractRequirementsFromJobText(jobText: string): Requirement[] {
  if (!jobText || !jobText.trim()) return [];
  const cleanJD = jobText.toLowerCase();
  const extracted: Requirement[] = [];
  const seen = new Set<string>();

  // Scan all 50+ canonical tech families in aliases deterministically
  for (const group of aliases) {
    const canonical = group[0];
    if (seen.has(canonical)) continue;
    const matched = group.some((term) => {
      const escaped = [...term].map((c) => (/[a-z0-9 ]/i.test(c) ? c : "\\" + c)).join("");
      return new RegExp("(^|[^a-z0-9+#])" + escaped + "(?=$|[^a-z0-9+#])", "i").test(cleanJD);
    });
    if (matched) {
      seen.add(canonical);
      // Count occurrences in JD: if mentioned 2+ times or near "required/must", mark as required
      const occ = countKeywordOccurrences(cleanJD, canonical);
      extracted.push({
        keyword: canonical.toUpperCase() === canonical ? canonical : canonical.replace(/\b\w/g, (c) => c.toUpperCase()),
        importance: occ >= 2 ? "required" : "preferred",
        jobEvidence: "Deterministically matched in Job Description",
      });
    }
  }
  return extracted;
}

export function scoreResume(text: string, requirements: Requirement[] = [], rawJobText?: string) {
  const lines = resumeLines(text);
  const findings: Finding[] = [];
  const deductions: Deduction[] = [];
  const sections = [...new Set(lines.filter(l => l.text.trim()).map(l => l.section))];
  const fullText = text;
  const words = text.trim().split(/\s+/).length;

  // ── Chronological Career Gap & Experience Range Parser ──
  const expLines = lines.filter(l => l.section === "experience");
  const expText = expLines.map(l => l.text).join("\n");

  // Find date ranges in experience: "Jan 2022 - Mar 2024", "01/2022 – Present", "2021 - 2023"
  const RANGE_RE = /((?:(?:0?[1-9]|1[0-2])\/\d{4})|(?:[a-z]{3}[a-z]*\s+\d{4})|\b\d{4}\b)\s*[-–—to]+\s*((?:(?:0?[1-9]|1[0-2])\/\d{4})|(?:[a-z]{3}[a-z]*\s+\d{4})|\b\d{4}\b|present|current|now)/gi;
  const parsedRanges: { start: Date; end: Date }[] = [];
  let rangeMatch: RegExpExecArray | null;

  while ((rangeMatch = RANGE_RE.exec(expText)) !== null) {
    const sDate = parseDatePoint(rangeMatch[1]);
    const eDate = parseDatePoint(rangeMatch[2]);
    if (sDate && eDate && sDate <= eDate) {
      parsedRanges.push({ start: sDate, end: eDate });
    }
  }

  // Calculate estimated total years of experience (sum of unique months or range spans)
  let totalMonths = 0;
  for (const r of parsedRanges) {
    const months = (r.end.getFullYear() - r.start.getFullYear()) * 12 + (r.end.getMonth() - r.start.getMonth());
    totalMonths += Math.max(1, months);
  }
  const estimatedYearsOfExperience = parsedRanges.length > 0 ? Math.round((totalMonths / 12) * 10) / 10 : 0;
  const isExperienced = estimatedYearsOfExperience >= 1 || expLines.length >= 8;

  // Check for unexplained career gaps > 6 months between consecutive roles
  if (parsedRanges.length >= 2) {
    const sortedRanges = [...parsedRanges].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const currentEnd = sortedRanges[i].end;
      const nextStart = sortedRanges[i + 1].start;
      const gapMonths = (nextStart.getFullYear() - currentEnd.getFullYear()) * 12 + (nextStart.getMonth() - currentEnd.getMonth());
      if (gapMonths > 6) {
        findings.push({
          severity: "low",
          line: null,
          quote: `${currentEnd.toLocaleDateString("en-US", { month: "short", year: "numeric" })} – ${nextStart.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
          issue: `Potential employment gap (>6 months: ~${gapMonths} months) detected between roles`,
          suggestion: "ATS chronology filters flag gaps over 6 months. Consider adding freelance projects, certifications, or career transition notes to explain this timeline.",
        });
        break; // Flag once
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 1. SECTION STRUCTURE (weight: 25%)
  // ──────────────────────────────────────────────────────────────
  const coreRequired = ["skills", "experience", "education"];
  const missing = coreRequired.filter(s => !sections.includes(s) && !(s === "experience" && sections.includes("projects")));
  missing.forEach(section => {
    findings.push({ severity: "high", line: null, quote: "", issue: "No clear " + section + " heading detected", suggestion: "Use a standard " + (section === "experience" ? "Experience or Projects" : section) + " heading." });
    deductions.push({ points: 8, reason: `Missing standard whitelisted section heading: "${section}"`, category: "Structure" });
  });

  // Bonus sections: summary, projects, certifications
  const hasSummary = sections.includes("summary");
  const hasProjects = sections.includes("projects");
  const hasCerts = sections.includes("certifications");

  if (!hasSummary) {
    if (!isExperienced) {
      deductions.push({ points: 3, reason: "No Professional Summary / Profile section detected.", category: "Structure" });
    } else {
      findings.push({ severity: "low", line: null, quote: "", issue: "Professional Summary section omitted", suggestion: "Optional: Adding a 2-3 line executive summary can quickly highlight core tech stack and domain expertise." });
    }
  }

  let sStructure: number;
  if (missing.length === 0) {
    sStructure = (hasSummary || hasProjects || hasCerts || isExperienced) ? 100 : 92;
  } else {
    sStructure = Math.max(0, Math.min(100,
      Math.round(((coreRequired.length - missing.length) / coreRequired.length) * 80) +
      (hasSummary ? 10 : 0) + (hasProjects ? 5 : 0) + (hasCerts ? 5 : 0)
    ));
  }

  // ──────────────────────────────────────────────────────────────
  // 2. CONTACT DETAILS (weight: 15%)
  // ──────────────────────────────────────────────────────────────
  const contactText = lines.filter(l => l.section === "contact").slice(0, 15).map(l => l.text).join("\n");
  const contacts = [
    { label: "Name", present: lines.slice(0, 5).some(l => l.section === "contact" && /^[\p{L}][\p{L} .'-]{3,70}$/u.test(l.text.trim())) },
    { label: "Email", present: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(contactText) },
    { label: "Phone", present: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?){2,3}\d{3,5}/.test(contactText) },
  ];
  contacts.filter(c => !c.present).forEach(c => {
    findings.push({ severity: "medium", line: null, quote: "", issue: c.label + " not detected near the top", suggestion: "Check that your " + c.label.toLowerCase() + " appears as readable text in the resume body." });
    deductions.push({ points: 5, reason: `Missing parsable ${c.label} in resume header.`, category: "Contact" });
  });

  // Professional links (LinkedIn / GitHub / Portfolio)
  const hasProfileLink = /(?:linkedin\.com\/in\/|github\.com\/|gitlab\.com\/|[\w-]+\.(?:dev|me|io)\b)/i.test(contactText);
  if (!hasProfileLink) {
    findings.push({ severity: "low", line: null, quote: "", issue: "No LinkedIn, GitHub or portfolio link found in header", suggestion: "Include your LinkedIn profile URL or portfolio link in the contact section." });
    deductions.push({ points: 3, reason: "Missing LinkedIn or GitHub profile URL.", category: "Contact" });
  }

  // Education metadata: CGPA/GPA/Percentage (important for campus/Naukri Resdex indexing, optional for experienced)
  const hasGPA = /\b(cgpa|gpa|percentage|\d(\.\d{1,2})?\s*\/\s*10)\b/i.test(fullText);
  if (!hasGPA && !isExperienced) {
    deductions.push({ points: 2, reason: "No explicit GPA/CGPA/Percentage in Education (required by Naukri Resdex portal ranking).", category: "Naukri/Portal" });
  }

  const gpaPoints = hasGPA || isExperienced ? 15 : 5;
  let sContact = Math.max(0, Math.min(100,
    Math.round((contacts.filter(c => c.present).length / 3) * 70) +
    (hasProfileLink ? 15 : 0) +
    gpaPoints
  ));

  // ──────────────────────────────────────────────────────────────
  // 3. TEXT READABILITY & FORMATTING (weight: 30%)
  // ──────────────────────────────────────────────────────────────
  // Encoding / corrupted glyph detection
  const badLines = lines.filter(l => /\uFFFD|[\u0000-\u0008\u000b\u000e-\u001f]/.test(l.text));
  badLines.forEach(l => {
    findings.push({ severity: "high", line: l.number, quote: l.text, issue: "Possible extraction or encoding error", suggestion: "Compare this line with the original document and fix unreadable characters." });
  });

  // Non-ASCII typography (em-dashes, smart quotes) that break Taleo/Workday
  const hasSmartTypography = /[\u2014\u2013\u201C\u201D\u2018\u2019]/.test(fullText);
  if (hasSmartTypography) {
    deductions.push({ points: 3, reason: "Contains smart quotes or em-dashes (—, \", \") that may break Oracle Taleo and older ATS parsers.", category: "Formatting" });
  }

  // Table / column formatting artifacts
  const tableArtifacts = lines.filter(l => /(?:\|\s*\w+\s*\||\t{2,})/.test(l.text));
  for (const line of tableArtifacts.slice(0, 2)) {
    findings.push({ severity: "medium", line: line.number, quote: line.text, issue: "Table or multi-column separator detected", suggestion: "Tables and multi-column text boxes frequently cause ATS parsing errors. Use clean standard text formatting." });
  }

  // Date serialization check (MM/YYYY or Month YYYY)
  const dateMatches = fullText.match(DATE_RE) || [];
  if (dateMatches.length < 2) {
    deductions.push({ points: 5, reason: `Only ${dateMatches.length} standard date(s) detected (Month YYYY or MM/YYYY). Most ATS systems require clear start/end dates for each role.`, category: "Formatting" });
    findings.push({ severity: "medium", line: null, quote: "", issue: "Fewer than 2 standard employment/education dates detected", suggestion: "Use Month YYYY (e.g. Jan 2023) or MM/YYYY format for each role's start and end dates." });
  }

  // ── 1-Page vs 2-Page Resume Length Calibration ──
  const estimatedPages = words > 750 || lines.length > 62 ? 2 : 1;
  if (estimatedPages > 1) {
    findings.push({
      severity: "low",
      line: null,
      quote: `${words} words, ~${lines.length} lines`,
      issue: `~2 Pages detected (${words} words)`,
      suggestion: "ATS parsers parse 2-page resumes without penalty. Ensure Page 2 is at least 50% full and highest-priority keywords appear on Page 1.",
    });
  }

  // Word count density
  if (words < 100) {
    findings.push({ severity: "medium", line: null, quote: "", issue: "Very little resume text extracted", suggestion: "Check the extraction preview for missing pages or sections." });
    deductions.push({ points: 8, reason: `Critically sparse resume text (${words} words). ATS ranking requires minimum 250 words.`, category: "Density" });
  } else if (words < 250) {
    deductions.push({ points: 4, reason: `Resume text is sparse (${words} words). Optimal ATS density is 400–900 words.`, category: "Density" });
  } else if (words > 1400) {
    findings.push({ severity: "medium", line: null, quote: "", issue: "Resume may be excessively long (>1400 words)", suggestion: "Keep the most relevant experience and shorten repeated details to prevent recruiter fatigue." });
    deductions.push({ points: 4, reason: `Resume is excessively long (${words} words). Condense to under 1200 words.`, category: "Density" });
  }

  // ──────────────────────────────────────────────────────────────
  // 4. EVIDENCE OF IMPACT / QUANTIFICATION (weight: 30%)
  // ──────────────────────────────────────────────────────────────
  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+|^\s*(?:built|developed|led|created|engineered|implemented|designed|improved|reduced|managed|delivered|worked|responsible|architected|automated|orchestrated|spearheaded|optimized|deployed|scaled|refactored|integrated|migrated|accelerated|resolved|launched|pioneered|formulated|streamlined|configured|authored|mentored|established|collaborated|analyzed|conducted|maintained|upgraded)\b/i;

  const bullets = lines.filter(l =>
    ["experience", "projects"].includes(l.section) &&
    l.text.trim().length > 25 &&
    BULLET_START_RE.test(l.text)
  );
  const quantified = bullets.filter(l => METRIC_RE.test(l.text));

  // Passive phrasing check in bullets
  const passiveBullets = bullets.filter(l => WEAK_VERBS_RE.test(l.text));
  for (const line of passiveBullets.slice(0, 4)) {
    findings.push({ severity: "medium", line: line.number, quote: line.text, issue: "Passive duty-oriented language detected", suggestion: "Replace passive phrases like 'responsible for' with assertive action verbs (e.g. 'Architected', 'Spearheaded', 'Optimized')." });
  }
  if (passiveBullets.length > 0) {
    deductions.push({ points: Math.min(8, passiveBullets.length * 2), reason: `${passiveBullets.length} bullet(s) use weak/passive duty language ("responsible for", "worked on", etc.).`, category: "Impact" });
  }

  // Dense bullet points check (> 60 words)
  const denseBullets = bullets.filter(l => l.text.trim().split(/\s+/).length > 60);
  for (const line of denseBullets.slice(0, 3)) {
    findings.push({ severity: "low", line: line.number, quote: line.text, issue: "Dense bullet point (>60 words)", suggestion: "Shorten bullet to 1-3 lines. ATS and hiring managers favor scannable achievements." });
  }

  // Flag unquantified bullets
  for (const line of bullets.filter(l => !quantified.includes(l) && !passiveBullets.includes(l)).slice(0, 4)) {
    findings.push({ severity: "low", line: line.number, quote: line.text, issue: "No measurable outcome detected", suggestion: "If you have a verified result, describe its scale or outcome using the Google XYZ formula (Accomplished X measured by Y by doing Z)." });
  }

  // Action Verb Repetition Check: Inspect the first word of every bullet point
  const startingVerbFreq = new Map<string, number>();
  for (const b of bullets) {
    const cleanText = b.text.trim().replace(/^[-•–—*∗▪▫◦‣▸▹➢➣→+]\s*|^\d+[.)]\s*/, "");
    const firstWordMatch = cleanText.match(/^([a-zA-Z]+)/);
    if (firstWordMatch) {
      const verb = firstWordMatch[1].charAt(0).toUpperCase() + firstWordMatch[1].slice(1).toLowerCase();
      startingVerbFreq.set(verb, (startingVerbFreq.get(verb) || 0) + 1);
    }
  }

  const repeatedActionVerbs: { verb: string; count: number }[] = [];
  for (const [verb, count] of startingVerbFreq.entries()) {
    if (count >= 3) {
      repeatedActionVerbs.push({ verb, count });
      deductions.push({
        points: 2,
        reason: `Action verb repetition: "${verb}" starts ${count} different bullet points. Diversify bullet openers.`,
        category: "Impact",
      });
      findings.push({
        severity: "low",
        line: null,
        quote: verb,
        issue: `Action verb repetition: "${verb}" used ${count} times as bullet starter`,
        suggestion: `Use diverse strong verbs (e.g. Architected, Orchestrated, Spearheaded, Accelerated, Engineered) instead of repeating "${verb}".`,
      });
    }
  }

  // Restore the PRD's 1.45 curve on sQuant so quantifying ~68% of bullets reaches 100%, and cap verb penalties gently
  const quantRatio = bullets.length > 0 ? quantified.length / bullets.length : 0;
  let sQuant = bullets.length ? Math.min(100, Math.round(quantRatio * 1.45 * 100)) : 50;

  const passivePenalty = Math.min(15, passiveBullets.length * 4);
  const repetitionPenalty = Math.min(8, repeatedActionVerbs.length * 2);
  const densityBulletPenalty = Math.min(6, denseBullets.length * 2);
  sQuant = Math.max(25, sQuant - passivePenalty - repetitionPenalty - densityBulletPenalty);

  // ──────────────────────────────────────────────────────────────
  // 5. NAUKRI RESDEX / PORTAL COMPATIBILITY CHECKS
  // ──────────────────────────────────────────────────────────────
  // Project count: Resdex heavily indexes fresher candidates who document 3+ distinct projects
  const projectLines = lines.filter(l => l.section === "projects" && l.text.trim().length > 0);
  const projectHeadingMatches = projectLines.filter(l => {
    const trimmed = l.text.trim();
    // A project heading is a non-bullet line that's short-ish and title-like
    return trimmed.length > 3 && trimmed.length < 120 && !/^[\s•\-*]/.test(trimmed) && /^[A-Z\d]/.test(trimmed);
  });
  if (!isExperienced && projectHeadingMatches.length < 2) {
    deductions.push({ points: 2, reason: `Only ${projectHeadingMatches.length} distinct project(s) detected. Naukri Resdex ranks campus/fresher profiles higher with 3+ documented projects.`, category: "Naukri/Portal" });
  }

  // Keyword stuffing penalty: if any single keyword appears 8+ times
  const allWords = fullText.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  for (const w of allWords) {
    const clean = w.replace(/[^a-z0-9+#.]/g, "");
    if (clean.length >= 3) wordFreq.set(clean, (wordFreq.get(clean) || 0) + 1);
  }
  const stuffedKeywords: string[] = [];
  for (const [word, freq] of wordFreq) {
    if (freq >= 8 && !["the", "and", "for", "with", "that", "this", "from", "was", "are", "were", "has", "have", "been"].includes(word)) {
      stuffedKeywords.push(`"${word}" (${freq}×)`);
    }
  }
  if (stuffedKeywords.length > 0) {
    const penalty = Math.min(10, stuffedKeywords.length * 3);
    deductions.push({ points: penalty, reason: `Keyword stuffing detected: ${stuffedKeywords.join(", ")}. Taleo and Resdex flag >8 repetitions as spam.`, category: "Formatting" });
    findings.push({ severity: "medium", line: null, quote: stuffedKeywords.join(", "), issue: "Keyword stuffing risk detected", suggestion: "Reduce keyword repetitions to 3–5 natural mentions max. ATS parsers like Taleo and Resdex penalize excessive repetition." });
  }

  // Calibrate readability deductions directly
  const stuffingPenalty = Math.min(12, stuffedKeywords.length * 4);

  const readability = Math.max(0, 100
    - Math.min(60, badLines.length * 20)
    - (tableArtifacts.length ? 10 : 0)
    - (hasSmartTypography ? 5 : 0)
    - (words < 100 ? 20 : words < 250 ? 8 : 0)
    - (words > 1400 ? 10 : 0)
    - (dateMatches.length < 2 ? 10 : 0)
    - stuffingPenalty
  );

  // ──────────────────────────────────────────────────────────────
  // 6. CATEGORY SCORING & COMPOSITE
  // ──────────────────────────────────────────────────────────────
  const categories = [
    { label: "Text readability", score: readability, weight: 30, explanation: `Encoding integrity, date formatting, word density (${words} words), and ATS parser compatibility.` },
    { label: "Section structure", score: sStructure, weight: 25, explanation: `${coreRequired.length - missing.length}/${coreRequired.length} core sections found` + (hasSummary ? " + Summary" : "") + (hasProjects ? " + Projects" : "") + (hasCerts ? " + Certifications" : "") + "." },
    { label: "Contact details", score: sContact, weight: 15, explanation: `${contacts.filter(c => c.present).length}/3 contact items` + (hasProfileLink ? " + profile link" : "") + (hasGPA ? " + GPA" : "") + "." },
    { label: "Evidence of impact", score: sQuant, weight: 30, explanation: `${quantified.length} of ${bullets.length} achievement bullets contain measurable outcomes (${Math.round(quantRatio * 100)}% quantification ratio).` },
  ].map(c => ({ ...c, points: Math.round(c.score * c.weight) / 100 }));

  const standaloneScore = Math.round(categories.reduce((sum, c) => sum + c.points, 0));

  // ──────────────────────────────────────────────────────────────
  // 7. JD KEYWORD MATCHING WITH TWICE RULE
  // ──────────────────────────────────────────────────────────────
  const deterministicReqs = (rawJobText && extractRequirementsFromJobText(rawJobText).length > 0)
    ? extractRequirementsFromJobText(rawJobText)
    : requirements;

  const matches = deterministicReqs.map(requirement => {
    const evidence = lines.filter(l => containsSkill(l.text, requirement.keyword));
    const inSkills = evidence.some(l => l.section === "skills");
    const inExperience = evidence.some(l => ["experience", "projects"].includes(l.section));
    const multiplier = inSkills && inExperience ? 1 : inExperience ? 0.6 : inSkills ? 0.4 : evidence.length ? 0.2 : 0;

    // Keyword stuffing penalty per requirement
    const totalOccurrences = countKeywordOccurrences(fullText, requirement.keyword);
    const stuffingMultiplier = totalOccurrences > 8 ? 0.7 : 1.0;

    return {
      ...requirement,
      evidence,
      placement: inSkills && inExperience ? "Skills + experience" : inExperience ? "Experience / projects" : inSkills ? "Skills only" : evidence.length ? "Elsewhere" : "Not found",
      multiplier: multiplier * stuffingMultiplier,
      weight: requirement.importance === "required" ? 3 : 1,
    };
  });

  const denominator = matches.reduce((sum, r) => sum + r.weight, 0);
  const matchScore = denominator ? Math.round(100 * matches.reduce((sum, r) => sum + r.multiplier * r.weight, 0) / denominator) : null;

  // Composite: if JD provided, blend 45% standalone + 55% match; else 100% standalone
  const compositeScore = matchScore !== null
    ? Math.round(0.45 * standaloneScore + 0.55 * matchScore)
    : standaloneScore;

  // ──────────────────────────────────────────────────────────────
  // 8. COMMERCIAL ATS ENGINE SIMULATORS
  // ──────────────────────────────────────────────────────────────
  const getTier = (s: number): "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR" =>
    s >= 85 ? "EXCELLENT" : s >= 70 ? "GOOD" : s >= 55 ? "AVERAGE" : "POOR";

  // 1. Jobscan / SkillSyncer (Enterprise Keyword Matcher)
  const strictMatchScore = matches.length > 0
    ? Math.round(100 * matches.filter(m => m.placement === "Skills + experience").length / matches.length)
    : (matchScore ?? 65);
  const hasTargetTitle = lines.slice(0, 10).some(l =>
    /(?:software|frontend|backend|full[\s-]?stack|engineer|developer|architect|data|devops|cloud|analyst|manager|specialist|consultant)\b/i.test(l.text)
  );
  const titleScore = hasTargetTitle ? 92 : 55;
  const jobscanRaw = Math.round(
    (matchScore !== null ? 0.65 * strictMatchScore : 0.60 * (sStructure >= 80 ? 75 : 60)) +
    0.20 * readability +
    0.15 * titleScore
  );
  const jobscanScore = Math.max(0, Math.min(100, jobscanRaw));

  // 2. Resume Worded / Enhancv (Recruiter Impact & Action)
  const actionVerbScore = Math.max(0, 100 - (passiveBullets.length * 15));
  const brevityScore = Math.max(0, 100 - (denseBullets.length * 20) - (words > 900 ? 15 : words < 300 ? 20 : 0));
  const rwStyleScore = Math.round(0.60 * sStructure + 0.40 * sContact);
  const resumeWordedRaw = Math.round(
    0.45 * sQuant +
    0.25 * actionVerbScore +
    0.15 * brevityScore +
    0.15 * rwStyleScore
  );
  const resumeWordedScore = Math.max(0, Math.min(100, resumeWordedRaw));

  // 3. VMock / Big Interview (Placement & University ATS)
  const vmockLangScore = Math.max(0, 100 - (passiveBullets.length * 12) - (quantRatio < 0.4 ? 15 : 0));
  const vmockProjDepth = !hasProjects && isExperienced ? (bullets.length >= 6 ? 90 : 75) : (hasProjects ? 95 : 55);
  const vmockImpactScore = Math.round(0.60 * sQuant + 0.40 * vmockProjDepth);
  const vmockChronoScore = dateMatches.length >= 2 ? (hasSmartTypography ? 75 : 95) : 50;
  const vmockAcadScore = (hasGPA || isExperienced ? 50 : 25) + (sections.includes("education") ? 50 : 25);
  const vmockRaw = Math.round(
    0.40 * vmockLangScore +
    0.30 * vmockImpactScore +
    0.20 * vmockChronoScore +
    0.10 * vmockAcadScore
  );
  const vmockScore = Math.max(0, Math.min(100, vmockRaw));

  // 4. Naukri Resdex / Indeed (Job Board Search Engine)
  const naukriKwScore = stuffedKeywords.length > 0 ? 55 : (words >= 400 ? 90 : 65);
  const naukriProjScore = !hasProjects && isExperienced
    ? (bullets.length >= 6 ? 90 : 75)
    : (projectHeadingMatches.length >= 3 ? 100 : projectHeadingMatches.length >= 2 ? 75 : projectHeadingMatches.length >= 1 ? 50 : 25);
  const naukriContactScore = (hasProfileLink ? 50 : 0) + (contacts.filter(c => c.present).length === 3 ? 50 : 25);
  const naukriEduScore = (hasGPA || isExperienced ? 60 : 30) + (sections.includes("education") ? 40 : 10);
  const naukriRaw = Math.round(
    0.35 * naukriKwScore +
    0.25 * naukriProjScore +
    0.20 * naukriContactScore +
    0.20 * naukriEduScore
  );
  const naukriScore = Math.max(0, Math.min(100, naukriRaw));

  // 5. Oracle Taleo / Workday Machine Parser Fidelity
  const taleoHeadScore = Math.round(((coreRequired.length - missing.length) / coreRequired.length) * 100);
  const taleoColScore = tableArtifacts.length === 0 ? 100 : Math.max(20, 100 - tableArtifacts.length * 30);
  const taleoUtfScore = (!hasSmartTypography && badLines.length === 0) ? 100 : Math.max(30, 100 - (hasSmartTypography ? 30 : 0) - badLines.length * 35);
  const taleoDateScore = dateMatches.length >= 2 ? 100 : 40;
  const taleoRaw = Math.round(
    0.30 * taleoHeadScore +
    0.25 * taleoColScore +
    0.25 * taleoUtfScore +
    0.20 * taleoDateScore
  );
  const taleoScore = Math.max(0, Math.min(100, taleoRaw));

  const commercialScores: CommercialPlatformScore[] = [
    {
      id: "jobscan",
      name: "Jobscan / SkillSyncer",
      badge: "Enterprise Keyword Matcher",
      targetAts: "Workday, Taleo, iCIMS, Greenhouse",
      score: jobscanScore,
      tier: getTier(jobscanScore),
      primaryFocus: "65% Exact Keyword Match + 20% Formatting + 15% Title Parity",
      whyScoreDrops: "Penalizes synonym variations (e.g. React.js vs React if exact mode is active) and docks if required keywords appear in Skills but not in Experience bullet points.",
      howToBeat: "Include the target job title in your header. Mirror JD hard skills verbatim across both your Skills list and bullet points (Twice Rule) to pass the 80%+ threshold.",
      rubricBreakdown: [
        { label: "Exact Keyword Match", score: matchScore !== null ? strictMatchScore : 65, weight: 65, explanation: "Verbatim repetition of JD keywords across Skills and Experience." },
        { label: "Layout & Formatting", score: readability, weight: 20, explanation: "OCR extractability, date format, and text density." },
        { label: "Job Title Alignment", score: titleScore, weight: 15, explanation: "Target job title presence in resume header or summary." },
      ],
      keyFlags: [
        ...(!hasTargetTitle ? ["Target job title missing from top header/summary."] : []),
        ...(strictMatchScore < 70 && matchScore !== null ? ["Low exact keyword alignment between JD and experience bullets."] : []),
        ...(readability < 75 ? ["Layout formatting artifacts reduce parser score."] : []),
      ],
    },
    {
      id: "resumeworded",
      name: "Resume Worded / Enhancv",
      badge: "Recruiter Readability & Impact",
      targetAts: "Recruiter Readability, Executive Screening",
      score: resumeWordedScore,
      tier: getTier(resumeWordedScore),
      primaryFocus: "45% Quantified Metrics (XYZ/PAR) + 25% Action Verbs + 15% Brevity + 15% Style",
      whyScoreDrops: "Ignores JD matching in its base scan; heavily docks unquantified bullets, passive duty language ('responsible for', 'worked on'), and dense bullet blocks over 60 words.",
      howToBeat: "Ensure >=66% of experience bullets contain concrete numbers (%, $, scale, users). Start every bullet with a strong action verb (Architected, Engineered, Optimized) and avoid passive phrases.",
      rubricBreakdown: [
        { label: "Bullet Quantification", score: sQuant, weight: 45, explanation: `${quantified.length}/${bullets.length} bullets contain measurable outcomes.` },
        { label: "Action Verbs & Voice", score: actionVerbScore, weight: 25, explanation: `${passiveBullets.length} bullet(s) use weak passive phrasing.` },
        { label: "Brevity & Scannability", score: brevityScore, weight: 15, explanation: `${denseBullets.length} dense bullet(s) >60 words.` },
        { label: "Style & Structure", score: rwStyleScore, weight: 15, explanation: "Visual cleanliness and section flow." },
      ],
      keyFlags: [
        ...(quantRatio < 0.5 ? [`Only ${Math.round(quantRatio * 100)}% of bullets quantified. Resume Worded targets >=66%.`] : []),
        ...(passiveBullets.length > 0 ? [`${passiveBullets.length} bullet(s) flagged for passive duty language.`] : []),
        ...(denseBullets.length > 0 ? [`${denseBullets.length} bullet(s) exceed 60 words.`] : []),
      ],
    },
    {
      id: "vmock",
      name: "VMock / Big Interview",
      badge: "University & Placement ATS",
      targetAts: "Campus Placement, Graduate Recruiting Programs",
      score: vmockScore,
      tier: getTier(vmockScore),
      primaryFocus: "40% Action Language + 30% Problem Solving + 20% Chronology + 10% Academic Rigor",
      whyScoreDrops: "Rigid placement rubric that heavily penalizes missing GPA/CGPA in Education, inconsistent date formats, or having fewer than 3 bullet points per role.",
      howToBeat: "Ensure Education has explicit GPA/CGPA. Keep all employment and project dates strictly in 'Month YYYY – Month YYYY' format and maintain 3–5 bullets per position.",
      rubricBreakdown: [
        { label: "Action-Oriented Language", score: vmockLangScore, weight: 40, explanation: "Functional competence demonstrated via strong verbs." },
        { label: "Problem Solving & Impact", score: vmockImpactScore, weight: 30, explanation: !hasProjects && isExperienced ? `Evaluated on work experience bullet depth (${bullets.length} bullets).` : "Quantified project accomplishments and analytical scope." },
        { label: "Chronological Consistency", score: vmockChronoScore, weight: 20, explanation: "Standard Month YYYY date formatting without unexplained gaps." },
        { label: "Academic Metadata", score: vmockAcadScore, weight: 10, explanation: isExperienced ? "Education section verified (GPA check waived for experienced hire)." : "Presence of Education section with GPA/Percentage." },
      ],
      keyFlags: [
        ...(!hasGPA && !isExperienced ? ["Education section lacks explicit GPA/CGPA or percentage."] : []),
        ...(dateMatches.length < 2 ? ["Inconsistent or non-standard date formatting detected."] : []),
        ...(quantRatio < 0.4 ? ["Low quantification ratio weakens analytical problem solving score."] : []),
      ],
    },
    {
      id: "naukri",
      name: "Naukri Resdex / Indeed Indexer",
      badge: "Job Board Resume Search",
      targetAts: "Naukri Resdex, Indeed Search, Portal Boolean Filters",
      score: naukriScore,
      tier: getTier(naukriScore),
      primaryFocus: "35% Keyword Density + 25% Project Count (3+) + 20% Profile URLs + 20% Degree/GPA",
      whyScoreDrops: "Recruiters search via Boolean filters; candidates without explicit CGPA/percentage, 3+ projects, or GitHub/LinkedIn links drop to page 4+ of portal search results.",
      howToBeat: "Add your CGPA/percentage in Education. Document 3+ distinct projects with listed tech stacks. Include LinkedIn and GitHub URLs in your header.",
      rubricBreakdown: [
        { label: "Search Keyword Density", score: naukriKwScore, weight: 35, explanation: "Presence and healthy natural frequency of core tech stack." },
        { label: !hasProjects && isExperienced ? "Experience Bullet Depth" : "Project Portfolio (3+)", score: naukriProjScore, weight: 25, explanation: !hasProjects && isExperienced ? `Work experience bullet depth (${bullets.length} bullets) recognized in lieu of separate projects.` : `${projectHeadingMatches.length} distinct project(s) documented in Projects section.` },
        { label: "Profile URLs & Contact", score: naukriContactScore, weight: 20, explanation: "LinkedIn and GitHub URLs for technical verification." },
        { label: "Education & GPA Marks", score: naukriEduScore, weight: 20, explanation: isExperienced ? "Degree details verified (GPA check waived for experienced hire)." : "Degree details and explicit CGPA/Percentage." },
      ],
      keyFlags: [
        ...(!isExperienced && projectHeadingMatches.length < 2 ? [`Only ${projectHeadingMatches.length} project(s) detected. Resdex ranks freshers with 3+ projects higher.`] : []),
        ...(!hasGPA && !isExperienced ? ["No explicit CGPA or percentage in Education section."] : []),
        ...(!hasProfileLink ? ["Missing LinkedIn or GitHub profile link."] : []),
        ...(stuffedKeywords.length > 0 ? [`Keyword repetition detected: ${stuffedKeywords.join(", ")}.`] : []),
      ],
    },
    {
      id: "taleo",
      name: "Oracle Taleo / Workday Parser",
      badge: "Machine OCR & Parser Integrity",
      targetAts: "Enterprise Workday, Taleo, SAP SuccessFactors",
      score: taleoScore,
      tier: getTier(taleoScore),
      primaryFocus: "30% Whitelisted Headers + 25% Single-Column Flow + 25% Clean UTF-8 + 20% Dates",
      whyScoreDrops: "Enterprise applicant tracking systems fail on multi-column tables, text boxes, and special Unicode typography (curly quotes, em-dashes), resulting in unreadable text streams.",
      howToBeat: "Use a clean single-column layout without tables or text boxes. Replace curly quotes and em-dashes with standard hyphens and ASCII quotes. Stick to conventional headings.",
      rubricBreakdown: [
        { label: "Whitelisted Section Headers", score: taleoHeadScore, weight: 30, explanation: `${coreRequired.length - missing.length}/${coreRequired.length} standard sections identified.` },
        { label: "Single-Column Layout", score: taleoColScore, weight: 25, explanation: tableArtifacts.length === 0 ? "Clean linear flow without table cells." : "Table column separators detected." },
        { label: "UTF-8 & Typography Safety", score: taleoUtfScore, weight: 25, explanation: hasSmartTypography ? "Smart quotes / em-dashes detected." : "Clean ASCII/UTF-8 typography." },
        { label: "Date Serialization", score: taleoDateScore, weight: 20, explanation: `${dateMatches.length} standard dates recognized by parser.` },
      ],
      keyFlags: [
        ...(hasSmartTypography ? ["Contains curly quotes or em-dashes that break older ATS parsers."] : []),
        ...(tableArtifacts.length > 0 ? ["Table separators detected; may cause text collision in Workday/Taleo."] : []),
        ...(missing.length > 0 ? [`Missing standard header(s): ${missing.join(", ")}.`] : []),
      ],
    },
  ];

  return {
    score: Math.min(100, Math.max(0, compositeScore)),
    standaloneScore,
    categories,
    contacts,
    sections,
    lines,
    wordCount: words,
    findings,
    deductions,
    quantifiedBulletRatio: Math.round(quantRatio * 100),
    matchScore,
    matches,
    commercialScores,
    estimatedYearsOfExperience,
    isExperienced,
    estimatedPages,
    repeatedActionVerbs,
  };
}
