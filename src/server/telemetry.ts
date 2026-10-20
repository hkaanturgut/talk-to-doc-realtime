// Loaded from src/instrumentation.ts (Node runtime only). No "server-only" import here: instrumentation
// is outside the React Server Components graph, where that guard would throw.
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const ALLOWED_KEYS = new Set([
  "route",
  "code",
  "kind",
  "mode",
  "provider",
  "sizeBytes",
  "charCount",
  "truncated",
  "usedRatio",
  "status",
  "durationMs",
  "captionSource",
  "reason",
]);

export type TelemetryProps = Record<string, string | number | boolean | undefined>;

let started = false;

export async function startTelemetry(): Promise<void> {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (started || !connectionString) return;
  started = true;
  const [{ useAzureMonitor: enableAzureMonitor }, { DefaultAzureCredential }] = await Promise.all([
    import("@azure/monitor-opentelemetry"),
    import("@azure/identity"),
  ]);
  enableAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString,
      // App Insights has local auth disabled; the UAMI (AZURE_CLIENT_ID) or `az login` is used.
      credential: new DefaultAzureCredential(),
    },
    samplingRatio: 1,
  });
}

/** Drops any key not on the allowlist, so document text, history, or tokens are never sent. */
export function sanitize(props: TelemetryProps = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (ALLOWED_KEYS.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

export function trackEvent(name: string, props?: TelemetryProps): void {
  logs.getLogger("talk-to-doc").emit({
    body: name,
    severityNumber: SeverityNumber.INFO,
    attributes: { "microsoft.custom_event.name": name, ...sanitize(props) },
  });
}

export function trackException(err: unknown, props?: TelemetryProps): void {
  const error = err instanceof Error ? err : new Error(String(err));
  logs.getLogger("talk-to-doc").emit({
    body: error.message,
    severityNumber: SeverityNumber.ERROR,
    attributes: {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack ?? "",
      ...sanitize(props),
    },
  });
  if (process.env.NODE_ENV !== "test") console.error(`[${props?.route ?? "server"}]`, error);
}
