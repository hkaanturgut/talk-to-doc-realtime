import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { emit, mockSession, stubMicrophone, uploadFixture, waitForLive, expect, test } from "./helpers";

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("source picker has no axe violations", async ({ page }) => {
      await page.goto("/");
      await axe(page);
      await page.getByRole("tab", { name: "YouTube" }).click();
      await axe(page);
      await page.getByRole("tab", { name: "Paste text" }).click();
      await axe(page);
    });

    test("preview and live conversation have no axe violations", async ({ page }) => {
      await stubMicrophone(page);
      await mockSession(page);
      await page.goto("/");
      await uploadFixture(page);
      await page.getByTestId("preview-details").locator("summary").click();
      await axe(page);
      await page.getByRole("button", { name: "Start voice chat" }).click();
      await waitForLive(page);
      await emit(page, [
        {
          type: "conversation.item.added",
          previous_item_id: null,
          item: { id: "u1", type: "message", role: "user" },
        },
        {
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "u1",
          transcript: "Question",
        },
        { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "a1", delta: "Answer" },
      ]);
      await axe(page);
    });
  });
}

test("status changes are announced politely", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expect(page.getByTestId("status-badge").locator("[aria-live=polite]")).toHaveText("Ready");
});
