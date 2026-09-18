import { AnthropicReceiptParser } from "./anthropic";
import { GeminiReceiptParser } from "./gemini";
import type { ReceiptParser } from "./types";

export type {
  ParsedReceipt,
  ReceiptImage,
  ReceiptItemDraft,
  ReceiptParser,
  SupportedImageMediaType,
} from "./types";

// Swap providers by setting LLM_PROVIDER and adding an adapter here that
// implements ReceiptParser. Nothing outside this file needs to know which
// provider is active.
export function getReceiptParser(): ReceiptParser {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  switch (provider) {
    case "anthropic":
      return new AnthropicReceiptParser();
    case "gemini":
      return new GeminiReceiptParser();
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Add an adapter in src/lib/llm/ and register it in getReceiptParser().`,
      );
  }
}
