import "server-only";
import { getEnv } from "../config/env";
import { createProvider, type RealtimeProvider } from "./provider";

let providerPromise: Promise<RealtimeProvider> | undefined;
let override: RealtimeProvider | undefined;

export function getRealtimeProvider(): Promise<RealtimeProvider> {
  if (override) return Promise.resolve(override);
  providerPromise ??= createProvider(getEnv()).catch((err) => {
    providerPromise = undefined;
    throw err;
  });
  return providerPromise;
}

/** Test seam: route integration tests inject a fake provider. */
export function setRealtimeProviderForTests(provider: RealtimeProvider | undefined): void {
  override = provider;
}
