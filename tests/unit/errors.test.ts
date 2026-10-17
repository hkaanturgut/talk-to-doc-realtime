import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, ERROR_META } from "@/shared/errors";
import { MESSAGES } from "@/shared/messages";

describe("error catalog", () => {
  it.each(ERROR_CODES)("%s has a message and metadata", (code) => {
    expect(MESSAGES[code].length).toBeGreaterThan(5);
    expect(ERROR_META[code]).toBeDefined();
  });

  it("AppError carries status and retryable from the catalog", () => {
    const err = new AppError("PDF_TOO_LARGE");
    expect(err.status).toBe(413);
    expect(err.retryable).toBe(false);
    expect(new AppError("RATE_LIMITED").retryable).toBe(true);
  });
});
