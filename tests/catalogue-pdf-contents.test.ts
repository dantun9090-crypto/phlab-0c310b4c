/**
 * Verifies the bundled /PH-Labs-Research-Catalogue.pdf:
 *   1. Exists at public/PH-Labs-Research-Catalogue.pdf
 *   2. Contains the expected catalogue text (PH LABS, RUO disclaimer, ≥1 SKU)
 *   3. The path matches the CATALOGUE_PDF_URL referenced by:
 *        - /request-catalog success panel download link
 *        - /request-catalog 500-fallback download link
 *      (Both code paths must keep pointing at the same shipped asset.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
// pdf-parse v2 default export is a function returning { text, ... }
// CommonJS-style import keeps Vitest happy under Node ESM.
import pdf from "pdf-parse";

const PDF_PATH = resolve(process.cwd(), "public/PH-Labs-Research-Catalogue.pdf");
const EXPECTED_URL = "/PH-Labs-Research-Catalogue.pdf";

describe("PH-Labs-Research-Catalogue.pdf", () => {
  it("ships at public/PH-Labs-Research-Catalogue.pdf", () => {
    expect(existsSync(PDF_PATH)).toBe(true);
  });

  it("parses and contains the expected catalogue text", async () => {
    const buf = readFileSync(PDF_PATH);
    const parsed = await (pdf as unknown as (b: Buffer) => Promise<{ text: string; numpages: number }>)(buf);
    const text = parsed.text.replace(/\s+/g, " ");
    expect(parsed.numpages).toBeGreaterThan(0);
    expect(text).toMatch(/PH\s*LABS/i);
    expect(text).toMatch(/Research Compound Catalogue/i);
    expect(text).toMatch(/For Research Use Only\.\s*Not for Human Consumption\./i);
    // At least one PHL- product code is present (catalogue listing).
    expect(text).toMatch(/PHL-[A-Z0-9]+/);
  });

  it("RequestCatalog success and error paths reference the same URL", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/RequestCatalog/index.tsx"), "utf8");
    // The constant must exist and equal the expected URL.
    expect(src).toMatch(/CATALOGUE_PDF_URL\s*=\s*["']\/PH-Labs-Research-Catalogue\.pdf["']/);
    // Both download links must reference the SAME constant (no hardcoded second URL).
    const refs = src.match(/href=\{CATALOGUE_PDF_URL\}/g) || [];
    expect(refs.length).toBeGreaterThanOrEqual(2);
    // Catalogue URL must be the public path.
    expect(EXPECTED_URL).toBe("/PH-Labs-Research-Catalogue.pdf");
  });
});
