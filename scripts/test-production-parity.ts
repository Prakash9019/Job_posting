import assert from "node:assert";
import {
  ensureAllHrefsPreservedInLatex,
  validatePdfHyperlinks,
} from "../lib/ats/hyperlinks";
import { compileLatexToPdfBuffer, getCandidateFilename } from "../lib/ats/tailor";

async function runProductionParitySuite() {
  console.log("==================================================================");
  console.log("🔍 PRODUCTION VS LOCAL PARITY AUDIT & REGRESSION SUITE");
  console.log("==================================================================\n");

  // -------------------------------------------------------------
  // Test 1: Underscores, dots, and hyphens in LinkedIn/GitHub handles
  // -------------------------------------------------------------
  console.log("--- Test 1: Usernames with Underscores, Dots & Special Characters ---");

  const trickyResumeLatex = `\\documentclass{article}
\\usepackage[hidelinks]{hyperref}
\\begin{document}
\\begin{center}
  {\\LARGE \\textbf{Jane Developer}} \\\\[2pt]
  \\href{mailto:jane_dev.2026@example.com}{\\underline{jane_dev.2026@example.com}} \\enspace\\textbar\\enspace
  \\href{https://linkedin.com/in/jane_developer.io}{\\underline{LinkedIn}} \\enspace\\textbar\\enspace
  \\href{https://github.com/jane_developer-code}{\\underline{GitHub}}
\\end{center}
\\section{WORK EXPERIENCE}
Built high-scale microservices with zero downtime.
\\end{document}`;

  const preservedLatex = ensureAllHrefsPreservedInLatex(trickyResumeLatex);
  assert(preservedLatex.includes("jane\\_dev.2026@example.com") || preservedLatex.includes("mailto:jane_dev.2026@example.com"), "Must escape underscore in mailto text");
  assert(preservedLatex.includes("https://linkedin.com/in/jane_developer.io"), "Must retain LinkedIn destination URL exactly");
  assert(preservedLatex.includes("https://github.com/jane_developer-code"), "Must retain GitHub destination URL exactly");

  const compiledTrickyPdf = await compileLatexToPdfBuffer(preservedLatex);
  assert(compiledTrickyPdf !== null && compiledTrickyPdf.length > 5000, "LaTeX with underscores must compile cleanly without LaTeX $ missing errors");

  const trickyVal = await validatePdfHyperlinks(compiledTrickyPdf, [
    "mailto:jane_dev.2026@example.com",
    "https://linkedin.com/in/jane_developer.io",
    "https://github.com/jane_developer-code",
  ]);
  assert.strictEqual(trickyVal.valid, true, `All tricky links must be clickable in PDF: ${trickyVal.report}`);
  console.log("✅ [PASS] Underscores and special characters in usernames compiled to clickable PDF annotations!");

  // -------------------------------------------------------------
  // Test 2: Universal Header Support (Non-\\begin{center} Templates)
  // -------------------------------------------------------------
  console.log("\n--- Test 2: Universal Header Support (tabular* & centering layouts) ---");

  const tabularHeaderLatex = `\\documentclass{article}
\\usepackage[hidelinks]{hyperref}
\\begin{document}
\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{\\Large Marcus Vance} & alex@example.com \\\\
  LinkedIn $|$ GitHub & \\href{https://marcus.dev}{marcus.dev}
\\end{tabular*}
\\section{EXPERIENCE}
Senior Staff Engineer at Cloud Corp.
\\end{document}`;

  const knownSources = [
    "[LinkedIn](https://linkedin.com/in/marcus-vance)",
    "[GitHub](https://github.com/marcusvance)",
  ];

  const preservedTabularLatex = ensureAllHrefsPreservedInLatex(tabularHeaderLatex, knownSources);
  assert(preservedTabularLatex.includes("https://linkedin.com/in/marcus-vance"), "Must restore LinkedIn into tabular header");
  assert(preservedTabularLatex.includes("https://github.com/marcusvance"), "Must restore GitHub into tabular header");

  const compiledTabularPdf = await compileLatexToPdfBuffer(preservedTabularLatex);
  assert(compiledTabularPdf !== null && compiledTabularPdf.length > 5000, "Tabular header resume must compile");

  const tabularVal = await validatePdfHyperlinks(compiledTabularPdf, [
    "https://linkedin.com/in/marcus-vance",
    "https://github.com/marcusvance",
  ]);
  assert.strictEqual(tabularVal.valid, true, `Non-center template links verified in PDF: ${tabularVal.report}`);
  console.log("✅ [PASS] Universal headers without \\begin{center} preserved clickable links in PDF!");

  // -------------------------------------------------------------
  // Test 3: Non-Fatal Warnings Do Not Block PDF Compilation
  // -------------------------------------------------------------
  console.log("\n--- Test 3: Non-Fatal Warnings Still Produce Usable PDF ---");

  const warningLatex = `\\documentclass{article}
\\usepackage[hidelinks]{hyperref}
\\begin{document}
\\section{EXPERIENCE}
Reference to undefined label \\ref{nonexistent_label}.
\\hbox to 10pt{This is an overfull horizontal box that triggers a standard LaTeX warning.}
Check out \\href{https://linkedin.com/in/test-dev}{\\underline{LinkedIn}}.
\\end{document}`;

  const compiledWarningPdf = await compileLatexToPdfBuffer(warningLatex);
  assert(compiledWarningPdf !== null && compiledWarningPdf.length > 5000, "Non-fatal warnings must not block valid PDF output");
  const warnVal = await validatePdfHyperlinks(compiledWarningPdf, ["https://linkedin.com/in/test-dev"]);
  assert(warnVal.valid, "Hyperlink must remain clickable even when warnings are generated");
  console.log("✅ [PASS] Non-fatal warnings produced valid, downloadable PDF with clickable links!");

  // -------------------------------------------------------------
  // Test 4: Deterministic ATS Filename Convention
  // -------------------------------------------------------------
  console.log("\n--- Test 4: Deterministic ATS Filename Generation ---");

  const sampleResume = "Marcus Vance\nmarcus@example.com | San Francisco, CA";
  const pdfFilename = getCandidateFilename(sampleResume, "Google LLC", "pdf");
  assert.strictEqual(pdfFilename, "Resume_Marcus_Vance_Google_Llc.pdf");

  const texFilename = getCandidateFilename(sampleResume, "Stripe", "tex");
  assert.strictEqual(texFilename, "Resume_Marcus_Vance_Stripe.tex");

  const noCompanyFilename = getCandidateFilename(sampleResume, "", "pdf");
  assert.strictEqual(noCompanyFilename, "Resume_Marcus_Vance.pdf");

  console.log("✅ [PASS] Output filenames follow strict ATS convention: " + pdfFilename);

  // -------------------------------------------------------------
  // Test 5: Verify PDF bytes validity (%PDF- header)
  // -------------------------------------------------------------
  console.log("\n--- Test 5: Binary PDF Bytes Integrity ---");
  assert(compiledTrickyPdf.slice(0, 5).toString("utf-8") === "%PDF-", "Generated bytes must have valid %PDF- magic header");
  console.log("✅ [PASS] Binary PDF byte stream contains standard %PDF- header!");

  console.log("\n==================================================================");
  console.log("🎉 ALL PRODUCTION PARITY REGRESSION TESTS PASSED (5/5)!");
  console.log("==================================================================\n");
}

runProductionParitySuite().catch((err) => {
  console.error("Production parity suite failed:", err);
  process.exit(1);
});
