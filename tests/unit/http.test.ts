import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/shared/errors";
import { clientIp } from "@/server/http/client-ip";
import { createRateLimiter } from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("uses the last x-forwarded-for entry (appended by the ingress)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
  });
  it("handles a single entry and whitespace", () => {
    expect(clientIp(req({ "x-forwarded-for": " 9.9.9.9 " }))).toBe("9.9.9.9");
  });
  it("falls back to unknown", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("allows the limit then rejects, and refills over time", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 10; i++) expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    t += 6_000; // one token per 6 s
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
  });

  it("check throws RATE_LIMITED (429)", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    limiter.check("k");
    expect(() => limiter.check("k")).toThrow(AppError);
    try {
      limiter.check("k");
    } catch (e) {
      expect((e as AppError).status).toBe(429);
    }
  });
});

describe("errorResponse", () => {
  it("maps AppError to its status and catalog message", async () => {
    const res = errorResponse(new AppError("PDF_NOT_PDF"), "test");
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "PDF_NOT_PDF", retryable: false });
  });

  it("uses the userMessage override", async () => {
    const res = errorResponse(new AppError("PDF_TOO_LARGE", { userMessage: "This PDF is 31.2 MB." }), "test");
    expect((await res.json()).error.message).toBe("This PDF is 31.2 MB.");
  });

  it("maps zod errors to INVALID_REQUEST", async () => {
    const zerr = z.object({ a: z.string() }).safeParse({}).error;
    const res = errorResponse(zerr, "test");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("maps unknown errors to a generic 500 without leaking details", async () => {
    const res = errorResponse(new Error("db password is hunter2 at line 42"), "test");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("line 42");
  });
});
