import { prisma } from "../lib/db/prisma";

async function main() {
  const activeResume = await prisma.resume.findFirst({
    where: { isActive: true },
  });
  console.log("Active Resume:", {
    id: activeResume?.id,
    fileName: activeResume?.fileName,
    filePath: activeResume?.filePath,
    extractedTextLength: activeResume?.extractedText?.length,
    firstLine: activeResume?.extractedText?.split("\n").slice(0, 3),
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
