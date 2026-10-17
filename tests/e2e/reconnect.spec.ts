import { emit, mockSession, stubMicrophone, uploadFixture, waitForLive, expect, test } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubMicrophone(page);
  await mockSession(page);
});

async function startLive(page: import("@playwright/test").Page) {
  await page.goto("/");
  await uploadFixture(page);
  await page.getByRole("button", { name: "Start voice chat" }).click();
  await waitForLive(page);
  await emit(page, [
    {
      type: "conversation.item.added",
      previous_item_id: null,
      item: {
        id: "u1",
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Before the drop" }],
      },
    },
  ]);
}

test("drop → Reconnecting → Live with the transcript intact", async ({ page }) => {
  await startLive(page);
  await page.evaluate(() => window.__TEST_REALTIME__!.setState("failed"));
  await expect(page.getByTestId("status-badge")).toContainText("Reconnecting");
  await expect(page.getByTestId("status-badge")).toContainText("Live", { timeout: 10_000 });
  await expect(page.getByTestId("system-entry")).toContainText("Reconnected");
  await expect(page.getByTestId("entry-user")).toContainText("Before the drop");
  expect(await page.evaluate(() => window.__TEST_REALTIME__!.connects)).toBe(2);
});

test("gives up after 30 s: Disconnected with a Reconnect button", async ({ page }) => {
  await page.clock.install();
  await startLive(page);
  await page.evaluate(() => {
    window.__TEST_REALTIME__!.failAll = true;
    window.__TEST_REALTIME__!.setState("failed");
  });
  await expect(page.getByTestId("status-badge")).toContainText("Reconnecting");
  await page.clock.runFor(32_000);
  await expect(page.getByTestId("status-badge")).toContainText("Disconnected");
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
  await expect(page.getByTestId("entry-user")).toContainText("Before the drop");

  await page.evaluate(() => (window.__TEST_REALTIME__!.failAll = false));
  await page.getByRole("button", { name: "Reconnect" }).click();
  await page.clock.runFor(1000);
  await waitForLive(page);
});
