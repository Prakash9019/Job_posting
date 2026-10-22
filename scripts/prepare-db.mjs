import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const postgres = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "");
if (process.env.VERCEL && !postgres) throw new Error("Vercel requires a PostgreSQL DATABASE_URL.");
const source = readFileSync("prisma/schema.prisma", "utf8");
writeFileSync("prisma/schema.postgresql.prisma", source.replace('provider = "sqlite"', 'provider = "postgresql"'));
if (postgres && process.env.DATABASE_URL) {
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('ALTER TABLE "ExtractedUrl" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;');
    await client.end();
  } catch (dbErr) {
    console.warn("Could not auto-migrate PostgreSQL columns in prepare-db:", dbErr.message);
  }
}
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--config", "prisma7.config.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
