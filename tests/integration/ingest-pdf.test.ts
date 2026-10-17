import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/pdf/route";
import { documentStore } from "@/server/documents";
import { PreviewSchema } from "@/shared/schemas";
import { freshIp } from "../support/fixtures";

const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures/out", name));

function upload(bytes: Uint8Array | null, name = "Atlantis Facts.pdf", ip = freshIp()) {
  const form = new FormData();
  if (bytes) form.set("file", new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
  return POST(
    new Request("http://localhost/api/ingest/pdf", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: form,
    }),
  );
}

describe("POST /api/ingest/pdf", () => {
  it("ingests a text PDF and returns the preview", async () => {
    const tmpBefore = readdirSync(tmpdir()).length;
    const res = await upload(fixture("text.pdf"));
    expect(res.status).toBe(200);
    const preview = PreviewSchema.parse(await res.json());
    expect(preview).toMatchObject({
      kind: "pdf",
      title: "Atlantis Facts",
      pageCount: 3,
      pagesUsed: 3,
      truncated: false,
    });
    expect(preview.contextText).toContain("Poseidonia");

    // Only extracted text is stored, never the raw bytes, and nothing is written to disk.
    const stored = documentStore.get(preview.documentId);
    expect(stored).toBeDefined();
    for (const value of Object.values(stored!)) expect(value).not.toBeInstanceOf(Uint8Array);
    expect(readdirSync(tmpdir()).length).toBe(tmpBefore);
  });

  it("truncates a long PDF and reports pages used", async () => {
    const res = await upload(fixture("long.pdf"), "long.pdf");
    const preview = PreviewSchema.parse(await res.json());
    expect(preview.truncated).toBe(true);
    expect(preview.usedRatio).toBeGreaterThan(0);
    expect(preview.usedRatio).toBeLessThan(1);
    expect(preview.pagesUsed).toBeLessThan(300);
    expect(preview.contextText.length).toBeLessThanOrEqual(80_000);
    expect(preview.fullTextTail.length).toBeGreaterThan(0);
  }, 30_000);

  it.each([
    ["not-pdf.pdf", 415, "PDF_NOT_PDF"],
    ["encrypted.pdf", 422, "PDF_PASSWORD_PROTECTED"],
    ["scanned.pdf", 422, "PDF_NO_TEXT"],
    ["corrupt.pdf", 422, "PDF_INVALID"],
  ])("%s → %i %s", async (name, status, code) => {
    const res = await upload(fixture(name), name);
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it("rejects a request with no file", async () => {
    const res = await upload(null);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("PDF_MISSING");
  });

  it("rejects a 26 MB body with the actual size in the message", async () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    big.set(new TextEncoder().encode("%PDF-1.7"));
    const res = await upload(big);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("PDF_TOO_LARGE");
    expect(body.error.message).toContain("26.0 MB");
  });

  it("rejects early on content-length", async () => {
    const res = await POST(
      new Request("http://localhost/api/ingest/pdf", {
        method: "POST",
        headers: { "content-length": String(40 * 1024 * 1024), "x-forwarded-for": freshIp() },
        body: "x",
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rate limits to 20 per minute per IP", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await upload(null, "x.pdf", ip)).status);
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
