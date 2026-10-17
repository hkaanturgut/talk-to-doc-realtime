import { describe, expect, it } from "vitest";
import { loadEnv } from "@/server/config/env";

const azure = { AZURE_OPENAI_ENDPOINT: "https://ais-x.openai.azure.com" };

describe("loadEnv", () => {
  it("defaults to the azure provider and deployment names", () => {
    const env = loadEnv(azure);
    expect(env.REALTIME_PROVIDER).toBe("azure");
    expect(env.AZURE_OPENAI_REALTIME_DEPLOYMENT).toBe("gpt-realtime-2.1");
    expect(env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT).toBe("gpt-4o-mini-transcribe");
  });

  it("treats empty strings as unset", () => {
    const env = loadEnv({ ...azure, OPENAI_API_KEY: "", SUPADATA_API_KEY: "" });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SUPADATA_API_KEY).toBeUndefined();
  });

  it("requires the endpoint for azure", () => {
    expect(() => loadEnv({})).toThrow(/AZURE_OPENAI_ENDPOINT/);
  });

  it("requires the api key for openai", () => {
    expect(() => loadEnv({ REALTIME_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(loadEnv({ REALTIME_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }).REALTIME_PROVIDER).toBe(
      "openai",
    );
  });

  it("refuses to start when AZURE_OPENAI_API_KEY is set, without echoing the value", () => {
    const run = () => loadEnv({ ...azure, AZURE_OPENAI_API_KEY: "super-secret-value" });
    expect(run).toThrow(/AZURE_OPENAI_API_KEY/);
    expect(run).not.toThrow(/super-secret-value/);
  });

  it("rejects an unknown provider", () => {
    expect(() => loadEnv({ ...azure, REALTIME_PROVIDER: "other" })).toThrow(/REALTIME_PROVIDER/);
  });
});
