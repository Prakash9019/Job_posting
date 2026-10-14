import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const postgres = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "");
if (process.env.VERCEL && !postgres) throw new Error("Vercel requires a PostgreSQL DATABASE_URL.");
const source = readFileSync("prisma/schema.prisma", "utf8");
writeFileSync("prisma/schema.postgresql.prisma", source.replace('provider = "sqlite"', 'provider = "postgresql"'));
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--config", "prisma7.config.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
