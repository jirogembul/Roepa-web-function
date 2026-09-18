import { NextResponse } from "next/server";
import { getReceiptParser } from "@/lib/llm";
import { isSupportedImageMediaType, saveReceiptImage } from "@/lib/image";

// API keys must never reach the browser, even inside an error string.
const API_KEY_PATTERN = /\b(AIza[\w-]{10,}|sk-ant-[\w-]{10,})\b/g;

// A single opaque message for every failure makes a wrong model name look
// identical to a blurry photo, so the real reason is passed through instead.
function describeParseFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(API_KEY_PATTERN, "[redacted]").slice(0, 300);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Foto struk tidak ditemukan" }, { status: 400 });
  }

  if (!isSupportedImageMediaType(file.type)) {
    return NextResponse.json(
      { error: `Format foto tidak didukung: ${file.type || "unknown"}` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    const parser = getReceiptParser();
    parsed = await parser.parseReceipt({
      base64: bytes.toString("base64"),
      mediaType: file.type,
    });
  } catch (error) {
    console.error("Receipt parsing failed", error);
    return NextResponse.json(
      { error: `Gagal membaca struk: ${describeParseFailure(error)}` },
      { status: 502 },
    );
  }

  const imagePath = await saveReceiptImage(bytes, file.type);

  return NextResponse.json({ imagePath, parsed });
}
