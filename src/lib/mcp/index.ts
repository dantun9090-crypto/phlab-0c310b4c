import { defineMcp } from "@lovable.dev/mcp-js";
import listProductsTool from "./tools/list-products";
import fetchPageTool from "./tools/fetch-page";

export default defineMcp({
  name: "phlabs-mcp",
  title: "PH Labs MCP",
  version: "0.1.0",
  instructions:
    "Tools for the PH Labs UK research peptide store (phlabs.co.uk). Use `list_products` to browse the live product catalog and `fetch_page` to read any public page on the site. All tools are read-only and return public data. Products are for research use only.",
  tools: [listProductsTool, fetchPageTool],
});
