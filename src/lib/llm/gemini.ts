import { FinishReason, GoogleGenAI, Type } from "@google/genai";
import { EXTRACTION_PROMPT, normalizeReceipt } from "./normalize";
import type { ParsedReceipt, ReceiptImage, ReceiptParser } from "./types";

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING, nullable: true },
    purchasedAt: {
      type: Type.STRING,
      nullable: true,
      description: "Purchase date in ISO 8601 (YYYY-MM-DD), or null if unreadable.",
    },
    currency: {
      type: Type.STRING,
      description: "ISO 4217 currency code, e.g. IDR, USD. Guess from context if not printed.",
    },
    subtotal: { type: Type.NUMBER, nullable: true },
    tax: { type: Type.NUMBER, nullable: true },
    total: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER, nullable: true },
          totalPrice: { type: Type.NUMBER },
          category: {
            type: Type.STRING,
            nullable: true,
            description: "Short category guess, e.g. groceries, transport, dining.",
          },
        },
        required: ["name", "quantity", "totalPrice"],
      },
    },
  },
  required: ["currency", "total", "items"],
};

export class GeminiReceiptParser implements ReceiptParser {
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to .env or switch LLM_PROVIDER.",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  }

  async parseReceipt({ base64, mediaType }: ReceiptImage): Promise<ParsedReceipt> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data: base64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RECEIPT_SCHEMA,
        maxOutputTokens: 4096,
      },
    });

    // A truncated response yields half-built JSON that would either fail to
    // parse or silently drop line items.
    if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      throw new Error("Receipt too long to parse within the token budget.");
    }

    const text = response.text;
    if (!text) {
      throw new Error("Gemini did not return structured receipt data.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Gemini returned malformed JSON.");
    }

    return normalizeReceipt(parsed as Record<string, unknown>);
  }
}
