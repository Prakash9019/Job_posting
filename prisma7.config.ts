import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "") ? "prisma/schema.postgresql.prisma" : "prisma/schema.prisma",
  migrations: {
    path: /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "") ? "prisma/postgresql-migrations" : "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "file:./data/dev.db",
  },
});
