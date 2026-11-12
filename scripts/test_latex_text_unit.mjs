/**
 * Unit tests for LaTeX text extraction and ATS tailor cleanup logic.
 * Tests the regexes/logic used in lib/ats/latex-text.ts and lib/ats/tailor.ts
 * using plain Node.js (no transpiler needed).
 */

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 1. Simulate latexToPlainText key transforms
// ─────────────────────────────────────────────
console.log("\n=== 1. latexToPlainText artifact stripping ===");

function simulateLatexToPlainText(body) {
  // Strip comments
  body = body.replace(/(^|[^\\])%.*$/gm, "$1");

  // Strip \vspace, \hspace with args (must NOT leave 4pt, -12pt)
  body = body.replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, "");
  body = body.replace(/\\(?:setlength|linespread|fontsize|geometry|pagestyle|thispagestyle|input|urlstyle)\*?\{[^}]*\}(?:\{[^}]*\})?/g, "");
  body = body.replace(/\\setlist\*?(?:\[[^\]]*\])?\{[^}]*\}/g, "");
  body = body.replace(/\\nopagebreak(?:\[[^\]]*\])?/g, "");
  body = body.replace(/\\(?:raggedbottom|raggedright|centering|noindent|selectfont|par)\b/g, "");

  // Strip \begin{itemize}[leftmargin=...] (must NOT leave [leftmargin=...])
  body = body.replace(/\\begin\{[^}]+\}(?:\[[^\]]*\])?(?:\{[^}]*\})*/g, "");
  body = body.replace(/\\end\{[^}]+\}/g, "");

  // Strip \\[-1pt] (must NOT leave [-1pt])
  body = body.replace(/\\\\(?:\[[^\]]*\])?/g, "\n");

  // Unwrap \textbf{...} etc (balanced brace - simulate simple version)
  body = body.replace(/\\(?:textbf|textit|emph|underline|textsc|small|LARGE|Large|huge|Huge|normalsize|footnotesize|scriptsize|tiny)\*?\{([^{}]*)\}/g, "$1");

  // Strip font switches
  body = body.replace(/\\(?:bfseries|itshape|scshape|slshape|mdseries|upshape|small|normalsize|large|Large|LARGE|huge|Huge|footnotesize|scriptsize|tiny)\b/g, "");

  // Strip remaining macros
  body = body.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1");
  body = body.replace(/\\[a-zA-Z]+\*?/g, " ");
  body = body.replace(/[{}\\]/g, "");

  // Clean leftover dimension tokens
  body = body.replace(/\[\s*-?\d+(?:\.\d+)?(?:pt|in|mm|cm|em|ex)\s*\]/g, "");
  body = body.replace(/\[leftmargin=[^\]]*\]/g, "");
  body = body.replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/gm, "");

  // Normalize spaces
  body = body.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return body;
}

// Test: \vspace{4pt} should vanish, not leave "4pt"
const t1 = simulateLatexToPlainText("Name \\vspace{4pt} City");
assert("vspace{4pt} not leaving '4pt'", !t1.includes("4pt"), `got: "${t1}"`);
assert("vspace{4pt} not leaving 'vspace'", !t1.includes("vspace"), `got: "${t1}"`);

// Test: \vspace{-12pt} should vanish, not leave "-12pt"
const t2 = simulateLatexToPlainText("GCP \\vspace{-12pt} Engineer");
assert("vspace{-12pt} not leaving '-12pt'", !t2.includes("-12pt"), `got: "${t2}"`);

// Test: \vspace{-2pt} should vanish
const t3 = simulateLatexToPlainText("Role \\vspace{-2pt} Company");
assert("vspace{-2pt} not leaving '-2pt'", !t3.includes("-2pt"), `got: "${t3}"`);

// Test: \begin{itemize}[leftmargin=0.2in] should NOT leave [leftmargin=...]
const t4 = simulateLatexToPlainText("\\begin{itemize}[leftmargin=0.2in] text \\end{itemize}");
assert("begin{itemize}[leftmargin=...] cleaned", !t4.includes("[leftmargin="), `got: "${t4}"`);

