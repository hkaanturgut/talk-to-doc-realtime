import "server-only";
import { AppError, type ErrorCode } from "@/shared/errors";
import { DirectProvider } from "./providers/direct";
import { RelayProvider } from "./providers/relay";
import { SupadataProvider } from "./providers/supadata";
import { relayQueue, relaySecret } from "./relay";
import { TranscriptError, type Transcript, type TranscriptErrorKind, type TranscriptProvider } from "./types";

export { parseYouTubeUrl, canonicalUrl } from "./url";
export { fetchMetadata } from "./metadata";

const CODE: Record<Exclude<TranscriptErrorKind, "TRANSIENT">, ErrorCode> = {
  NO_CAPTIONS: "YOUTUBE_NO_CAPTIONS",
  UNAVAILABLE: "YOUTUBE_UNAVAILABLE",
  BLOCKED: "YOUTUBE_BLOCKED",
};

/**
 * Tries providers in order. Definitive answers (no captions, unavailable) stop the chain; blocked or
 * transient failures move on. If everything fails, the UI offers the paste-transcript fallback.
 */
export async function fetchTranscriptChain(
  videoId: string,
  providers: TranscriptProvider[],
): Promise<Transcript> {
  let lastKind: TranscriptErrorKind = "BLOCKED";
  for (const provider of providers) {
    try {
      return await provider.fetch(videoId);
    } catch (err) {
      const kind = err instanceof TranscriptError ? err.kind : "TRANSIENT";
      if (kind === "NO_CAPTIONS" || kind === "UNAVAILABLE") throw new AppError(CODE[kind], { cause: err });
      lastKind = kind;
      console.warn(`youtube: provider ${provider.name} failed (${kind})`);
    }
  }
  throw new AppError(lastKind === "TRANSIENT" ? "YOUTUBE_BLOCKED" : CODE[lastKind]);
}

export function defaultProviders(
  env: Record<string, string | undefined> = process.env,
): TranscriptProvider[] {
  const providers: TranscriptProvider[] = [new DirectProvider()];
  if (relaySecret(env)) providers.push(new RelayProvider(relayQueue));
  if (env.SUPADATA_API_KEY) providers.push(new SupadataProvider(env.SUPADATA_API_KEY));
  return providers;
}

let override: TranscriptProvider[] | undefined;
export function getTranscriptProviders(): TranscriptProvider[] {
  return override ?? defaultProviders();
}
export function setTranscriptProvidersForTests(providers: TranscriptProvider[] | undefined): void {
  override = providers;
}
