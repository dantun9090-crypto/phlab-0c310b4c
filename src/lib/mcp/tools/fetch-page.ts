import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Fetch a public page from phlabs.co.uk and return its HTML text.
 * Read-only, restricted to the phlabs.co.uk origin for safety.
 */
export default defineTool({
  name: "fetch_page",
  title: "Fetch a phlabs.co.uk page",
  description:
    "Fetch the HTML of a public page on https://phlabs.co.uk (e.g. '/', '/products', '/resources/some-slug'). Returns raw HTML text.",
  inputSchema: {
    path: z
      .string()
      .describe("Path on phlabs.co.uk, must start with '/'. Example: '/products'."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ path }) => {
    if (!path.startsWith("/")) {
      return {
        content: [{ type: "text", text: "path must start with '/'" }],
        isError: true,
      };
    }
    const url = `https://phlabs.co.uk${path}`;
    const res = await fetch(url, { headers: { accept: "text/html" } });
    const text = await res.text();
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `HTTP ${res.status} for ${url}` }],
        isError: true,
      };
    }
    // Cap to a reasonable size for MCP transport.
    const capped = text.length > 200_000 ? text.slice(0, 200_000) + "\n<!-- truncated -->" : text;
    return {
      content: [{ type: "text", text: capped }],
      structuredContent: { url, status: res.status, bytes: text.length },
    };
  },
});
