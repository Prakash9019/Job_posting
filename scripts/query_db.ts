import { prisma } from "../lib/db/prisma";

async function main() {
  const resumes = await prisma.resume.findMany({
    select: { id: true, fileName: true, filePath: true, fileSize: true, mimeType: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log("=== Recent Resumes ===");
  console.log(resumes);

  const drafts = await prisma.emailDraft.findMany({
    select: { id: true, companyName: true, jobTitle: true, resumeId: true, generationStatus: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("=== Recent Email Drafts ===");
  console.log(drafts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
