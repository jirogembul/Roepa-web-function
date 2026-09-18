import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Single PrismaClient instance per process, reused across hot reloads in dev.
// Swapping storage later (e.g. Postgres for multi-company reporting) means
// changing DATABASE_URL + the adapter here — nothing else in the app talks
// to the database directly, it all goes through src/lib/receipts.ts.
//
// libsql over better-sqlite3: it ships prebuilt binaries per platform, so
// `npm install` never needs Python or a C++ toolchain. Same SQLite file.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// A local "file:" URL needs no token; a hosted Turso "libsql://" URL does.
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
