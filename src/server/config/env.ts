import "server-only";
import { z } from "zod";

const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const EnvSchema = z
  .object({
    REALTIME_PROVIDER: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["azure", "openai"]).default("azure"),
    ),
    AZURE_OPENAI_ENDPOINT: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
    AZURE_OPENAI_REALTIME_DEPLOYMENT: optional.default("gpt-realtime-2.1"),
    AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT: optional.default("gpt-4o-mini-transcribe"),
    OPENAI_API_KEY: optional,
    OPENAI_REALTIME_MODEL: optional.default("gpt-realtime-2.1"),
    OPENAI_TRANSCRIBE_MODEL: optional.default("gpt-4o-mini-transcribe"),
    SUPADATA_API_KEY: optional,
    APPLICATIONINSIGHTS_CONNECTION_STRING: optional,
    AZURE_OPENAI_API_KEY: optional,
  })
  .superRefine((env, ctx) => {
    if (env.AZURE_OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["AZURE_OPENAI_API_KEY"],
        message: "must not be set: this app authenticates to Azure with Entra ID only (research R2)",
      });
    }
    if (env.REALTIME_PROVIDER === "azure" && !env.AZURE_OPENAI_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["AZURE_OPENAI_ENDPOINT"],
        message: "required when REALTIME_PROVIDER=azure",
      });
    }
    if (env.REALTIME_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "required when REALTIME_PROVIDER=openai",
      });
    }
  });

export type Env = Omit<z.infer<typeof EnvSchema>, "AZURE_OPENAI_API_KEY">;

/** Validates env. Error messages name the variable and the rule, never the value. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env: Env & { AZURE_OPENAI_API_KEY?: string } = { ...parsed.data };
  delete env.AZURE_OPENAI_API_KEY;
  return env;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
