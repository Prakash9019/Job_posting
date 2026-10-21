import assert from "node:assert";
import {
  generateATSLatex,
  cleanLingeringPlaceholders,
  compileLatexToPdfBuffer,
  escapeLatexForPatch,
  parseOrgAndLoc,
} from "../lib/ats/tailor";
import {
  ensureAllHrefsPreservedInLatex,
  validatePdfHyperlinks,
} from "../lib/ats/hyperlinks";
import { PDFParse } from "pdf-parse";

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const res = await parser.getText();
    return res.text || "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function runResumeFormattingRegressionSuite() {
  console.log("==================================================================");
  console.log("📄 MULTI-RESUME FORMATTING & LATEX-TO-PDF REGRESSION SUITE");
  console.log("==================================================================\n");

  // -------------------------------------------------------------
  // Test 1: Markdown to LaTeX Conversion (Zero Markdown Leakage in PDF)
  // -------------------------------------------------------------
  console.log("--- Test 1: Markdown Conversion & Zero Literal Leakage in PDF ---");
  const markdownResume = `
Sophia Williams
sophia_williams.dev@example.com | (555) 987-6543 | https://linkedin.com/in/sophia_williams.eng | https://github.com/sophia-williams/portfolio

PROFESSIONAL SUMMARY
Dynamic **Lead Software Engineer** with 8+ years specializing in *cloud-native distributed architectures*, \`Kubernetes\`, and \`Next.js\`.

WORK EXPERIENCE
Google, LLC | Mountain View, CA | Senior Distributed Systems Engineer | May 2021 - Present
• **Spearheaded** migration of legacy services to \`Go\` & \`gRPC\` [Remote], improving p99 latency by 45%.
• *Architected* multi-region data replication across [N] clusters without downtime.
• Led cross-functional team of 12 engineers in shipping high-throughput caching tier.

Meta Platforms, Inc. | Menlo Park, CA | Software Engineer II | Aug 2018 - Apr 2021
• Engineered GraphQL aggregation layer processing 500M+ requests daily.

PROJECTS
### CloudMesh Service Mesh | Go, eBPF | [Code](https://github.com/sophia-williams/cloudmesh) | [Live Demo](https://cloudmesh.example.com)
• Implemented zero-overhead sidecar proxy with telemetry and mTLS encryption.

TECHNICAL SKILLS
Languages: **Go**, **Python**, **TypeScript**, C++, SQL
Frameworks: React, Next.js, Node.js, FastAPI
Infrastructure: \`Docker\`, \`Kubernetes\`, AWS, Terraform, CI/CD
`;

  const latex1 = generateATSLatex(markdownResume);
  assert(!latex1.includes("**"), "LaTeX must not contain raw markdown ** bold syntax");
  assert(!latex1.includes("`Go`"), "LaTeX must not contain raw markdown backticks");
  assert(latex1.includes("\\textbf{Spearheaded}"), "Must convert **Spearheaded** to \\textbf{Spearheaded}");
  assert(latex1.includes("\\texttt{Go}"), "Must convert `Go` to \\texttt{Go}");
  assert(latex1.includes("[Remote]"), "Must preserve [Remote] tag");

  const pdfBuf1 = await compileLatexToPdfBuffer(latex1);
  assert(pdfBuf1 !== null && pdfBuf1.length > 5000, "Markdown resume must compile to PDF");
  const pdfText1 = await extractTextFromPdf(pdfBuf1);

  assert(!pdfText1.includes("**"), "Extracted PDF text must not contain '**'");
  assert(!pdfText1.includes("###"), "Extracted PDF text must not contain '###'");
  assert(!pdfText1.includes("`"), "Extracted PDF text must not contain '`'");
  assert(!pdfText1.includes("XATSTOKEN"), "Extracted PDF text must not contain leaked token placeholders");
  assert(pdfText1.includes("Spearheaded"), "Extracted PDF text must contain 'Spearheaded'");
  assert(pdfText1.includes("[Remote]"), "Extracted PDF text must preserve '[Remote]'");
  console.log("✅ [PASS] Markdown converted to LaTeX commands without markdown marker leakage in compiled PDF!");

  // -------------------------------------------------------------
  // Test 2: Role, Org & Location Semantic Alignment Across Formats
  // -------------------------------------------------------------
  console.log("\n--- Test 2: Role, Org & Location Semantic Alignment ---");

  // Case A: Pipe with Org, Loc, Role (3 parts + date)
  const caseA = `Google, LLC | Mountain View, CA | Senior Software Engineer | May 2020 - Present`;
  const latexA = generateATSLatex(`John Doe\njohn@example.com\nWORK EXPERIENCE\n${caseA}\n• Built scalable services.`);
  assert(latexA.includes("{Google, LLC}{Mountain View, CA}"), "Pattern A must place Company Top-Left and Location Top-Right");
  assert(latexA.includes("{Senior Software Engineer}{May 2020 -- Present}"), "Pattern A must place Role Bottom-Left and Date Bottom-Right");

  // Case B: Pipe with Role first, then Org, then Location
  const caseB = `Staff Infrastructure Engineer | Stripe, Inc. | San Francisco, CA | Jan 2019 - Apr 2022`;
  const latexB = generateATSLatex(`John Doe\njohn@example.com\nWORK EXPERIENCE\n${caseB}\n• Built payment APIs.`);
  assert(latexB.includes("{Stripe, Inc.}{San Francisco, CA}"), "Pattern B must place Company Top-Left and Location Top-Right");
  assert(latexB.includes("{Staff Infrastructure Engineer}{Jan 2019 -- Apr 2022}"), "Pattern B must place Role Bottom-Left and Date Bottom-Right");

  // Case C: Corporate suffixes preserved on comma separation
  const parsedOrgLoc1 = parseOrgAndLoc("Acme Corp, Inc.");
  assert.strictEqual(parsedOrgLoc1.org, "Acme Corp, Inc.");
  assert.strictEqual(parsedOrgLoc1.loc, "");

  const parsedOrgLoc2 = parseOrgAndLoc("JulleyOnline Private Limited, Bangalore, India");
  assert.strictEqual(parsedOrgLoc2.org, "JulleyOnline Private Limited");
  assert.strictEqual(parsedOrgLoc2.loc, "Bangalore, India");

  console.log("✅ [PASS] Subheading layout alignment preserves visual hierarchy (Org/Loc/Role/Date)!");

  // -------------------------------------------------------------
  // Test 3: Tabular* and Custom Macro Template Support
  // -------------------------------------------------------------
  console.log("\n--- Test 3: Tabular* and Custom Macro Templates ---");
  const tabularLatex = `\\documentclass{article}
\\usepackage[hidelinks]{hyperref}
\\newcommand{\\customRole}[2]{\\textbf{#1} \\hfill \\textit{#2}}
\\begin{document}
\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{\\Large Marcus Vance} & marcus.vance@example.com \\\\
  LinkedIn $|$ GitHub & \\href{https://marcus.dev}{marcus.dev}
\\end{tabular*}
\\section{WORK EXPERIENCE}
\\customRole{Principal Architect}{Jan 2022 -- Present}
\\begin{itemize}
  \\item Spearheaded distributed storage engine with 99.999\\% uptime.
\\end{itemize}
\\end{document}`;

  const preservedTabular = ensureAllHrefsPreservedInLatex(tabularLatex, [
    "https://linkedin.com/in/marcus-vance",
    "https://github.com/marcusvance",
    "mailto:marcus.vance@example.com",
    "https://marcus.dev",
  ]);

  const pdfTabular = await compileLatexToPdfBuffer(preservedTabular);
  assert(pdfTabular !== null && pdfTabular.length > 5000, "Tabular* template must compile cleanly");
  const tabVal = await validatePdfHyperlinks(pdfTabular, [
    "https://linkedin.com/in/marcus-vance",
    "https://github.com/marcusvance",
    "mailto:marcus.vance@example.com",
    "https://marcus.dev",
  ]);
  assert.strictEqual(tabVal.valid, true, `Tabular* links must be clickable in PDF: ${tabVal.report}`);
  console.log("✅ [PASS] Tabular* layout and custom macros preserved with clickable PDF hyperlinks!");

  // -------------------------------------------------------------
  // Test 4: Special Characters & Legitimate Bracket Preservation
  // -------------------------------------------------------------
  console.log("\n--- Test 4: Special Characters & Legitimate Bracket Preservation ---");
  const specialCharText = `
Candidate Name
test@example.com | (555) 000-1111 | San Francisco, CA

WORK EXPERIENCE
Tech Corp | San Francisco, CA | Senior Engineer | 2020 - Present
• Implemented C++ and Node.js microservices with 99.99% availability [Remote].
• Designed TCP/IP protocol parsers for streaming data [Contract] [US Citizen].
• Upgraded Python __init__ dunder methods and optimized SQL queries [Full-Time].
• Resolved [X]% metric placeholder and achieved [N] scale.
`;

  const latexSpecial = generateATSLatex(specialCharText);
  const cleanedSpecial = cleanLingeringPlaceholders(latexSpecial, true);

  assert(cleanedSpecial.includes("[Remote]"), "Must preserve [Remote]");
  assert(cleanedSpecial.includes("[Contract]"), "Must preserve [Contract]");
  assert(cleanedSpecial.includes("[US Citizen]"), "Must preserve [US Citizen]");
  assert(cleanedSpecial.includes("[Full-Time]"), "Must preserve [Full-Time]");
  assert(!cleanedSpecial.includes("[X]%"), "Must cleanly remove [X]%");
  assert(!cleanedSpecial.includes("[N]"), "Must cleanly remove [N]");

  const pdfBufSpecial = await compileLatexToPdfBuffer(cleanedSpecial);
  assert(pdfBufSpecial !== null && pdfBufSpecial.length > 5000, "Special characters resume must compile");
  const pdfTextSpecial = await extractTextFromPdf(pdfBufSpecial);

  assert(pdfTextSpecial.includes("[Remote]"), "PDF text must retain [Remote]");
  assert(pdfTextSpecial.includes("[Contract]"), "PDF text must retain [Contract]");
  assert(pdfTextSpecial.includes("[US Citizen]"), "PDF text must retain [US Citizen]");
  assert(pdfTextSpecial.includes("C++"), "PDF text must retain C++");
  console.log("✅ [PASS] Legitimate brackets and special characters preserved without data loss!");

  // -------------------------------------------------------------
  // Test 5: Multi-Pass Idempotence & Safe Transformations
  // -------------------------------------------------------------
  console.log("\n--- Test 5: Multi-Pass Transformation Idempotence ---");
  let testLatex = latex1;
  const lenPass1 = testLatex.length;

  for (let pass = 2; pass <= 5; pass++) {
    testLatex = ensureAllHrefsPreservedInLatex(testLatex);
    testLatex = cleanLingeringPlaceholders(testLatex, true);
  }
  const lenPassFinal = testLatex.length;
  // Length should remain stable after initial pass (zero runaway expansion)
  assert.strictEqual(
    lenPassFinal,
    lenPass1,
    `Transformation must be completely idempotent: Pass 1 was ${lenPass1} chars, Pass 5 was ${lenPassFinal} chars`
  );
  console.log(`✅ [PASS] 5 consecutive transformation passes maintained exact character count (${lenPassFinal} chars)!`);

  // -------------------------------------------------------------
  // Test 6: AI Instruction Prefix & Note Annotation Stripping
  // -------------------------------------------------------------
  console.log("\n--- Test 6: AI Instruction Prefix & Note Annotation Stripping ---");
  const rawAiBullet = "Optimized: Engineered event-driven pipeline reducing latency by 40%. *(Note: Verified with metrics)*";
  const patched = escapeLatexForPatch(rawAiBullet);
  assert(!patched.includes("Optimized:"), "Must strip 'Optimized:' prefix");
  assert(!patched.includes("Note:"), "Must strip '*(Note:...)*' annotation");
  assert(patched.includes("Engineered event-driven pipeline"), "Must retain core bullet content");
  console.log("✅ [PASS] AI instruction prefixes and notes cleanly removed from output!");

  console.log("\n==================================================================");
  console.log("🎉 ALL MULTI-RESUME REGRESSION TESTS PASSED (6/6)!");
  console.log("==================================================================\n");
}

runResumeFormattingRegressionSuite().catch((err) => {
  console.error("❌ Regression test failed:", err);
  process.exit(1);
});
