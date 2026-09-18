import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Single PrismaClient instance per process, reused across hot reloads in dev.
// Swapping storage later (e.g. Postgres for multi-company reporting) means
// changing DATABASE_URL + the adapter here — nothing else in the app talks
// to the database directly, it all goes through src/lib/receipts.ts.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
