import { NextResponse } from "next/server";
import { getReceiptParser } from "@/lib/llm";
import { isSupportedImageMediaType, saveReceiptImage } from "@/lib/image";

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
      { error: "Gagal membaca struk ini. Coba foto yang lebih jelas." },
      { status: 502 },
    );
  }

  const imagePath = await saveReceiptImage(bytes, file.type);

  return NextResponse.json({ imagePath, parsed });
}
