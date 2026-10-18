import { describe, expect, it } from "vitest";
import { isRelayAuthorized } from "@/server/ingestion/youtube/relay/auth";

const SECRET = "s".repeat(44);

describe("isRelayAuthorized", () => {
  it("accepts the right bearer secret", () => {
    expect(isRelayAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["wrong", `Bearer ${"x".repeat(44)}`],
    ["prefix", `Bearer ${SECRET.slice(0, 20)}`],
    ["longer", `Bearer ${SECRET}x`],
    ["wrong scheme", `Basic ${SECRET}`],
    ["no token", "Bearer "],
  ])("rejects %s", (_, header) => {
    expect(isRelayAuthorized(header, SECRET)).toBe(false);
  });
});
