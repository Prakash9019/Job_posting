import "dotenv/config";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaPg } from "@prisma/adapter-pg";

const rawUrl = process.env.DATABASE_URL || "file:./data/dev.db";
let url = rawUrl;
if (rawUrl.startsWith("file:")) {
  const relativePath = rawUrl.replace("file:", "");
  if (!path.isAbsolute(relativePath)) {
    url = `file:${path.resolve(process.cwd(), relativePath)}`;
  }
}

const adapter = /^postgres(?:ql)?:/.test(rawUrl)
  ? new PrismaPg({ connectionString: rawUrl, max: 3 })
  : new PrismaLibSql({ url });

const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Seeding initial users...");

  await prisma.user.upsert({
    where: { id: "user_a" },
    update: { name: "User A" },
    create: {
      id: "user_a",
      name: "User A",
    },
  });

  await prisma.user.upsert({
    where: { id: "user_b" },
    update: { name: "User B" },
    create: {
      id: "user_b",
      name: "User B",
    },
  });

  console.log("Seeding complete. User A and User B are ready.");
}

seed()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
