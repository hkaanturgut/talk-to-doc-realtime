import "server-only";
import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import { AppError } from "@/shared/errors";
import type { Env } from "../config/env";
import {
  requestClientSecret,
  type ClientSecret,
  type FetchFn,
  type ProviderDeps,
  type RealtimeProvider,
} from "./provider";
import type { SessionConfig } from "./session-config";

const SCOPE = "https://ai.azure.com/.default";

let credential: TokenCredential | undefined;

/** Managed Identity in Azure (AZURE_CLIENT_ID), `az login` locally. Never an API key. */
async function defaultGetToken(): Promise<string> {
  credential ??= new DefaultAzureCredential();
  try {
    const token = await credential.getToken(SCOPE);
    if (!token) throw new Error("empty token");
    return token.token;
  } catch (cause) {
    throw new AppError("REALTIME_AUTH", { message: "could not get an Entra token", cause });
  }
}

export class AzureProvider implements RealtimeProvider {
  readonly name = "azure" as const;
  readonly model: string;
  readonly transcribeModel: string;
  readonly callsUrl: string;
  private readonly base: string;
  private readonly fetchFn: FetchFn;
  private readonly getToken: () => Promise<string>;

  constructor(env: Env, deps: ProviderDeps = {}) {
    if (!env.AZURE_OPENAI_ENDPOINT)
      throw new AppError("REALTIME_AUTH", { message: "AZURE_OPENAI_ENDPOINT missing" });
    this.base = `${env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, "")}/openai/v1/realtime`;
    this.callsUrl = `${this.base}/calls`;
    this.model = env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
    this.transcribeModel = env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.getToken = deps.getToken ?? defaultGetToken;
  }

  async createClientSecret(session: SessionConfig): Promise<ClientSecret> {
    const token = await this.getToken();
    return requestClientSecret({
      url: `${this.base}/client_secrets`,
      authorization: `Bearer ${token}`,
      session,
      fetchFn: this.fetchFn,
    });
  }
}
