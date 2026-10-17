import { join } from "node:path";
import {
  emit,
  FIXTURES,
  mockSession,
  stubMicrophone,
  uploadFixture,
  waitForLive,
  expect,
  test,
} from "./helpers";

test("upload a PDF, talk, interrupt, mute and stop", async ({ page }) => {
  await stubMicrophone(page);
  await mockSession(page);
  await page.goto("/");

  await uploadFixture(page);
  const preview = page.getByRole("region", { name: "Document preview" });
  await expect(preview.getByRole("heading", { name: "text" })).toBeVisible();
  await expect(preview).toContainText("3 pages");

  const details = page.getByTestId("preview-details");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toContainText("Poseidonia");

  await page.getByRole("button", { name: "Start voice chat" }).click();
  await waitForLive(page);

  // greeting was requested once the channel opened
  const sent = await page.evaluate(() => window.__TEST_REALTIME__!.sent.map((e) => e.type));
  expect(sent).toContain("response.create");

  await emit(page, [
    { type: "input_audio_buffer.speech_started", item_id: "u1" },
    { type: "input_audio_buffer.speech_stopped", item_id: "u1" },
    {
      type: "conversation.item.added",
      previous_item_id: null,
      item: { id: "u1", type: "message", role: "user" },
    },
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "What is the capital?",
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
      delta: "The capital is ",
    },
  ]);
  const transcript = page.getByTestId("transcript");
  await expect(transcript.getByTestId("entry-user")).toContainText("What is the capital?");
  await expect(transcript.getByTestId("entry-assistant")).toContainText("The capital is");
  await expect(page.getByTestId("status-badge")).toContainText("Speaking");

  // barge-in
  await emit(page, [
    { type: "input_audio_buffer.speech_started", item_id: "u2" },
    { type: "output_audio_buffer.cleared", response_id: "r1" },
    { type: "response.done", response: { id: "r1", status: "cancelled" } },
  ]);
  await expect(transcript.getByTestId("entry-assistant")).toHaveAttribute("data-status", "interrupted");
  await expect(transcript.getByText("interrupted")).toBeVisible();

  await page.getByRole("button", { name: "Mute microphone" }).click();
  await expect(page.getByTestId("status-badge")).toContainText("Muted");
  await page.getByRole("button", { name: "Unmute microphone" }).click();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("status-badge")).toContainText("Ready");
  await expect(transcript.getByTestId("entry-user")).toContainText("What is the capital?");
});

test("shows specific errors for bad PDFs", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("pdf-input").setInputFiles(join(FIXTURES, "encrypted.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: "password-protected" })).toBeVisible();
  await page.getByTestId("pdf-input").setInputFiles(join(FIXTURES, "scanned.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: "No text was found" })).toBeVisible();
});

test("shows the truncation notice for a long PDF", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page, "long.pdf");
  await expect(page.getByRole("status").filter({ hasText: "Using" })).toContainText(
    /Using \d+% of this document \(pages 1 to \d+ of 300\)/,
  );
});
