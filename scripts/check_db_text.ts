import { prisma } from "../lib/db/prisma";

async function main() {
  const r = await prisma.resume.findUnique({
    where: { id: "cmvb0t7p5000064fpjvxo4o7u" },
  });
  console.log("DB extractedText first 500 chars:");
  console.log(r?.extractedText?.slice(0, 500));
}
main().catch(console.error).finally(() => prisma.$disconnect());
