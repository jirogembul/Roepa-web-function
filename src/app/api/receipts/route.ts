import { NextResponse } from "next/server";
import { createReceipt, listReceipts, type ReceiptItemInput } from "@/lib/receipts";

// imagePath is echoed back by the client, so it is only accepted in the exact
// shape saveReceiptImage() produces — never an arbitrary URL to store and render.
const IMAGE_PATH_PATTERN = /^\/uploads\/receipts\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

function parseItems(raw: unknown): ReceiptItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items: ReceiptItemInput[] = [];
  for (const entry of raw) {
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string") return null;
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity)) return null;
    if (typeof item.totalPrice !== "number" || !Number.isFinite(item.totalPrice)) return null;

    items.push({
      name: item.name,
      quantity: item.quantity,
      unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
      totalPrice: item.totalPrice,
      category: typeof item.category === "string" ? item.category : null,
    });
  }
  return items;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET() {
  const receipts = await listReceipts();
  return NextResponse.json({ receipts });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  const items = parseItems(body.items);
  if (!items) {
    return NextResponse.json(
      { error: "Minimal harus ada satu item yang valid" },
      { status: 400 },
    );
  }
  if (typeof body.total !== "number" || !Number.isFinite(body.total)) {
    return NextResponse.json({ error: "Total struk wajib diisi" }, { status: 400 });
  }
  if (typeof body.currency !== "string" || body.currency.length === 0) {
    return NextResponse.json({ error: "Mata uang wajib diisi" }, { status: 400 });
  }

  const imagePath =
    typeof body.imagePath === "string" && IMAGE_PATH_PATTERN.test(body.imagePath)
      ? body.imagePath
      : null;

  try {
    const receipt = await createReceipt({
      merchant: typeof body.merchant === "string" ? body.merchant : null,
      purchasedAt: typeof body.purchasedAt === "string" ? body.purchasedAt : null,
      currency: body.currency,
      subtotal: optionalNumber(body.subtotal),
      tax: optionalNumber(body.tax),
      total: body.total,
      imagePath,
      items,
    });
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    console.error("Saving receipt failed", error);
    return NextResponse.json(
      { error: "Gagal menyimpan struk ke database" },
      { status: 500 },
    );
  }
}
