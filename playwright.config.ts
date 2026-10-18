import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
/** Second server with the access code on (feature 003); reuses the first server's build. */
const gatedPort = port + 1;
export const E2E_ACCESS_CODE = "e2e-access-code-2026";

const serverEnv = {
  NEXT_PUBLIC_E2E: "1",
  REALTIME_PROVIDER: "azure",
  AZURE_OPENAI_ENDPOINT: "https://e2e.openai.azure.com",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "iphone-15", use: { ...devices["iPhone 15"] }, testIgnore: /access\.spec\.ts/ },
    { name: "pixel-7", use: { ...devices["Pixel 7"] }, testIgnore: /access\.spec\.ts/ },
    {
      name: "access-gate",
      use: { ...devices["iPhone 15"], baseURL: `http://localhost:${gatedPort}` },
      testMatch: /access\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `npm run fixtures && npm run build && npx next start -p ${port}`,
      url: `http://localhost:${port}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: serverEnv,
    },
    {
      // waits for the first server, so the build is done before `next start`
      command: `until curl -sf http://localhost:${port}/api/health >/dev/null; do sleep 2; done; npx next start -p ${gatedPort}`,
      url: `http://localhost:${gatedPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: { ...serverEnv, ACCESS_CODE: E2E_ACCESS_CODE },
    },
  ],
});
