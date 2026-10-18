import { describe, expect, it } from "vitest";
import { ACCESS_COOKIE_MAX_AGE, signAccessCookie, verifyAccessCookie } from "@/server/access/cookie";

const CODE = "correct-horse-battery";
const NOW = 1_800_000_000_000;

describe("access cookie", () => {
  it("round-trips and expires after the max age", async () => {
    const value = await signAccessCookie(CODE, NOW);
    expect(value).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(value).not.toContain(CODE);
    expect(await verifyAccessCookie(value, CODE, NOW + 1000)).toBe(true);
    expect(await verifyAccessCookie(value, CODE, NOW + ACCESS_COOKIE_MAX_AGE * 1000 + 1)).toBe(false);
  });

  it("rejects a cookie signed with another code (rotation)", async () => {
    const value = await signAccessCookie("an-older-access-code", NOW);
    expect(await verifyAccessCookie(value, CODE, NOW)).toBe(false);
  });

  it("rejects a tampered expiry or signature", async () => {
    const value = await signAccessCookie(CODE, NOW);
    const [v, exp, sig] = value.split(".");
    expect(await verifyAccessCookie(`${v}.${Number(exp) + 999_999}.${sig}`, CODE, NOW)).toBe(false);
    expect(await verifyAccessCookie(`${v}.${exp}.${sig!.slice(0, -2)}AA`, CODE, NOW)).toBe(false);
  });

  it.each([undefined, "", "v1", "v2.1.abc", "v1.x.abc", "v1.1.", "garbage"])("rejects %s", async (value) => {
    expect(await verifyAccessCookie(value, CODE, NOW)).toBe(false);
  });
});
