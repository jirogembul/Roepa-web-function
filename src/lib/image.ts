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
  return value in EXTENSION_BY_MEDIA_TYPE;
}

// Local disk is fine for a single-instance prototype. Move this to object
// storage (S3, etc.) when the app needs to run on more than one machine.
export async function saveReceiptImage(
  bytes: Buffer,
  mediaType: SupportedImageMediaType,
): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}.${EXTENSION_BY_MEDIA_TYPE[mediaType]}`;
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return `/uploads/receipts/${filename}`;
}