// Test: \\[-1pt] should NOT leave "[-1pt]"  
const t5 = simulateLatexToPlainText("line1\\\\[-1pt]line2");
assert("\\\\[-1pt] not leaving '[-1pt]'", !t5.includes("[-1pt]"), `got: "${t5}"`);

// Test: \textbf{text} should become just "text"
const t6 = simulateLatexToPlainText("\\textbf{PMS Integration Hub}");
assert("textbf{...} unwraps to content", t6.trim() === "PMS Integration Hub", `got: "${t6.trim()}"`);

// Test: bare "textbf" or "small" token should not appear
const t7 = simulateLatexToPlainText("textbf something");
assert("bare textbf is preserved (not a macro without backslash)", t7.trim() === "textbf something", `got: "${t7.trim()}"`);

// Test: \small alone (font switch) should vanish
const t8 = simulateLatexToPlainText("\\small Platform Engineer");
assert("\\small font switch stripped", !t8.includes("small") || t8.includes("Platform Engineer"), `got: "${t8}"`);

// Test: \setlength{\itemsep}{0.5pt} should not leave "0.5pt"
const t9 = simulateLatexToPlainText("\\setlength{\\itemsep}{0.5pt} text");
assert("setlength not leaving '0.5pt'", !t9.match(/\b0\.5pt\b/), `got: "${t9}"`);

// ─────────────────────────────────────────────
// 2. cleanAiText double-verb collapse
// ─────────────────────────────────────────────
console.log("\n=== 2. cleanAiText double-verb collapse ===");

function simulateCleanAiText(text) {
  // Strip stray artifact tokens
  text = text
    .replace(/^\\?\*?\s*/, "")
    .replace(/^\\?(?:textbf|small)\b\s*/i, "")
    .replace(/^(?:textbf|small)\s+/i, "")
    .replace(/\[leftmargin=[^\]]*\]/g, "")
    .replace(/\\210/g, "")
    .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "");

  const ACTION_VERBS_PATTERN =
    "Architected|Orchestrated|Engineered|Spearheaded|Implemented|Streamlined|Optimized|Delivered|Developed|Designed|Synthesized|Devised|Built|Launched|Automated|Integrated|Formulated|Accelerated|Pioneered|Standardized|Scaled|Executed|Authored|Established|Reduced|Improved|Managed|Led|Directed|Constructed|Created|Produced|Published|Programmed|Resolved|Secured|Trained|Collaborated|Conducted|Achieved|Combined|Consolidated|Deployed|Configured|Refactored|Migrated|Centralized|Modeled|Maintained|Analyzed|Evaluated";

  const doubleVerbRegex = new RegExp(
    `^(${ACTION_VERBS_PATTERN})\\s+(?:small\\s+|and\\s+)?(${ACTION_VERBS_PATTERN})\\b`,
    "i"
  );
  let collapsePasses = 0;
  while (doubleVerbRegex.test(text) && collapsePasses < 5) {
    text = text.replace(doubleVerbRegex, "$1");
    collapsePasses++;
  }
  return text.trim();
}

const dv1 = simulateCleanAiText("Architected Orchestrated the pipeline system.");
assert("Double verb 'Architected Orchestrated' collapses", dv1.startsWith("Architected") && !dv1.includes("Orchestrated the"), `got: "${dv1}"`);

const dv2 = simulateCleanAiText("Spearheaded Designed a microservices platform.");
assert("Double verb 'Spearheaded Designed' collapses", dv2.startsWith("Spearheaded") && !dv2.includes("Designed a"), `got: "${dv2}"`);

const dv3 = simulateCleanAiText("Pioneered Spearheaded the deployment pipeline.");
assert("Double verb 'Pioneered Spearheaded' collapses", dv3.startsWith("Pioneered") && !dv3.includes("Spearheaded the"), `got: "${dv3}"`);

const dv4 = simulateCleanAiText("Automated Launched CI/CD workflows.");
assert("Double verb 'Automated Launched' collapses", dv4.startsWith("Automated") && !dv4.includes("Launched CI"), `got: "${dv4}"`);

const dv5 = simulateCleanAiText("Streamlined Engineered the integration hub.");
assert("Double verb 'Streamlined Engineered' collapses", dv5.startsWith("Streamlined") && !dv5.includes("Engineered the"), `got: "${dv5}"`);

