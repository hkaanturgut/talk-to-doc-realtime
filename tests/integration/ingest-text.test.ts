import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/text/route";
import { PreviewSchema } from "@/shared/schemas";
import { freshIp } from "../support/fixtures";

function post(body: unknown, ip = freshIp()) {
  return POST(
    new Request("http://localhost/api/ingest/text", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/ingest/text", () => {
  it("creates a text document", async () => {
    const res = await post({ text: "  Hello   transcript.  ", title: "My talk" });
    expect(res.status).toBe(200);
    const p = PreviewSchema.parse(await res.json());
    expect(p).toMatchObject({ kind: "text", title: "My talk", contextText: "Hello transcript." });
  });

  it("defaults the title", async () => {
    const p = PreviewSchema.parse(await (await post({ text: "abc" })).json());
    expect(p.title).toBe("Pasted transcript");
  });

  it("400 TEXT_EMPTY for blank text", async () => {
    const res = await post({ text: "   \n " });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("TEXT_EMPTY");
  });

  it("413 TEXT_TOO_LARGE over 400,000 chars", async () => {
    const res = await post({ text: "a".repeat(400_001) });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("TEXT_TOO_LARGE");
  });

  it("400 INVALID_REQUEST without text", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("rate limits to 20 per minute per IP", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await post({ text: "" }, ip)).status);
    expect(statuses[19]).toBe(400);
    expect(statuses[20]).toBe(429);
  });
});
