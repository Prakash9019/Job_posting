import path from "path";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const rawUrl = process.env.DATABASE_URL || "file:./data/dev.db";
  let url = rawUrl;

  // Resolve relative SQLite file path to absolute path
  if (rawUrl.startsWith("file:")) {
    const relativePath = rawUrl.replace("file:", "");
    if (!path.isAbsolute(relativePath)) {
      url = `file:${path.resolve(/*turbopackIgnore: true*/ process.cwd(), relativePath)}`;
    }
  }

  if (process.env.VERCEL && !/^postgres(?:ql)?:/.test(rawUrl)) throw new Error("Configure a PostgreSQL DATABASE_URL on Vercel.");
  const adapter = /^postgres(?:ql)?:/.test(rawUrl)
    ? new PrismaPg({ connectionString: rawUrl, max: 3 })
    : new PrismaLibSql({ url });
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = getPrismaClient();
export default prisma;
