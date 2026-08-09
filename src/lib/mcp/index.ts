import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProductsTool from "./tools/list-products";
import fetchPageTool from "./tools/fetch-page";

// OAuth issuer must be the direct backend auth host; the project ref is the only
// value that survives publish unchanged and is inlined at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "phlabs-mcp",
  title: "PH Labs MCP",
  version: "0.1.0",
  instructions:
    "Tools for the PH Labs UK research peptide store (phlabs.co.uk). Use `list_products` to browse the live product catalog and `fetch_page` to read any public page on the site. All tools are read-only and return public data. Products are for research use only.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProductsTool, fetchPageTool],
});
