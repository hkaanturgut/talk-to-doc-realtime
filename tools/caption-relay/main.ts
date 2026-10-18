import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { DirectProvider } from "../../src/server/ingestion/youtube/providers/direct";
import { runWorker } from "./worker";

/**
 * Caption relay CLI (specs/002-caption-relay/quickstart.md). Outbound only: polls the app, never
 * listens. The secret comes from Key Vault through the owner's own `az login`, held in memory only.
 *
 *   npm run relay -- --app https://<app-fqdn> --vault <key-vault> [--subscription <id>]
 */
const { values } = parseArgs({
  options: {
    app: { type: "string", default: process.env.RELAY_APP_URL },
    vault: { type: "string", default: process.env.RELAY_KEY_VAULT },
    subscription: { type: "string", default: process.env.AZURE_SUBSCRIPTION_ID },
  },
});

async function readSecret(): Promise<string> {
  if (process.env.CAPTION_RELAY_SECRET) return process.env.CAPTION_RELAY_SECRET;
  if (!values.vault) throw new Error("pass --vault <key-vault-name> (or set RELAY_KEY_VAULT)");
  const args = ["keyvault", "secret", "show", "--vault-name", values.vault, "--name", "caption-relay-secret"];
  if (values.subscription) args.push("--subscription", values.subscription);
  const { stdout } = await promisify(execFile)("az", [...args, "--query", "value", "-o", "tsv"]);
  const secret = stdout.trim();
  if (secret.length < 32) throw new Error("caption-relay-secret is missing or shorter than 32 characters");
  return secret;
}

async function main(): Promise<void> {
  const app = values.app?.replace(/\/+$/, "");
  if (!app?.startsWith("https://") && !app?.startsWith("http://localhost")) {
    throw new Error("pass --app https://<app-fqdn> (or set RELAY_APP_URL)");
  }
  const secret = await readSecret();
  const controller = new AbortController();
  process.once("SIGINT", () => {
    console.log("relay: stopping after the current poll");
    controller.abort();
    setTimeout(() => process.exit(0), 1000).unref();
  });
  console.log(`relay: polling ${app} (outbound only, Ctrl+C to stop)`);
  await runWorker({ appUrl: app, secret, provider: new DirectProvider() }, controller.signal);
}

main().catch((err: unknown) => {
  console.error(`relay: ${(err as Error).message}`);
  process.exit(1);
});
