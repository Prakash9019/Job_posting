import { prisma } from "../lib/db/prisma";
import { parseResumeToCanonical, estimateRenderedLines } from "../lib/ats/tailor";

async function main() {
  const atatusResume = await prisma.resume.findFirst({ where: { fileName: { contains: "Atatus" } } });
  if (!atatusResume || !atatusResume.extractedText) {
    console.log("Atatus resume not found");
    return;
  }
  const canonical = parseResumeToCanonical(atatusResume.extractedText);
  const lines = estimateRenderedLines(canonical);
  console.log("Atatus estimatedRenderedLines:", lines);
}
main().catch(console.error).finally(() => prisma.$disconnect());
