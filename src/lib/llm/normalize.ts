import type { ParsedReceipt, ReceiptItemDraft } from "./types";

// Every provider returns loosely-typed JSON, so both adapters funnel their raw
// output through here to get a ParsedReceipt the rest of the app can trust.

export function normalizeReceipt(input: Record<string, unknown>): ParsedReceipt {
  const items = (Array.isArray(input.items) ? input.items : []).map(normalizeItem);
  const itemsTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return {
    merchant: typeof input.merchant === "string" ? input.merchant : null,
    purchasedAt: typeof input.purchasedAt === "string" ? input.purchasedAt : null,
    currency: typeof input.currency === "string" ? input.currency : "IDR",
    subtotal: typeof input.subtotal === "number" ? input.subtotal : null,
    tax: typeof input.tax === "number" ? input.tax : null,
    total: typeof input.total === "number" ? input.total : itemsTotal,
    items,
  };
}

function normalizeItem(raw: unknown): ReceiptItemDraft {
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof item.name === "string" ? item.name : "Unknown item",
    quantity: typeof item.quantity === "number" ? item.quantity : 1,
    unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
    totalPrice: typeof item.totalPrice === "number" ? item.totalPrice : 0,
    category: typeof item.category === "string" ? item.category : null,
  };
}

export const EXTRACTION_PROMPT =
  "Extract every line item and the totals from this shopping receipt. Use null for fields you can't read. Default quantity to 1 when not printed.";
