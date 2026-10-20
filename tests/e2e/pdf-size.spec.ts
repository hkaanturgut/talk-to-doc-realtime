import { expect, test } from "./helpers";

// Regression: src/proxy.ts truncated request bodies at 10 MB, so 10-25 MB PDFs failed as PDF_MISSING.
test("a 15 MB upload reaches the PDF checks through the proxy", async ({ request }) => {
  const res = await request.post("/api/ingest/pdf", {
    headers: { "x-forwarded-for": "10.250.0.15" },
    multipart: {
      file: { name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(15 * 1024 * 1024, 0x20) },
    },
  });
  const body = (await res.json()) as { error?: { code?: string } };
  // 15 MB of spaces is not a PDF: reaching the magic-byte check proves the body arrived whole.
  expect(body.error?.code).toBe("PDF_NOT_PDF");
  expect(res.status()).toBe(415);
});

test("non-PDF API bodies over 2 MB are refused by the proxy", async ({ request }) => {
  const res = await request.post("/api/ingest/text", {
    headers: { "x-forwarded-for": "10.250.0.16", "content-type": "application/json" },
    data: JSON.stringify({ text: "x".repeat(3 * 1024 * 1024) }),
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe("INVALID_REQUEST");
});