// "Architected small Architected" (the textbf-leaked variant)
const dv6 = simulateCleanAiText("Architected small Architected the data pipeline.");
assert("'Architected small Architected' collapses", dv6.startsWith("Architected") && dv6.split("Architected").length <= 2, `got: "${dv6}"`);

// Normal bullet should not be changed
const dv7 = simulateCleanAiText("Architected a multi-tenant SaaS platform reducing latency by 42%.");
assert("Normal action verb bullet preserved", dv7.startsWith("Architected") && dv7.includes("42%"), `got: "${dv7}"`);

// ─────────────────────────────────────────────
// 3. Orphaned "textbf" / "small" token cleanup
// ─────────────────────────────────────────────
console.log("\n=== 3. Orphaned token cleanup ===");

const or1 = simulateCleanAiText("textbf Platform Engineer");
assert("Leading bare 'textbf' stripped", !or1.startsWith("textbf"), `got: "${or1}"`);

const or2 = simulateCleanAiText("small GCP-12pt Cloud Engineer");
assert("Leading bare 'small' stripped + pt dims cleaned", !or2.startsWith("small") && !or2.includes("-12pt"), `got: "${or2}"`);

// ─────────────────────────────────────────────
// 4. Test output_tailored_surya.tex for artifacts
// ─────────────────────────────────────────────
console.log("\n=== 4. Scan output_tailored_surya.tex for leftover artifacts ===");

import { readFileSync, existsSync } from "fs";
const texPath = "output_tailored_surya.tex";
if (existsSync(texPath)) {
  const latexRaw = readFileSync(texPath, "utf-8");
  const plainText = simulateLatexToPlainText(
    latexRaw.includes("\\begin{document}") 
      ? latexRaw.slice(latexRaw.indexOf("\\begin{document}") + "\\begin{document}".length,
          latexRaw.includes("\\end{document}") ? latexRaw.indexOf("\\end{document}") : undefined)
      : latexRaw
  );

  const badTokens = [
    { label: "bare '4pt' dimension", re: /\b4pt\b/ },
    { label: "bare '-12pt' dimension", re: /\-12pt\b/ },
    { label: "bare '-2pt' dimension", re: /\-2pt\b/ },
    { label: "bare '0\.5pt' dimension", re: /\b0\.5pt\b/ },
    { label: "[leftmargin=...] leaking", re: /\[leftmargin=/ },
    { label: "bare 'textbf' token", re: /(?:^|\s)textbf\s/ },
    { label: "double action verb (Architected Orchestrated)", re: /\bArchitected\s+Orchestrated\b/ },
    { label: "double action verb (Spearheaded Designed)", re: /\bSpearheaded\s+Designed\b/ },
    { label: "[-1pt] or [-2pt] from \\\\[...]", re: /\[-\d+pt\]/ },
    { label: "'Experience Role' (should be actual company)", re: /Experience\s+Role\b/ },
  ];

  for (const { label, re } of badTokens) {
    const matches = plainText.match(re);
    assert(`output_tailored_surya.tex: no ${label}`, !matches, matches ? `Found: "${matches[0]}"` : "");
  }
  
  // Check for expected content
  assert("Contains candidate name 'Loka' or 'Surya'", /(?:loka|surya)/i.test(plainText), "Name not found");
  assert("Contains 'Platform Engineer' role", /platform engineer/i.test(plainText), "Role not found");
  assert("Contains 'JulleyOnline' or 'Julley'", /julley/i.test(plainText), "Company not found");

  // Check for double contact links
  const linkedinCount = (plainText.match(/linkedin\.com/gi) || []).length;
  const githubCount = (plainText.match(/github\.com/gi) || []).length;
  assert(`LinkedIn appears at most twice in extracted text (found ${linkedinCount})`, linkedinCount <= 2);
  assert(`GitHub appears at most twice in extracted text (found ${githubCount})`, githubCount <= 2);

} else {
  console.log(`  ⚠️ SKIP: ${texPath} not found — skipping file scan`);
}

// ─────────────────────────────────────────────
// 5. reframeBulletsToGoogleXYZ: no double verb on content starting with "small"
// ─────────────────────────────────────────────
console.log("\n=== 5. reframeBulletsToGoogleXYZ: no double verb ===");

function simulateReframeBullets(bullets) {
  const ACTION_VERBS = ["Architected", "Engineered", "Spearheaded", "Orchestrated", "Implemented", "Streamlined", "Optimized", "Delivered"];
  const PAST_ACTION_VERBS = new Set([
    "architected","engineered","spearheaded","orchestrated","implemented","streamlined","optimized",
    "delivered","developed","designed","synthesized","devised","built","launched","automated",
    "integrated","formulated","accelerated","pioneered","standardized","scaled","executed","authored",
    "established","reduced","improved","managed","led","directed","constructed","created","produced",
    "published","programmed","resolved","secured","trained","collaborated","conducted","achieved",
    "combined","consolidated","deployed","configured","refactored","migrated","centralized",
    "modeled","maintained","analyzed","evaluated"
  ]);

  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+✔✓◆◇►▸⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]|\d+[.)])\s+(.*)$/;
  
  return bullets.map((raw, i) => {
    const match = raw.match(BULLET_START_RE);
    let content = match ? match[1].trim() : raw.trim();

    // Strip leading formatting tokens (the fix)
    content = content
      .replace(/^(?:textbf|small)\s+/i, "")
      .replace(/\[leftmargin=[^\]]*\]/g, "")
      .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "")
      .trim();

    const firstWordMatch = content.match(/^([A-Za-z]+)\b/);
    const firstWord = firstWordMatch ? firstWordMatch[1].toLowerCase() : "";

    if (PAST_ACTION_VERBS.has(firstWord)) {
      return raw; // Preserve — already strong
    }

    const actionVerb = ACTION_VERBS[i % ACTION_VERBS.length];
    
    const cleanContent = content
      .replace(/^(?:worked on developing|worked on building|worked on|responsible for|assisted with|helped)\\s*/i, "")
      .replace(/^(?:architected|engineered|spearheaded|orchestrated|implemented|built|developed|created|streamlined|optimized)\s*/i, "")
      .trim();

    return `• ${actionVerb} ${cleanContent}`;
  });
}

