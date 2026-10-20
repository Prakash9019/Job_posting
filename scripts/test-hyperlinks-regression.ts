import assert from "node:assert";
import fs from "fs";
import {
  extractHyperlinksFromLatex,
  extractHyperlinksFromMarkdownText,
  extractHyperlinksFromPdf,
  restoreMissingHyperlinksInLatex,
  validatePdfHyperlinks,
  formatLatexWithHyperlinks,
} from "../lib/ats/hyperlinks";
import { generateATSLatex, compileLatexToPdfBuffer, autoTailorResumeToJD } from "../lib/ats/tailor";
import { extractResumeText } from "../lib/ai/resume";

async function runHyperlinksRegressionSuite() {
  console.log("==================================================================");
  console.log("🔗 HYPERLINKS PRESERVATION & PDF CLICKABILITY REGRESSION TEST");
  console.log("==================================================================\n");

  // -------------------------------------------------------------
  // Test 1: Extract and Preserve Original Hyperlinks from LaTeX
  // -------------------------------------------------------------
  console.log("--- Test 1: Preserve Original Hyperlinks from LaTeX Template ---");

  const originalTemplateLatex = `\\documentclass[a4paper,9pt]{extarticle}
\\usepackage[a4paper,margin=0.5in]{geometry}
\\usepackage[hidelinks]{hyperref}
\\begin{document}
\\begin{center}
  {\\LARGE \\textbf{Alex Rivera}} \\\\[2pt]
  \\small \\href{mailto:alex.rivera@example.com}{\\underline{alex.rivera@example.com}} \\enspace\\textbar\\enspace
  \\href{https://linkedin.com/in/alex-rivera}{\\underline{LinkedIn}} \\enspace\\textbar\\enspace
  \\href{https://github.com/alexrivera}{\\underline{GitHub}} \\enspace\\textbar\\enspace
  \\href{https://alexrivera.dev}{\\underline{Portfolio}}
\\end{center}
\\section{PROJECTS}
\\resumeProjectHeading
  {\\textbf{Distributed Cache Hub} \\enspace\\textbar\\enspace \\href{https://github.com/alexrivera/cache-hub}{\\underline{Code}} \\enspace\\textbar\\enspace \\href{https://cachehub.example.com}{\\underline{Live Demo}}}{2026}
\\begin{itemize}
  \\item Engineered distributed memory layer reducing latency by 45\\%. See \\href{https://benchmark.example.com}{Benchmark Docs}.
\\end{itemize}
\\end{document}`;

  const extractedOriginalLinks = extractHyperlinksFromLatex(originalTemplateLatex);
  console.log(`Extracted ${extractedOriginalLinks.length} hyperlinks from original template:`);
  extractedOriginalLinks.forEach((l) => console.log(`  • [${l.category}] ${l.text} -> ${l.url}`));

  assert.strictEqual(extractedOriginalLinks.length, 7, "Must extract exactly 7 hyperlinks");
  assert(extractedOriginalLinks.some((l) => l.url === "mailto:alex.rivera@example.com"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://linkedin.com/in/alex-rivera"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://github.com/alexrivera"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://alexrivera.dev"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://github.com/alexrivera/cache-hub"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://cachehub.example.com"));
  assert(extractedOriginalLinks.some((l) => l.url === "https://benchmark.example.com"));
  console.log("✅ [PASS] All 7 original template hyperlinks extracted cleanly with categories!");

  // -------------------------------------------------------------
  // Test 2: Generate Optimized ATS LaTeX Preserving All Hyperlinks
  // -------------------------------------------------------------
  console.log("\n--- Test 2: Generate ATS LaTeX Preserving Hyperlinks ---");

  const plainResumeInput = `Alex Rivera
alex.rivera@example.com | LinkedIn | GitHub | Portfolio
Professional Summary
Experienced backend engineer building scalable distributed architectures.
Projects
Distributed Cache Hub Code Live Demo
Go, Redis, gRPC
• Engineered distributed memory layer reducing latency by 45%. See Benchmark Docs.
`;

  const generatedAtsLatex = generateATSLatex(plainResumeInput, {
    originalLatex: originalTemplateLatex,
  });

  // Verify that links are present in generated LaTeX
  for (const expLink of extractedOriginalLinks) {
    assert(
      generatedAtsLatex.includes(expLink.url),
      `Generated LaTeX is missing link: ${expLink.url}`
    );
  }
  assert(generatedAtsLatex.includes("\\usepackage[hidelinks]{hyperref}"));
  console.log("✅ [PASS] All 7 original hyperlinks preserved in generated ATS LaTeX!");

  // -------------------------------------------------------------
  // Test 3: Compile via TeXLive & Validate Clickable PDF Annotations
  // -------------------------------------------------------------
  console.log("\n--- Test 3: Compile via TeXLive & Validate Clickable PDF Annotations ---");
  const compiledPdf = await compileLatexToPdfBuffer(generatedAtsLatex);
  assert(compiledPdf !== null && compiledPdf.length > 5000, "LaTeX must compile to valid PDF");
  console.log(`Compiled PDF generated: ${compiledPdf.length} bytes`);

  const pdfLinkValidation = await validatePdfHyperlinks(
    compiledPdf,
    extractedOriginalLinks.map((l) => l.url)
  );

  console.log("PDF Clickable Link Validation Report:", pdfLinkValidation.report);
  assert(
    pdfLinkValidation.valid,
    `PDF missing clickable link annotations: ${pdfLinkValidation.missingUrls.join(", ")}`
  );
  console.log(`✅ [PASS] All expected hyperlinks confirmed clickable in binary PDF annotations!`);

  // -------------------------------------------------------------
  // Test 4: PDF Upload & Text Extraction Link Preservation
  // -------------------------------------------------------------
  console.log("\n--- Test 4: PDF Upload & Link Extraction Pipeline ---");
  const lakshmiPdfBytes = fs.readFileSync("Resume_Sayyapureddy_Lakshmi.pdf");
  const lakshmiExtractedText = await extractResumeText(lakshmiPdfBytes, "application/pdf");
  const lakshmiMdLinks = extractHyperlinksFromMarkdownText(lakshmiExtractedText);
  console.log(`Extracted ${lakshmiMdLinks.length} links from Lakshmi PDF:`, lakshmiMdLinks);

  assert(lakshmiMdLinks.some((l) => l.url.includes("lakshmi.charvy1819@gmail.com")));
  const lakshmiLatex = generateATSLatex(lakshmiExtractedText);
  assert(
    lakshmiLatex.includes("\\href{mailto:lakshmi.charvy1819@gmail.com}"),
    "Must preserve email href in generated LaTeX"
  );
  console.log("✅ [PASS] Uploaded PDF links extracted and converted to LaTeX \\href!");

  // -------------------------------------------------------------
  // Test 5: In-Place Restoration for AI Rewritten or Shortened Content
  // -------------------------------------------------------------
  console.log("\n--- Test 5: In-Place Restoration for AI Rewritten LaTeX ---");
  const strippedAiOutput = `\\documentclass{article}
\\begin{document}
\\begin{center}
  {\\textbf{Alex Rivera}}\\\\
  alex.rivera@example.com | LinkedIn | GitHub | Portfolio
\\end{center}
\\section{PROJECTS}
\\textbf{Distributed Cache Hub} | Code | Live Demo
\\end{document}`;

  const restoredLatex = restoreMissingHyperlinksInLatex(strippedAiOutput, originalTemplateLatex);
  assert(restoredLatex.includes("\\href{mailto:alex.rivera@example.com}"));
  assert(restoredLatex.includes("\\href{https://linkedin.com/in/alex-rivera}"));
  assert(restoredLatex.includes("\\href{https://github.com/alexrivera}"));
  assert(restoredLatex.includes("\\href{https://alexrivera.dev}"));
  assert(restoredLatex.includes("\\href{https://github.com/alexrivera/cache-hub}"));
  assert(restoredLatex.includes("\\href{https://cachehub.example.com}"));
  assert(restoredLatex.includes("\\usepackage[hidelinks]{hyperref}"));
  console.log("✅ [PASS] 100% of missing hyperlinks restored into AI-stripped LaTeX without duplicate declarations!");

  console.log("\n==================================================================");
  console.log("🎉 ALL HYPERLINKS REGRESSION TESTS PASSED!");
  console.log("==================================================================\n");
}

runHyperlinksRegressionSuite().catch((err) => {
  console.error("Hyperlinks regression suite failed:", err);
  process.exit(1);
});
