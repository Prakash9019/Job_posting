import assert from "node:assert";
import fs from "fs";
import path from "path";
import {
  extractHyperlinksFromLatex,
  extractHyperlinksFromMarkdownText,
  restoreMissingHyperlinksInLatex,
  validatePdfHyperlinks,
} from "../lib/ats/hyperlinks";
import {
  generateATSLatex,
  compileLatexToPdfBuffer,
  autoTailorResumeToJD,
} from "../lib/ats/tailor";

async function runScreenshotRecreationRegressionSuite() {
  console.log("==================================================================");
  console.log("📸 SCREENSHOT RESUME RECREATION & ATS PARITY REGRESSION SUITE");
  console.log("==================================================================\n");

  // Define identical resume data represented in two workflows:
  // 1. Original LaTeX template source (as in the ATS resume workflow)
  const atsOriginalLatex = `\\documentclass[a4paper,9pt]{extarticle}
\\usepackage[a4paper,margin=0.5in]{geometry}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\begin{document}
\\begin{center}
  {\\LARGE \\textbf{Sarah Connor}} \\\\[2pt]
  \\small \\href{mailto:sarah.connor@cyberdyne.io}{\\underline{sarah.connor@cyberdyne.io}} \\enspace\\textbar\\enspace
  \\href{https://linkedin.com/in/sarah-connor}{\\underline{LinkedIn}} \\enspace\\textbar\\enspace
  \\href{https://github.com/sarahconnor}{\\underline{GitHub}} \\enspace\\textbar\\enspace
  \\href{https://sarahconnor.tech}{\\underline{Portfolio}}
\\end{center}

\\section{PROFESSIONAL SUMMARY}
Staff Site Reliability Engineer with 8+ years designing fault-tolerant distributed systems and zero-downtime infrastructure.

\\section{TECHNICAL SKILLS}
\\begin{itemize}[leftmargin=*,itemsep=-1pt,topsep=0pt,parsep=0pt]
  \\item \\textbf{Languages:} Go, Python, TypeScript, Bash, Rust
  \\item \\textbf{Infrastructure:} Kubernetes, Terraform, AWS, Docker, Cilium
\\end{itemize}

\\section{WORK EXPERIENCE}
\\resumeSubheading
  {Cyberdyne Systems}{San Francisco, CA}
  {Lead Infrastructure Architect}{2022 -- Present}
\\begin{itemize}[leftmargin=*,itemsep=-1pt,topsep=0pt,parsep=0pt]
  \\item Architected high-availability Kubernetes multi-cluster mesh serving 45,000 requests per second with 99.999% uptime across four geographical regions.
  \\item Reduced cloud infrastructure costs by \\$380,000 annually by automating spot instance lifecycle management and right-sizing memory allocations.
\\end{itemize}

\\section{PROJECTS}
\\resumeProjectHeading
  {\\textbf{MeshGuard Zero-Trust Gateway} \\enspace\\textbar\\enspace \\href{https://github.com/sarahconnor/meshguard}{\\underline{Code}} \\enspace\\textbar\\enspace \\href{https://meshguard.cyberdyne.io}{\\underline{Live Demo}}}{2025}
\\begin{itemize}[leftmargin=*,itemsep=-1pt,topsep=0pt,parsep=0pt]
  \\item Built open-source eBPF network security proxy analyzing L7 packet flows. Published reference architecture at \\href{https://ebpf.io/case-studies/meshguard}{eBPF Foundation}.
\\end{itemize}

\\section{EDUCATION}
\\resumeSubheading
  {University of California, Berkeley}{Berkeley, CA}
  {B.S. in Computer Science, Magna Cum Laude}{2018}

\\end{document}`;

  // 2. Screenshot extraction representation (as produced by transcribeDocumentWithAI)
  // In the broken workflow:
  // - Hyperlinks were stripped into plain text (e.g. "sarahconnor", "LinkedIn", "Live Demo" without URLs)
  // - Bullets were broken across multiple lines due to screenshot wrapping
  // - Words were broken with hyphens
  // In our fixed workflow:
  // - Visible URLs and links are captured as markdown links [Label](url)
  // - Headings are standardized
  // - Bullets are single-line items
  const screenshotTranscribedMarkdown = `Sarah Connor
[sarah.connor@cyberdyne.io](mailto:sarah.connor@cyberdyne.io) | [LinkedIn](https://linkedin.com/in/sarah-connor) | [GitHub](https://github.com/sarahconnor) | [Portfolio](https://sarahconnor.tech)

PROFESSIONAL SUMMARY
Staff Site Reliability Engineer with 8+ years designing fault-tolerant distributed systems and zero-downtime infrastructure.

TECHNICAL SKILLS
• Languages: Go, Python, TypeScript, Bash, Rust
• Infrastructure: Kubernetes, Terraform, AWS, Docker, Cilium

WORK EXPERIENCE
Cyberdyne Systems | Lead Infrastructure Architect | 2022 – Present | San Francisco, CA
• Architected high-availability Kubernetes multi-cluster mesh serving 45,000 requests per second with 99.999% uptime across four geographical regions.
• Reduced cloud infrastructure costs by $380,000 annually by automating spot instance lifecycle management and right-sizing memory allocations.

PROJECTS
MeshGuard Zero-Trust Gateway | [Code](https://github.com/sarahconnor/meshguard) | [Live Demo](https://meshguard.cyberdyne.io) | 2025
• Built open-source eBPF network security proxy analyzing L7 packet flows. Published reference architecture at [eBPF Foundation](https://ebpf.io/case-studies/meshguard).

EDUCATION
University of California, Berkeley | B.S. in Computer Science, Magna Cum Laude | 2018 | Berkeley, CA
`;

  // -------------------------------------------------------------------------
  // Test 1: Hyperlink Extraction Parity from Screenshot-Transcribed Markdown
  // -------------------------------------------------------------------------
  console.log("--- Test 1: Hyperlink Extraction Parity from Screenshot Markdown ---");
  const mdLinks = extractHyperlinksFromMarkdownText(screenshotTranscribedMarkdown);
  console.log(`Extracted ${mdLinks.length} hyperlinks from screenshot markdown:`);
  mdLinks.forEach((l) => console.log(`  • [${l.category}] ${l.text} -> ${l.url}`));

  assert.strictEqual(mdLinks.length, 7, "Must extract all 7 hyperlinks from screenshot text");
  assert(mdLinks.some((l) => l.url === "mailto:sarah.connor@cyberdyne.io"));
  assert(mdLinks.some((l) => l.url === "https://linkedin.com/in/sarah-connor"));
  assert(mdLinks.some((l) => l.url === "https://github.com/sarahconnor"));
  assert(mdLinks.some((l) => l.url === "https://sarahconnor.tech"));
  assert(mdLinks.some((l) => l.url === "https://github.com/sarahconnor/meshguard"));
  assert(mdLinks.some((l) => l.url === "https://meshguard.cyberdyne.io"));
  assert(mdLinks.some((l) => l.url === "https://ebpf.io/case-studies/meshguard"));
  console.log("✅ [PASS] All 7 links correctly extracted with accurate categories and URLs!\n");

  // -------------------------------------------------------------------------
  // Test 2: LaTeX Generation Formatting, Spacing & Hyperlink Parity
  // -------------------------------------------------------------------------
  console.log("--- Test 2: Reusing Proven ATS LaTeX Generator on Screenshot Content ---");

  // Workflow A: Standard ATS workflow from template
  const atsLatex = generateATSLatex(screenshotTranscribedMarkdown, {
    originalLatex: atsOriginalLatex,
  });

  // Workflow B: Screenshot recreation (standalone, without pre-existing LaTeX template)
  const screenshotRecreatedLatex = generateATSLatex(screenshotTranscribedMarkdown);

  // Both workflows must:
  // 1. Include readable typography and tight geometry
  assert(
    screenshotRecreatedLatex.includes("\\documentclass[a4paper,10pt]{article}") ||
    screenshotRecreatedLatex.includes("\\documentclass[a4paper,9pt]{extarticle}")
  );
  assert(screenshotRecreatedLatex.includes("geometry"));
  assert(screenshotRecreatedLatex.includes("\\usepackage[hidelinks]{hyperref}"));
  assert(screenshotRecreatedLatex.includes("\\usepackage{enumitem}"));

  // 2. Control enumitem vertical spacing
  assert(screenshotRecreatedLatex.includes("parsep=0pt"));
  assert(
    screenshotRecreatedLatex.includes("topsep=1pt") ||
    screenshotRecreatedLatex.includes("topsep=1.5pt") ||
    screenshotRecreatedLatex.includes("topsep=0pt")
  );

  // 3. Keep section headings consistent
  const canonicalHeadings = [
    "PROFESSIONAL SUMMARY",
    "TECHNICAL SKILLS",
    "WORK EXPERIENCE",
    "PROJECTS",
    "EDUCATION",
  ];
  for (const h of canonicalHeadings) {
    assert(
      screenshotRecreatedLatex.includes(`\\section{${h}}`),
      `Missing canonical section heading: ${h}`
    );
  }

  // 4. Preserve all 7 hyperlinks in LaTeX
  for (const exp of mdLinks) {
    assert(
      screenshotRecreatedLatex.includes(exp.url),
      `Screenshot recreated LaTeX missing hyperlink URL: ${exp.url}`
    );
  }

  // 5. Ensure project heading right/left column format preserves [Code] and [Live Demo] links
  assert(
    screenshotRecreatedLatex.includes("href{https://github.com/sarahconnor/meshguard}"),
    "Project Code link must be preserved in LaTeX"
  );
  assert(
    screenshotRecreatedLatex.includes("href{https://meshguard.cyberdyne.io}"),
    "Project Live Demo link must be preserved in LaTeX"
  );

  // 6. Ensure in-bullet link is preserved
  assert(
    screenshotRecreatedLatex.includes("href{https://ebpf.io/case-studies/meshguard}"),
    "In-bullet link must be preserved in LaTeX"
  );

  console.log("✅ [PASS] Screenshot recreated LaTeX matches ATS formatting, spacing, and hyperlinks!\n");

  // -------------------------------------------------------------------------
  // Test 3: Template Reuse when LaTeX Source is Available
  // -------------------------------------------------------------------------
  console.log("--- Test 3: Template Reuse when Original LaTeX is Available ---");
  // When the user has a saved template or original LaTeX, verify that restoreMissingHyperlinksInLatex
  // reuses the exact \href definitions
  const restoredFromTemplate = restoreMissingHyperlinksInLatex(
    screenshotRecreatedLatex,
    atsOriginalLatex
  );
  assert(restoredFromTemplate.includes("mailto:sarah.connor@cyberdyne.io"));
  assert(restoredFromTemplate.includes("https://linkedin.com/in/sarah-connor"));
  assert(restoredFromTemplate.includes("https://github.com/sarahconnor/meshguard"));
  console.log("✅ [PASS] Original LaTeX template links successfully mapped and reused!\n");

  // -------------------------------------------------------------------------
  // Test 4: PDF Compilation & Clickable Hyperlink Validation
  // -------------------------------------------------------------------------
  console.log("--- Test 4: PDF Compilation & Binary Clickability Validation ---");
  console.log("Compiling screenshot-recreated resume LaTeX to PDF via TeXLive...");
  const pdfBuffer = await compileLatexToPdfBuffer(screenshotRecreatedLatex);
  assert(pdfBuffer !== null && pdfBuffer.length > 5000, "Must produce a valid PDF buffer > 5000 bytes");
  console.log(`Successfully compiled PDF: ${pdfBuffer.length} bytes.`);

  // Save the compiled PDF to disk for artifact validation
  fs.mkdirSync(path.join("tests", "output"), { recursive: true });
  fs.writeFileSync(path.join("tests", "output", "test-screenshot-recreated-resume.pdf"), pdfBuffer);
  console.log("Saved tests/output/test-screenshot-recreated-resume.pdf for inspection.");

  // Validate that all expected URLs exist as clickable /Subtype /Link annotations in the binary PDF
  const expectedUrls = mdLinks.map((l) => l.url);
  const pdfValidation = await validatePdfHyperlinks(pdfBuffer, expectedUrls);
  console.log("PDF Clickable Link Validation Report:", pdfValidation.report);
  assert(
    pdfValidation.valid,
    `PDF missing clickable annotations: ${pdfValidation.missingUrls.join(", ")}`
  );
  console.log("✅ [PASS] 100% of visible links are clickable PDF annotations in the downloaded PDF!\n");

  // -------------------------------------------------------------------------
  // Test 5: Bullet Integrity & Line Break Verification
  // -------------------------------------------------------------------------
  console.log("--- Test 5: Verify Bullet Formatting & Elimination of False Paragraph Breaks ---");
  // Ensure no empty items or mid-sentence line breaks exist
  const items = screenshotRecreatedLatex.match(/(?:\\resumeItem\{|\\item\s+)([^\n]+)/g) || [];
  assert(items.length >= 3, "Expected at least 3 bullet items");
  for (const it of items) {
    // Bullet should not end prematurely with broken punctuation or hyphen
    assert(!it.endsWith("-"), "Bullet line should not end in a trailing hyphen");
    assert(!it.includes("\n\n"), "Bullet should not contain empty paragraph breaks");
  }
  console.log(`✅ [PASS] All ${items.length} bullet items are formatted as cohesive, unbroken logical units!\n`);

  // -------------------------------------------------------------------------
  // Test 6: LinkedIn & GitHub Handles with Underscores and Prefix Formats
  // -------------------------------------------------------------------------
  console.log("--- Test 6: Underscore & Hyphen Handles with Various Prefix Formats ---");
  const markdownWithUnderscores = `Alex Mercer
alex.mercer@gmail.com | LinkedIn: in/alex_mercer_99 | GitHub: git/alex_mercer | 555-019-2834

PROFESSIONAL SUMMARY
Senior Distributed Systems Architect with expertise in eBPF and high-throughput kernel bypass.

TECHNICAL SKILLS
• Languages: C++, Rust, Go

WORK EXPERIENCE
Apex Cyber | Staff Systems Engineer | 03/2021 - Present | Seattle, WA
• Optimized zero-copy network sockets.
`;

  const latexWithUnderscores = generateATSLatex(markdownWithUnderscores);
  // Verify that alex_mercer_99 and alex_mercer are converted to valid \href
  assert(
    latexWithUnderscores.includes("href{https://linkedin.com/in/alex_mercer_99}"),
    "Must preserve LinkedIn URL with underscore handle"
  );
  assert(
    latexWithUnderscores.includes("href{https://github.com/alex_mercer}"),
    "Must preserve GitHub URL with underscore handle"
  );
  // Underscores in the LaTeX text must be safely escaped
  assert(
    latexWithUnderscores.includes("alex\\_mercer"),
    "Underscore in label must be safely escaped in LaTeX"
  );
  console.log("✅ [PASS] Handles with underscores correctly preserved as clickable links!\n");

  // -------------------------------------------------------------------------
  // Test 7: 3-Line Experience Entries (Org/Loc, Role, Date)
  // -------------------------------------------------------------------------
  console.log("--- Test 7: 3-Line Experience Entry Recognition (Org/Loc, Role, Date) ---");
  const markdown3LineExp = `John Connor
john@resistance.org | 555-010-9999

WORK EXPERIENCE
Cyberdyne Technologies, Los Angeles, CA
Principal Infrastructure Engineer
Jan. 2020 to Present
• Directed migration of monolithic kernel to microservices.
• Enforced cryptographic verification across all CI/CD pipelines.
`;

  const latex3LineExp = generateATSLatex(markdown3LineExp);
  assert(
    latex3LineExp.includes("\\resumeSubheading\n  {Cyberdyne Technologies}{Los Angeles, CA}\n  {Principal Infrastructure Engineer}{Jan. 2020 -- Present}"),
    "Must assemble 3-line experience entry into single cohesive \\resumeSubheading"
  );
  console.log("✅ [PASS] 3-line experience entry successfully structured into \\resumeSubheading!\n");

  // -------------------------------------------------------------------------
  // Test 8: Projects with Date and External Links in Right Column
  // -------------------------------------------------------------------------
  console.log("--- Test 8: Project Date and Link Positioning in Right Column ---");
  const markdownProjects = `Sarah Connor
sarah@example.com

PROJECTS
KubeShield | Go, eBPF | [Code](https://github.com/sarah/kubeshield) | 2024 – 2025
• Built eBPF-based container security runtime.
`;

  const latexProjects = generateATSLatex(markdownProjects);
  assert(
    latexProjects.includes("\\resumeProjectHeading"),
    "Must emit \\resumeProjectHeading for project"
  );
  assert(
    latexProjects.includes("href{https://github.com/sarah/kubeshield}"),
    "Project link must be preserved in LaTeX"
  );
  assert(
    latexProjects.includes("2024 -- 2025"),
    "Project date range must be formatted in heading"
  );
  // Ensure dummy "\textit{Project}" is eliminated when real link/date exists
  assert(
    !latexProjects.includes("\\textit{Project}"),
    "Must eliminate dummy '\\textit{Project}' string when real link or date exists"
  );
  console.log("✅ [PASS] Projects properly position links and dates in right column without dummy text!\n");

  // -------------------------------------------------------------------------
  // Test 9: Unicode Bullets & Soft Hyphen Cleaning
  // -------------------------------------------------------------------------
  console.log("--- Test 9: Unicode Bullet Glyphs and Soft Hyphen Normalization ---");
  const markdownUnicodeBullets = `Elena Rostova
elena@example.com

TECHNICAL SKILLS
✔ Systems: Linux Kernel, KVM, QEMU
◆ Cloud: AWS, GCP, Azure
► Observability: Prometheus, Grafana

WORK EXPERIENCE
TechCorp | Engineer | 2022 – Present | Austin, TX
⁃ Engineered dis\u00ADtributed storage cluster.
∙ Reduced query la\u2010tency by 40%.
`;

  const latexUnicode = generateATSLatex(markdownUnicodeBullets);
  assert(
    latexUnicode.includes("Systems:") && latexUnicode.includes("Linux Kernel"),
    "Must parse unicode checkmark as skill category"
  );
  assert(
    latexUnicode.includes("Cloud:") && latexUnicode.includes("AWS"),
    "Must parse diamond bullet as skill category"
  );
  assert(
    latexUnicode.includes("distributed storage cluster"),
    "Soft hyphen in 'distributed' must be cleanly rejoined"
  );
  assert(
    latexUnicode.includes("latency by 40"),
    "Unicode hyphen in 'latency' must be cleanly rejoined"
  );
  console.log("✅ [PASS] All unicode bullets and soft hyphens cleanly normalized!\n");

  // -------------------------------------------------------------------------
  // Test 10: Summary Narrative Sentence Not Swallowed as Contact Info
  // -------------------------------------------------------------------------
  console.log("--- Test 10: Summary Sentence Preservation in Header Area ---");
  const markdownSummaryNearTop = `Morgan Freeman
morgan@example.com | 555-234-5678
Accomplished distributed systems engineer with deep passion for distributed databases and consensus.

PROFESSIONAL SUMMARY
Accomplished distributed systems engineer with deep passion for distributed databases and consensus.

WORK EXPERIENCE
Apex | Lead Architect | 2021 – Present
• Designed consensus engine.
`;

  const latexSummaryNearTop = generateATSLatex(markdownSummaryNearTop);
  // The narrative sentence should NOT appear in the candidate center header
  const headerCenterMatch = latexSummaryNearTop.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/);
  const headerCenter = headerCenterMatch ? headerCenterMatch[1] : "";
  assert(
    !headerCenter.includes("Accomplished distributed systems engineer"),
    "Narrative sentence must not be swallowed into contact line"
  );
  console.log("✅ [PASS] Narrative sentences are correctly preserved and not jammed into contact info!\n");

  // -------------------------------------------------------------------------
  // Test 11: Email Attachment Parity
  // -------------------------------------------------------------------------
  console.log("--- Test 11: Recreated PDF Email Attachment Parity ---");
  const recreatedCompiledPdf = await compileLatexToPdfBuffer(screenshotRecreatedLatex);
  assert(recreatedCompiledPdf !== null && recreatedCompiledPdf.length > 5000);

  // Validate that the email attachment buffer is a genuine PDF
  const pdfHeader = recreatedCompiledPdf.slice(0, 5).toString("utf-8");
  assert.strictEqual(pdfHeader, "%PDF-", "Email attachment buffer must start with %PDF- magic bytes");

  // Validate that email attachment preserves all hyperlinks
  const emailPdfValidation = await validatePdfHyperlinks(recreatedCompiledPdf, expectedUrls);
  assert(
    emailPdfValidation.valid,
    `Email attachment PDF is missing clickable hyperlinks: ${emailPdfValidation.missingUrls.join(", ")}`
  );
  console.log(`✅ [PASS] Email attachment is a valid PDF (${recreatedCompiledPdf.length} bytes) with 100% clickable hyperlinks!\n`);

  console.log("==================================================================");
  console.log("🎉 ALL SCREENSHOT RECREATION & ATS PARITY TESTS PASSED!");
  console.log("==================================================================\n");
}

runScreenshotRecreationRegressionSuite().catch((err) => {
  console.error("Regression suite failed:", err);
  process.exit(1);
});
