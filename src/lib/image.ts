import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { SupportedImageMediaType } from "@/lib/llm";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "receipts");

const EXTENSION_BY_MEDIA_TYPE: Record<SupportedImageMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isSupportedImageMediaType(
  value: string,
): value is SupportedImageMediaType {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so a client
  // sending Content-Type "toString" would pass the allowlist.
  return Object.prototype.hasOwnProperty.call(EXTENSION_BY_MEDIA_TYPE, value);
}

// Local disk works for a single-instance deployment. Serverless hosts (Vercel)
// serve from a read-only filesystem, so there the photo is dropped and the
// receipt is still recorded — nothing in the UI renders the stored photo yet.
// Object storage (S3, Vercel Blob) is what makes it durable in production.
export async function saveReceiptImage(
  bytes: Buffer,
  mediaType: SupportedImageMediaType,
): Promise<string | null> {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.${EXTENSION_BY_MEDIA_TYPE[mediaType]}`;
    await writeFile(path.join(UPLOAD_DIR, filename), bytes);
    return `/uploads/receipts/${filename}`;
  } catch (error) {
    console.warn("Could not store receipt image", error);
    return null;
  }
}
