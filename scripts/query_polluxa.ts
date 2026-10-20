import { prisma } from "../lib/db/prisma";

async function main() {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: "cmvd7ldme000grkfp0c4mrea0" },
    include: { screenshot: { include: { result: true } }, resume: true },
  });
  console.log("Draft:", {
    companyName: draft?.companyName,
    jobTitle: draft?.jobTitle,
    recipientEmail: draft?.recipientEmail,
    generationStatus: draft?.generationStatus,
  });
  console.log("ExtractionResult:", draft?.screenshot?.result);
  console.log("Resume extractedText:", draft?.resume?.extractedText?.slice(0, 1000));
}
main().catch(console.error).finally(() => prisma.$disconnect());
