import { prisma } from "../lib/db/prisma";
import { autoTailorResumeToJD } from "../lib/ats/tailor";
import { compileValidatedPdf } from "../lib/ats/pdf-artifact";
import { PDFParse } from "pdf-parse";

const jd2 = `
CloudScale AI
Senior Full-Stack AI Infrastructure Engineer
Location: Remote

We are seeking a Senior Full-Stack AI Infrastructure Engineer to architect our enterprise AI systems.
Key Requirements:
- JavaScript
- Python
- Node.js
- Docker
- Kubernetes
- CI/CD
- REST
- Distributed Systems
- Artificial Intelligence
- LLM
- Git
`;

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  const baseText = activeResume!.extractedText!;
  const tailored = await autoTailorResumeToJD({
    resumeText: baseText,
    jobText: jd2,
    companyName: "CloudScale AI",
    targetRoleTitle: "Senior Full-Stack AI Infrastructure Engineer",
  });

  const res = await compileValidatedPdf(tailored.optimizedLatex, {
    linkSource: baseText,
    expectedText: tailored.optimizedText,
    minContentCoverage: 0.85,
  });

  console.log("res.ok:", res.ok);
  console.log("res.pages:", res.pages);
  if (res.buffer) {
    const p = new PDFParse({ data: res.buffer });
    await p.load();
    for (let i = 1; i <= p.doc.numPages; i++) {
      const page = await p.doc.getPage(i);
      const content = await page.getTextContent();
      const str = content.items.map((it) => it.str).join(" ");
      console.log(`Page ${i} len: ${str.length}, ends with:`, str.slice(-150));
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
