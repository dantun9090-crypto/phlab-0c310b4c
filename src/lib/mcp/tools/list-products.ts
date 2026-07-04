import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Lists PH Labs research peptide products from the live public
 * Google Merchant feed. Read-only, no auth, safe for any MCP client.
 */
export default defineTool({
  name: "list_products",
  title: "List research peptide products",
  description:
    "List PH Labs research-use-only peptide products with title, price (GBP), availability, and product URL. Data is fetched live from the public product feed.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of products to return. Defaults to 50."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ limit }) => {
    const max = limit ?? 50;
    const res = await fetch("https://phlabs.co.uk/google-merchant-feed.xml", {
      headers: { accept: "application/xml" },
    });
    if (!res.ok) {
      return {
        content: [
          { type: "text", text: `Failed to fetch product feed: HTTP ${res.status}` },
        ],
        isError: true,
      };
    }
    const xml = await res.text();
    const items: Array<Record<string, string>> = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const pick = (block: string, tag: string): string => {
      const m = block.match(
        new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`),
      );
      return m ? m[1].trim() : "";
    };
    let match: RegExpExecArray | null;
    while ((match = itemRe.exec(xml)) && items.length < max) {
      const block = match[1];
      items.push({
        title: pick(block, "g:title") || pick(block, "title"),
        price: pick(block, "g:price"),
        availability: pick(block, "g:availability"),
        link: pick(block, "link"),
        id: pick(block, "g:id"),
      });
    }
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { products: items, count: items.length },
    };
  },
});
