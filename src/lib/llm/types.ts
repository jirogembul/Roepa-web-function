export interface ReceiptItemDraft {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  category: string | null;
}

export interface ParsedReceipt {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  items: ReceiptItemDraft[];
}

export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface ReceiptImage {
  base64: string;
  mediaType: SupportedImageMediaType;
}

export interface ReceiptParser {
  parseReceipt(image: ReceiptImage): Promise<ParsedReceipt>;
}