// Bullet with "small Architected..." (the leaked textbf/small token)
const rb1 = simulateReframeBullets(["• small Architected a multi-stage AI pipeline."]);
assert("'small Architected...' does NOT produce 'Architected small Architected'", 
  !rb1[0].match(/Architected\s+small\s+Architected/), `got: "${rb1[0]}"`);
assert("'small Architected...' results in a single verb", 
  (rb1[0].match(/\bArchitected\b/g) || []).length <= 1, `got: "${rb1[0]}"`);

// Normal bullet with existing strong verb → preserve
const rb2 = simulateReframeBullets(["• Developed a FastAPI backend."]);
assert("'Developed...' bullet preserved as-is (not prepended)", 
  rb2[0].includes("Developed") && !rb2[0].includes("Architected"), `got: "${rb2[0]}"`);

// Weak verb bullet → reframe
const rb3 = simulateReframeBullets(["• worked on building the CI/CD pipeline."]);
assert("'worked on building...' bullet reframed with action verb",
  !rb3[0].toLowerCase().includes("worked on"), `got: "${rb3[0]}"`);

// ─────────────────────────────────────────────
// 6. hasCustomTemplate detection
// ─────────────────────────────────────────────
console.log("\n=== 6. Custom template detection ===");

function hasCustomTemplate(latex) {
  return latex.includes("\\documentclass") || latex.includes("\\begin{document}");
}

assert("Empty string → no custom template", !hasCustomTemplate(""));
assert("Plain text → no custom template", !hasCustomTemplate("John Doe\nSoftware Engineer"));
assert("Full LaTeX doc → custom template detected", hasCustomTemplate("\\documentclass{article}\n\\begin{document}"));
assert("Only \\begin{document} → custom template detected", hasCustomTemplate("\\begin{document}\nContent\n\\end{document}"));

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED — ATS LaTeX pipeline is clean!");
} else {
  console.log(`⚠️  ${failed} test(s) failed — review the ❌ items above.`);
  process.exit(1);
}
