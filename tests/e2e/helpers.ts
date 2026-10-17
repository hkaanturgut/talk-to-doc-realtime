import { join } from "node:path";
import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Each test gets its own client IP (x-forwarded-for), so the per-IP rate limits (20 ingests and
 * 10 sessions per minute) don't make parallel tests flaky. Production reads the last XFF hop,
 * which the ACA ingress appends; locally nothing appends, so this header is used as is.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const n = Math.floor(Math.random() * 2 ** 24);
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`,
    });
    await provide(page);
  },
});

export const FIXTURES = join(import.meta.dirname, "../fixtures/out");

/** Stubs getUserMedia with a silent synthetic track (no permission prompt, works in WebKit). */
export async function stubMicrophone(page: Page, mode: "grant" | "deny" = "grant"): Promise<void> {
  await page.addInitScript((m) => {
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
    md.getUserMedia = async () => {
      if (m === "deny") throw new DOMException("Permission denied", "NotAllowedError");
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createOscillator().connect(dest);
      return dest.stream;
    };
  }, mode);
}

/** Mocks /api/session so no real secret is minted in e2e. */
export async function mockSession(page: Page): Promise<{ calls: () => number; bodies: unknown[] }> {
  let calls = 0;
  const bodies: unknown[] = [];
  await page.route("**/api/session", async (route) => {
    calls += 1;
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        clientSecret: "ek_e2e",
        expiresAt: 1_900_000_000,
        callsUrl: "https://e2e.openai.azure.com/openai/v1/realtime/calls",
        model: "gpt-realtime-2.1",
        provider: "azure",
        sessionMaxSeconds: 900,
      },
    });
  });
  return { calls: () => calls, bodies };
}

export async function uploadFixture(page: Page, name = "text.pdf"): Promise<void> {
  await page.getByTestId("pdf-input").setInputFiles(join(FIXTURES, name));
  await page.getByRole("region", { name: "Document preview" }).waitFor();
}

export async function emit(page: Page, events: Record<string, unknown>[]): Promise<void> {
  await page.evaluate((evts) => {
    for (const e of evts) window.__TEST_REALTIME__!.emit(e);
  }, events);
}

export async function waitForLive(page: Page): Promise<void> {
  await page
    .getByTestId("status-badge")
    .getByText(/^(Live|Live \(text\)|Muted)$/)
    .waitFor();
}
