import assert from "node:assert";
import fs from "fs";
import { generateATSLatex, compileLatexToPdfBuffer, autoTailorResumeToJD } from "../lib/ats/tailor";
import { latexToPlainText } from "../lib/ats/latex-text";

async function runLakshmiValidation() {
  console.log("==================================================================");
  console.log("🔍 COMPREHENSIVE VALIDATION FOR Resume_Sayyapureddy_Lakshmi.pdf");
  console.log("==================================================================\n");

  const { PDFParse } = await import("pdf-parse");

  // 1. Read the original uploaded PDF
  const pdfBytes = fs.readFileSync("Resume_Sayyapureddy_Lakshmi.pdf");
  const parserOrig = new PDFParse({ data: pdfBytes });
  const origData = await parserOrig.getText();
  console.log("Original PDF extracted character count:", origData.text.length);
  console.log("Original PDF page count:", origData.pages ? origData.pages.length : "unknown");

  // 2. Generate LaTeX using our updated generateATSLatex
  console.log("\n--- Step 1: Generating LaTeX using modernized generateATSLatex ---");
  const generatedLatex = generateATSLatex(origData.text);
  fs.writeFileSync("scripts/lakshmi_final.tex", generatedLatex);
  console.log("Generated LaTeX saved to scripts/lakshmi_final.tex (length: " + generatedLatex.length + ")");

  // Check LaTeX properties
  assert(!generatedLatex.includes("1 of 2"), "Must not contain '1 of 2'");
  assert(!generatedLatex.includes("2 of 2"), "Must not contain '2 of 2'");
  assert(!generatedLatex.includes("$|$"), "Must not contain raw math mode $|$");
  assert(!generatedLatex.includes("\\$|\\$"), "Must not contain escaped \\$|\\$");
  assert(generatedLatex.includes("\\resumeDivider"), "Must declare \\resumeDivider");
  assert(generatedLatex.includes("extarticle"), "Must use compact extarticle");
  assert(generatedLatex.includes("a4paper"), "Must target A4 paper");

  // Check section headings
  const expectedSections = [
    "PROFESSIONAL SUMMARY",
    "EDUCATION",
    "WORK EXPERIENCE",
    "PROJECTS",
    "TECHNICAL SKILLS",
    "ACHIEVEMENTS",
    "CERTIFICATIONS",
  ];
  for (const sec of expectedSections) {
    assert(generatedLatex.includes(`\\section{${sec}}`), `Must include section: ${sec}`);
    console.log(`✅ Section preserved: ${sec}`);
  }

  // 3. Compile to PDF with TeXLive
  console.log("\n--- Step 2: Compiling generated LaTeX with TeXLive CGI ---");
  const compiledPdfBuffer = await compileLatexToPdfBuffer(generatedLatex);
  assert(compiledPdfBuffer !== null && compiledPdfBuffer.length > 5000, "LaTeX compilation must succeed and return binary PDF buffer");
  fs.writeFileSync("scripts/lakshmi_final.pdf", compiledPdfBuffer);
  console.log("✅ TeXLive compilation successful! PDF size: " + compiledPdfBuffer.length + " bytes");

  // 4. Validate compiled PDF geometry and page count
  console.log("\n--- Step 3: Validating Page Count and Content Integrity ---");
  const parserCompiled = new PDFParse({ data: compiledPdfBuffer });
  const compiledData = await parserCompiled.getText();
  const pageCount = compiledData.pages ? compiledData.pages.length : 1;
  console.log(`Rendered PDF Page Count: ${pageCount}`);
  assert.strictEqual(pageCount, 1, `Expected exactly 1 page, but got ${pageCount} pages!`);
  console.log("✅ PERFECT 1-PAGE LAYOUT: 0 overflow, clean single page achieved!");

  console.log("Compiled PDF extracted text length:", compiledData.text.length);

  // Verify critical content elements in compiled PDF
  const criticalItems = [
    "Sayyapureddy Lakshmi",
    "lakshmi.charvy1819@gmail.com",
    "+91-8309769388",
    "Centre for Brain Research",
    "IISc Bangalore",
    "Research Intern",
    "Julley Online Pvt Ltd",
    "AI Engineer",
    "Infosys",
    "Software Engineer Intern",
    "Arthavo Technologies",
    "Data Science Intern",
    "AI-Powered Resume Analyzer",
    "MCQ Generator",
    "Multi-Language Invoice Extractor",
    "Python",
    "LangChain",
    "PyTorch",
    "TensorFlow",
    "FastAPI",
    "Docker",
    "SusHacks",
    "Kaggle Bronze Medalist",
    "Vignan",
    "CCNA",
  ];

  for (const item of criticalItems) {
    assert(
      compiledData.text.toLowerCase().includes(item.toLowerCase()),
      `Compiled PDF is missing critical item: ${item}`
    );
  }
  console.log("✅ All " + criticalItems.length + " critical content items verified intact in rendered PDF!");

  // Verify no hyphenated word splits like "applica- tions"
  assert(!compiledData.text.includes("applica-"), "Must not contain broken hyphenated words like 'applica-'");
  assert(!compiledData.text.includes("automa-"), "Must not contain broken hyphenated words like 'automa-'");
  console.log("✅ No broken de-hyphenation artifacts in final output!");

  console.log("\n==================================================================");
  console.log("🎉 ALL VALIDATION CHECKS PASSED FOR LAKSHMI'S RESUME!");
  console.log("==================================================================\n");
}

runLakshmiValidation().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
