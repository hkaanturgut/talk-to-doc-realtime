import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as access } from "@/app/api/access/route";
import { POST as ingestText } from "@/app/api/ingest/text/route";
import { POST as session } from "@/app/api/session/route";
import { ACCESS_COOKIE, verifyAccessCookie } from "@/server/access/cookie";
import { freshIp } from "../support/fixtures";

const CODE = "reviewer-code-2026";

function submit(fields: Record<string, string>, ip = freshIp(), headers: Record<string, string> = {}) {
  return access(
    new Request("http://localhost/api/access", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": `1.1.1.1, ${ip}`,
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

function cookieValue(res: Response): string | undefined {
  return /ttd_access=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
}

describe("POST /api/access", () => {
  beforeEach(() => vi.stubEnv("ACCESS_CODE", CODE));
  afterEach(() => vi.unstubAllEnvs());

  it("returns 404 when the gate is off", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    expect((await submit({ code: CODE })).status).toBe(404);
  });

  it("sets a signed HttpOnly cookie and redirects to next on the right code", async () => {
    const res = await submit({ code: CODE, next: "/?debug=1" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/?debug=1");
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=604800");
    expect(header).not.toContain("Secure"); // plain http in tests
    expect(header).not.toContain(CODE);
    expect(await verifyAccessCookie(cookieValue(res), CODE)).toBe(true);
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    const res = await submit({ code: CODE }, freshIp(), { "x-forwarded-proto": "https" });
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("accepts JSON and trims whitespace", async () => {
    const res = await access(
      new Request("http://localhost/api/access", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `1.1.1.1, ${freshIp()}` },
        body: JSON.stringify({ code: `  ${CODE} ` }),
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(cookieValue(res)).toBeDefined();
  });

  it.each(["", "wrong", CODE.slice(0, -1), `${CODE}x`])("rejects %j without a cookie", async (code) => {
    const res = await submit({ code, next: "/" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/access?error=code&next=%2F");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("ignores an off-site next", async () => {
    const res = await submit({ code: CODE, next: "//evil.example/x" });
    expect(res.headers.get("location")).toBe("/");
  });

  it("rate limits after 5 attempts per IP, even with the right code", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await submit({ code: "wrong" }, ip);
    const res = await submit({ code: CODE }, ip);
    expect(res.headers.get("location")).toContain("error=rate");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("route-level access checks (defense in depth)", () => {
  beforeEach(() => vi.stubEnv("ACCESS_CODE", CODE));
  afterEach(() => vi.unstubAllEnvs());

  const json = (url: string, body: unknown, cookie?: string) =>
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `1.1.1.1, ${freshIp()}`,
        ...(cookie ? { cookie: `other=1; ${ACCESS_COOKIE}=${cookie}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it("refuses ingest and session without a cookie", async () => {
    const a = await ingestText(json("http://localhost/api/ingest/text", { text: "hello world" }));
    expect(a.status).toBe(401);
    expect((await a.json()).error.code).toBe("UNAUTHORIZED");
    const b = await session(
      json("http://localhost/api/session", {
        documentId: "00000000-0000-4000-8000-000000000000",
        mode: "text",
      }),
    );
    expect(b.status).toBe(401);
  });

  it("accepts ingest with a valid cookie", async () => {
    const granted = cookieValue(await submit({ code: CODE }));
    const res = await ingestText(json("http://localhost/api/ingest/text", { text: "hello world" }, granted));
    expect(res.status).toBe(200);
  });
});
