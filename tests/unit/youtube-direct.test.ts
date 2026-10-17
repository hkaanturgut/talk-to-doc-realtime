import { describe, expect, it, vi } from "vitest";
import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript-plus";
import { DirectProvider, mapDirectError } from "@/server/ingestion/youtube/providers/direct";
import { SupadataProvider } from "@/server/ingestion/youtube/providers/supadata";

const id = "dQw4w9WgXcQ";

describe("mapDirectError", () => {
  it.each([
    [new YoutubeTranscriptTooManyRequestError(), undefined, "BLOCKED"],
    [new YoutubeTranscriptNotAvailableError(id), { status: "LOGIN_REQUIRED" }, "BLOCKED"],
    [
      new YoutubeTranscriptNotAvailableError(id),
      { status: "UNPLAYABLE", reason: "Sign in to confirm you're not a bot" },
      "BLOCKED",
    ],
    [new YoutubeTranscriptNotAvailableError(id), { status: "ERROR" }, "UNAVAILABLE"],
    [new YoutubeTranscriptVideoUnavailableError(id), undefined, "UNAVAILABLE"],
    [new YoutubeTranscriptDisabledError(id), { status: "OK" }, "NO_CAPTIONS"],
    [new YoutubeTranscriptNotAvailableError(id), { status: "OK" }, "NO_CAPTIONS"],
    [new YoutubeTranscriptNotAvailableError(id), { status: "LIVE_STREAM_OFFLINE" }, "NO_CAPTIONS"],
    [new YoutubeTranscriptNotAvailableError(id), undefined, "BLOCKED"],
    [new Error("socket hang up"), undefined, "TRANSIENT"],
  ])("%o with %o → %s", (err, playability, kind) => {
    expect(mapDirectError(err, playability).kind).toBe(kind);
  });
});

describe("DirectProvider", () => {
  it("maps a LOGIN_REQUIRED player response (cloud IP) to BLOCKED without touching the network", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/player")) {
        return Response.json({
          playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" },
        });
      }
      return new Response("<html></html>", { status: 200 });
    });
    await expect(new DirectProvider(fetchFn as typeof fetch).fetch(id)).rejects.toMatchObject({
      kind: "BLOCKED",
    });
  });
});

describe("SupadataProvider", () => {
  it("parses a text transcript with the api key header on a fixed host", async () => {
    const fetchFn = vi.fn(async () => Response.json({ content: "hello world", lang: "en" }));
    const t = await new SupadataProvider("k", fetchFn).fetch(id);
    expect(t).toMatchObject({ text: "hello world", language: "en", source: "supadata" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://api.supadata.ai/")).toBe(true);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("parses segments (ms offsets) and computes duration", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        content: [
          { text: "a", offset: 0, duration: 1000 },
          { text: "b", offset: 2000, duration: 3000 },
        ],
        lang: "en",
      }),
    );
    const t = await new SupadataProvider("k", fetchFn).fetch(id);
    expect(t.text).toBe("a b");
    expect(t.durationSeconds).toBe(5);
  });

  it.each([
    [404, "UNAVAILABLE"],
    [206, "NO_CAPTIONS"],
    [500, "TRANSIENT"],
    [401, "TRANSIENT"],
  ])("maps %i → %s", async (status, kind) => {
    const fetchFn = vi.fn(async () => new Response("{}", { status }));
    await expect(new SupadataProvider("k", fetchFn).fetch(id)).rejects.toMatchObject({ kind });
  });
});
