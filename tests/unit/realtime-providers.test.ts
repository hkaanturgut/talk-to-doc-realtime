import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "@/server/config/env";
import { AzureProvider } from "@/server/realtime/azure";
import { OpenAiProvider } from "@/server/realtime/openai";
import { createProvider } from "@/server/realtime/provider";
import { buildSessionConfig } from "@/server/realtime/session-config";

const session = buildSessionConfig({ mode: "voice", model: "m", transcribeModel: "t", instructions: "i" });
const azureEnv = loadEnv({ AZURE_OPENAI_ENDPOINT: "https://ais-x.openai.azure.com/" });
const openAiEnv = loadEnv({ REALTIME_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" });

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("AzureProvider", () => {
  it("posts to the GA client_secrets URL with an Entra bearer token and parses the secret", async () => {
    const fetchFn = fakeFetch(200, { value: "ek_abc", expires_at: 123, session: {} });
    const provider = new AzureProvider(azureEnv, { fetchFn, getToken: async () => "entra-token" });
    await expect(provider.createClientSecret(session)).resolves.toEqual({ value: "ek_abc", expiresAt: 123 });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ais-x.openai.azure.com/openai/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer entra-token");
    const sent = JSON.parse(init.body as string);
    expect(sent.expires_after).toEqual({ anchor: "created_at", seconds: 120 });
    expect(sent.session.model).toBe("m");
    expect(provider.callsUrl).toBe("https://ais-x.openai.azure.com/openai/v1/realtime/calls");
    expect(provider.model).toBe("gpt-realtime-2.1");
  });

  it.each([
    [401, "REALTIME_AUTH"],
    [403, "REALTIME_AUTH"],
    [429, "REALTIME_UNAVAILABLE"],
    [500, "REALTIME_UNAVAILABLE"],
    [503, "REALTIME_UNAVAILABLE"],
  ])("maps upstream %i to %s", async (status, code) => {
    const provider = new AzureProvider(azureEnv, {
      fetchFn: fakeFetch(status, {}),
      getToken: async () => "t",
    });
    await expect(provider.createClientSecret(session)).rejects.toMatchObject({ code });
  });

  it("rejects a malformed upstream response", async () => {
    const provider = new AzureProvider(azureEnv, {
      fetchFn: fakeFetch(200, { nope: 1 }),
      getToken: async () => "t",
    });
    await expect(provider.createClientSecret(session)).rejects.toMatchObject({
      code: "REALTIME_UNAVAILABLE",
    });
  });

  it("maps network failures to REALTIME_UNAVAILABLE", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = new AzureProvider(azureEnv, { fetchFn, getToken: async () => "t" });
    await expect(provider.createClientSecret(session)).rejects.toMatchObject({
      code: "REALTIME_UNAVAILABLE",
    });
  });
});

describe("OpenAiProvider", () => {
  it("uses the api key server-side against api.openai.com", async () => {
    const fetchFn = fakeFetch(200, { value: "ek_o", expires_at: 9 });
    const provider = new OpenAiProvider(openAiEnv, fetchFn);
    await expect(provider.createClientSecret(session)).resolves.toEqual({ value: "ek_o", expiresAt: 9 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(provider.callsUrl).toBe("https://api.openai.com/v1/realtime/calls");
  });

  it("maps 401 to REALTIME_AUTH", async () => {
    const provider = new OpenAiProvider(openAiEnv, fakeFetch(401, {}));
    await expect(provider.createClientSecret(session)).rejects.toMatchObject({ code: "REALTIME_AUTH" });
  });
});

describe("createProvider", () => {
  it("selects by REALTIME_PROVIDER", async () => {
    expect((await createProvider(azureEnv, { getToken: async () => "t" })).name).toBe("azure");
    expect((await createProvider(openAiEnv)).name).toBe("openai");
  });
});
