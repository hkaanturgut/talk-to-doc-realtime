import "server-only";
import { AppError } from "@/shared/errors";
import type { Env } from "../config/env";
import { requestClientSecret, type ClientSecret, type FetchFn, type RealtimeProvider } from "./provider";
import type { SessionConfig } from "./session-config";

const BASE = "https://api.openai.com/v1/realtime";

export class OpenAiProvider implements RealtimeProvider {
  readonly name = "openai" as const;
  readonly model: string;
  readonly transcribeModel: string;
  readonly callsUrl = `${BASE}/calls`;
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;

  constructor(env: Env, fetchFn: FetchFn = fetch) {
    if (!env.OPENAI_API_KEY) throw new AppError("REALTIME_AUTH", { message: "OPENAI_API_KEY missing" });
    this.apiKey = env.OPENAI_API_KEY;
    this.model = env.OPENAI_REALTIME_MODEL;
    this.transcribeModel = env.OPENAI_TRANSCRIBE_MODEL;
    this.fetchFn = fetchFn;
  }

  createClientSecret(session: SessionConfig): Promise<ClientSecret> {
    return requestClientSecret({
      url: `${BASE}/client_secrets`,
      authorization: `Bearer ${this.apiKey}`,
      session,
      fetchFn: this.fetchFn,
    });
  }
}
