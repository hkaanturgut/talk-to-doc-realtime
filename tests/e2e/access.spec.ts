import AxeBuilder from "@axe-core/playwright";
import { E2E_ACCESS_CODE } from "../../playwright.config";
import { expect, test } from "./helpers";

test("the app is hidden behind the access screen until the right code is entered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?debug=1");
  await expect(page).toHaveURL(/\/access\?next=%2F%3Fdebug%3D1$/);
  await expect(page.getByRole("heading", { name: "Talk to a Doc" })).toBeVisible();
  await expect(page.getByText("Choose a source")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByLabel("Access code").fill("not-the-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#access-error")).toHaveText(/That code is not right/);

  await page.getByLabel("Access code").fill(E2E_ACCESS_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/\?debug=1$/);
  await expect(page.getByRole("region", { name: "Choose a source" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Choose a source" })).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === "ttd_access");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  expect(cookie?.value).not.toContain(E2E_ACCESS_CODE);
});

test("APIs refuse callers without access; health stays public", async ({ request }) => {
  const ingest = await request.post("/api/ingest/text", { data: { text: "hello" } });
  expect(ingest.status()).toBe(401);
  expect((await ingest.json()).error.code).toBe("UNAUTHORIZED");
  const sessionRes = await request.post("/api/session", {
    data: { documentId: "00000000-0000-4000-8000-000000000000", mode: "voice" },
  });
  expect(sessionRes.status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("cross-site POSTs are refused before any work", async ({ request }) => {
  const res = await request.post("/api/access", {
    headers: { origin: "https://evil.example" },
    form: { code: E2E_ACCESS_CODE },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  expect(res.headers()["set-cookie"]).toBeUndefined();
});
