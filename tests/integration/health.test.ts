import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns ok with the git sha", async () => {
    vi.stubEnv("GIT_SHA", "abc123");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "abc123" });
  });

  it("falls back to dev", async () => {
    vi.stubEnv("GIT_SHA", undefined);
    expect(await GET().json()).toEqual({ status: "ok", version: "dev" });
  });
});
