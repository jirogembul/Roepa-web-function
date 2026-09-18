import { NextResponse } from "next/server";
import { createReceipt, listReceipts, type ReceiptInput } from "@/lib/receipts";

export async function GET() {
  const receipts = await listReceipts();
  return NextResponse.json({ receipts });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ReceiptInput>;

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "Minimal harus ada satu item" },
      { status: 400 },
    );
  }
  if (typeof body.total !== "number") {
    return NextResponse.json({ error: "Total struk wajib diisi" }, { status: 400 });
  }
  if (typeof body.currency !== "string") {
    return NextResponse.json({ error: "Mata uang wajib diisi" }, { status: 400 });
  }

  const receipt = await createReceipt({
    merchant: body.merchant ?? null,
    purchasedAt: body.purchasedAt ?? null,
    currency: body.currency,
    subtotal: body.subtotal ?? null,
    tax: body.tax ?? null,
    total: body.total,
    imagePath: body.imagePath ?? null,
    items: body.items,
  });

  return NextResponse.json({ receipt }, { status: 201 });
}
