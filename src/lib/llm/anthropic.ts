import Anthropic from "@anthropic-ai/sdk";
import type {
  ParsedReceipt,
  ReceiptImage,
  ReceiptItemDraft,
  ReceiptParser,
} from "./types";

const RECEIPT_TOOL = {
  name: "record_receipt",
  description:
    "Record the structured data extracted from a photo of a shopping receipt.",
  input_schema: {
    type: "object" as const,
    properties: {
      merchant: { type: ["string", "null"] },
      purchasedAt: {
        type: ["string", "null"],
        description: "Purchase date in ISO 8601 (YYYY-MM-DD), or null if unreadable.",
      },
      currency: {
        type: "string",
        description: "ISO 4217 currency code, e.g. IDR, USD. Guess from context if not printed.",
      },
      subtotal: { type: ["number", "null"] },
      tax: { type: ["number", "null"] },
      total: { type: "number" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: ["number", "null"] },
            totalPrice: { type: "number" },
            category: {
              type: ["string", "null"],
              description: "Short category guess, e.g. groceries, transport, dining.",
            },
          },
          required: ["name", "quantity", "totalPrice"],
        },
      },
    },
    required: ["currency", "total", "items"],
  },
};

// Any provider that can read a receipt image and return this same shape can
// replace this adapter. See src/lib/llm/index.ts for how the provider is
// selected via LLM_PROVIDER.
export class AnthropicReceiptParser implements ReceiptParser {
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env or switch LLM_PROVIDER.",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  }

  async parseReceipt({ base64, mediaType }: ReceiptImage): Promise<ParsedReceipt> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: "tool", name: RECEIPT_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Extract every line item and the totals from this shopping receipt. Use null for fields you can't read. Default quantity to 1 when not printed.",
            },
          ],
        },
      ],
    });

    // A truncated response yields a half-built tool input that would silently
    // become a receipt with missing line items.
    if (message.stop_reason === "max_tokens") {
      throw new Error("Receipt too long to parse within the token budget.");
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("Claude did not return structured receipt data.");
    }

    return normalizeReceipt(toolUse.input as Record<string, unknown>);
  }
}

function normalizeReceipt(input: Record<string, unknown>): ParsedReceipt {
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
