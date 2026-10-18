import { describe, expect, it } from "vitest";
import { signAccessCookie } from "@/server/access/cookie";
import { decide, safeNext, type GateInput } from "@/server/access/gate";

const CODE = "correct-horse-battery";

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    method: "GET",
    pathname: "/",
    search: "",
    host: "app.example",
    origin: null,
    fetchSite: null,
    cookie: undefined,
    code: CODE,
    ...over,
  };
}

describe("access gate", () => {
  it("passes everything when no code is configured", async () => {
    expect(await decide(input({ code: undefined }))).toEqual({ action: "pass" });
    expect(await decide(input({ code: undefined, pathname: "/api/session", method: "POST" }))).toEqual({
      action: "pass",
    });
  });

  it("redirects pages to the access screen with next", async () => {
    expect(await decide(input({ pathname: "/", search: "?x=1" }))).toEqual({
      action: "redirect",
      location: "/access?next=%2F%3Fx%3D1",
    });
  });

  it("refuses APIs with 401", async () => {
    expect(await decide(input({ pathname: "/api/ingest/text", method: "POST" }))).toEqual({
      action: "unauthorized",
    });
  });

  it.each(["/access", "/api/access", "/api/health", "/api/relay/next", "/api/relay/result", "/robots.txt"])(
    "%s is public",
    async (pathname) => {
      expect(
        await decide(input({ pathname, method: pathname.startsWith("/api/relay/result") ? "POST" : "GET" })),
      ).toEqual({
        action: "pass",
      });
    },
  );

  it("passes with a valid cookie and refuses an invalid one", async () => {
    const cookie = await signAccessCookie(CODE);
    expect(await decide(input({ cookie }))).toEqual({ action: "pass" });
    expect(await decide(input({ cookie: cookie + "x" }))).toMatchObject({ action: "redirect" });
    expect(await decide(input({ cookie: await signAccessCookie("rotated-old-code") }))).toMatchObject({
      action: "redirect",
    });
  });

  describe("origin check", () => {
    const post = { method: "POST", pathname: "/api/session", code: undefined } as const;

    it("refuses cross-site fetches", async () => {
      expect(await decide(input({ ...post, fetchSite: "cross-site" }))).toEqual({ action: "forbidden" });
    });

    it("refuses a foreign Origin", async () => {
      expect(await decide(input({ ...post, origin: "https://evil.example" }))).toEqual({
        action: "forbidden",
      });
      expect(await decide(input({ ...post, origin: "null" }))).toEqual({ action: "forbidden" });
    });

    it("allows same-origin and header-less clients", async () => {
      expect(
        await decide(input({ ...post, origin: "https://app.example", fetchSite: "same-origin" })),
      ).toEqual({ action: "pass" });
      expect(await decide(input({ ...post }))).toEqual({ action: "pass" });
    });

    it("runs before the access check and skips GET and the relay", async () => {
      expect(await decide(input({ ...post, code: CODE, origin: "https://evil.example" }))).toEqual({
        action: "forbidden",
      });
      expect(await decide(input({ pathname: "/api/health", fetchSite: "cross-site" }))).toEqual({
        action: "pass",
      });
      expect(
        await decide(input({ method: "POST", pathname: "/api/relay/result", fetchSite: "cross-site" })),
      ).toEqual({ action: "pass" });
    });

    it("protects the access form too", async () => {
      expect(
        await decide(input({ method: "POST", pathname: "/api/access", origin: "https://evil.example" })),
      ).toEqual({ action: "forbidden" });
    });
  });
});

describe("safeNext", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["/?a=1", "/?a=1"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/a\\b", "/"],
    ["https://evil.example", "/"],
    ["/access", "/"],
    ["/api/session", "/"],
  ])("%s → %s", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
