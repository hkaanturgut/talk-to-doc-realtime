import "server-only";
import { z } from "zod";
import { AppError } from "@/shared/errors";
import type { Env } from "../config/env";
import type { SessionConfig } from "./session-config";

export const CLIENT_SECRET_TTL_SECONDS = 120;

export interface ClientSecret {
  value: string;
  expiresAt: number;
}

export interface RealtimeProvider {
  readonly name: "azure" | "openai";
  /** Model id (OpenAI) or deployment name (Azure) used in the session config. */
  readonly model: string;
  readonly transcribeModel: string;
  /** URL the browser posts its SDP offer to. */
  readonly callsUrl: string;
  createClientSecret(session: SessionConfig): Promise<ClientSecret>;
}

export type FetchFn = typeof fetch;

const ClientSecretResponse = z.object({ value: z.string().min(1), expires_at: z.number().int() });

/** Shared request + error mapping for both providers (identical GA API shape). */
export async function requestClientSecret(opts: {
  url: string;
  authorization: string;
  session: SessionConfig;
  fetchFn: FetchFn;
}): Promise<ClientSecret> {
  let res: Response;
  try {
    res = await opts.fetchFn(opts.url, {
      method: "POST",
      headers: { Authorization: opts.authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: CLIENT_SECRET_TTL_SECONDS },
        session: opts.session,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new AppError("REALTIME_UNAVAILABLE", { message: "client_secrets request failed", cause });
  }

  if (res.status === 401 || res.status === 403) {
    throw new AppError("REALTIME_AUTH", {
      message: `client_secrets returned ${res.status}: ${await safeText(res)}`,
    });
  }
  if (!res.ok) {
    const code = res.status === 429 || res.status >= 500 ? "REALTIME_UNAVAILABLE" : "REALTIME_AUTH";
    throw new AppError(code, { message: `client_secrets returned ${res.status}: ${await safeText(res)}` });
  }

  const parsed = ClientSecretResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError("REALTIME_UNAVAILABLE", { message: "client_secrets response did not match schema" });
  }
  return { value: parsed.data.value, expiresAt: parsed.data.expires_at };
}

async function safeText(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 500);
}

export interface ProviderDeps {
  fetchFn?: FetchFn;
  getToken?: () => Promise<string>;
}

export async function createProvider(env: Env, deps: ProviderDeps = {}): Promise<RealtimeProvider> {
  if (env.REALTIME_PROVIDER === "openai") {
    const { OpenAiProvider } = await import("./openai");
    return new OpenAiProvider(env, deps.fetchFn);
  }
  const { AzureProvider } = await import("./azure");
  return new AzureProvider(env, deps);
}
