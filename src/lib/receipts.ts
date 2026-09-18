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

export async function createReceipt(input: ReceiptInput) {
  return prisma.receipt.create({
    data: {
      merchant: input.merchant,
      purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
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

export async function getSpendingSummary() {
  const receipts = await prisma.receipt.findMany({ select: { total: true } });
  const totalSpent = receipts.reduce((sum, r) => sum + r.total, 0);
  return { totalSpent, receiptCount: receipts.length };
}
