import { prisma } from "@/lib/db";

export interface ReceiptItemInput {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  category: string | null;
}

export interface ReceiptInput {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  imagePath: string | null;
  items: ReceiptItemInput[];
}

// The only file in the app that talks to Prisma directly. Swapping storage
// (Postgres, a different schema for multi-company reporting, etc.) means
// changing this file, not every place that reads/writes receipts.

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createReceipt(input: ReceiptInput) {
  return prisma.receipt.create({
    data: {
      merchant: input.merchant,
      purchasedAt: toDate(input.purchasedAt),
      currency: input.currency,
      subtotal: input.subtotal,
      tax: input.tax,
      total: input.total,
      imagePath: input.imagePath,
      items: {
        create: input.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          category: item.category,
        })),
      },
    },
    include: { items: true },
  });
}

export async function listReceipts() {
  return prisma.receipt.findMany({
    include: { items: true },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
  });
}

