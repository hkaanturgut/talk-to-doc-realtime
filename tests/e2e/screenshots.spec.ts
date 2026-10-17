import { emit, expect, mockSession, stubMicrophone, test, uploadFixture, waitForLive } from "./helpers";

// Visual review only: `SCREENSHOTS=1 npx playwright test screenshots --project iphone-15`
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture docs/screenshots");

const shot = (name: string) => ({ path: `docs/screenshots/${name}.png`, fullPage: false });

for (const scheme of ["light", "dark"] as const) {
  test(`states (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await stubMicrophone(page);
    await mockSession(page);
    await page.goto("/");
    await page.screenshot(shot(`1-source-${scheme}`));
    await uploadFixture(page, "long.pdf");
    await page.screenshot(shot(`2-preview-${scheme}`));
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
        transcript: "What happens on page 3?",
      },
      { type: "response.created", response: { id: "r1" } },
      {
        type: "conversation.item.added",
        previous_item_id: "u1",
        item: { id: "a1", type: "message", role: "assistant" },
      },
      { type: "output_audio_buffer.started", response_id: "r1" },
      {
        type: "response.output_audio_transcript.delta",
        response_id: "r1",
        item_id: "a1",
        delta: "Page 3 continues the history of Atlantis with more",
      },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
      { type: "output_audio_buffer.cleared", response_id: "r1" },
    ]);
    await expect(page.getByText("interrupted")).toBeVisible();
    await page.screenshot(shot(`3-live-${scheme}`));
  });
}
