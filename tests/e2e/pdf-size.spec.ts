import { expect, test } from "./helpers";

// Regression: src/proxy.ts truncated request bodies at 10 MB, so 10-25 MB PDFs failed as PDF_MISSING.
test("a 15 MB upload reaches the PDF checks through the proxy", async ({ request }) => {
  const res = await request.post("/api/ingest/pdf", {
    multipart: {
      file: { name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(15 * 1024 * 1024, 0x20) },
    },
  });
  const body = (await res.json()) as { error?: { code?: string } };
  expect(body.error?.code).not.toBe("PDF_MISSING");
  expect(res.status()).not.toBe(413);
});
