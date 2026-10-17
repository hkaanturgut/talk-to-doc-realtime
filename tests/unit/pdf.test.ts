import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdf, hasPdfMagic } from "@/server/ingestion/pdf";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../fixtures/out", name)));

describe("extractPdf", () => {
  it("extracts text and page offsets from a text PDF", async () => {
    const r = await extractPdf(fixture("text.pdf"));
    expect(r.pageCount).toBe(3);
    expect(r.text).toContain("Poseidonia");
    expect(r.text).toContain("Great Tide Wall");
    expect(r.pageOffsets).toHaveLength(3);
    expect(r.text.slice(r.pageOffsets[1])).toMatch(/^Page 2/);
  });

  it("handles a 300-page PDF", async () => {
    const r = await extractPdf(fixture("long.pdf"));
    expect(r.pageCount).toBe(300);
    expect(r.text.length).toBeGreaterThan(80_000);
  }, 30_000);

  it.each([
    ["not-pdf.pdf", "PDF_NOT_PDF"],
    ["encrypted.pdf", "PDF_PASSWORD_PROTECTED"],
    ["scanned.pdf", "PDF_NO_TEXT"],
    ["corrupt.pdf", "PDF_INVALID"],
  ])("%s → %s", async (name, code) => {
    await expect(extractPdf(fixture(name))).rejects.toMatchObject({ code });
  });

  it("times out with PDF_TIMEOUT", async () => {
    await expect(extractPdf(fixture("long.pdf"), { timeoutMs: 1 })).rejects.toMatchObject({
      code: "PDF_TIMEOUT",
    });
  });
});

describe("hasPdfMagic", () => {
  it("detects the header", () => {
    expect(hasPdfMagic(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfMagic(new TextEncoder().encode("hello"))).toBe(false);
  });
});
