import { expect, test } from "@playwright/test";
import { emit, mockSession, stubMicrophone, uploadFixture, waitForLive } from "./helpers";

test("mic denied: explains, switches to text, and answers a typed question", async ({ page }) => {
  // getUserMedia rejects with NotAllowedError (works the same in WebKit and Chromium).
  await stubMicrophone(page, "deny");
  const session = await mockSession(page);
  await page.goto("/");
  await uploadFixture(page);

  await page.getByRole("button", { name: "Start voice chat" }).click();
  await expect(page.getByTestId("notice")).toContainText("Microphone access was denied");
  await expect(page.getByTestId("notice")).toContainText("Settings");
  await waitForLive(page);
  await expect(page.getByTestId("status-badge")).toContainText("Live (text)");
  expect((session.bodies.at(-1) as { mode: string }).mode).toBe("text");

  await page.getByLabel("Type a question").fill("What is the national dish?");
  await page.getByRole("button", { name: "Send" }).click();

  const sent = await page.evaluate(() => window.__TEST_REALTIME__!.sent);
  const item = sent.find((e) => e.type === "conversation.item.create") as {
    item: { content: { text: string }[] };
  };
  expect(item.item.content[0]!.text).toBe("What is the national dish?");

  await emit(page, [
    {
      type: "conversation.item.added",
      previous_item_id: null,
      item: {
        id: "u1",
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "What is the national dish?" }],
      },
    },
    { type: "response.created", response: { id: "r1" } },
    { type: "response.output_text.delta", response_id: "r1", item_id: "a1", delta: "Kelp bread " },
    { type: "response.output_text.delta", response_id: "r1", item_id: "a1", delta: "with smoked eel." },
    {
      type: "response.output_text.done",
      response_id: "r1",
      item_id: "a1",
      text: "Kelp bread with smoked eel.",
    },
    { type: "response.done", response: { id: "r1", status: "completed" } },
  ]);
  await expect(page.getByTestId("entry-user")).toContainText("What is the national dish?");
  await expect(page.getByTestId("entry-assistant")).toContainText("Kelp bread with smoked eel.");
});

test("type instead: manual switch to text mode", async ({ page }) => {
  await stubMicrophone(page);
  await mockSession(page);
  await page.goto("/");
  await uploadFixture(page);
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Start text chat" }).click();
  await waitForLive(page);
  await expect(page.getByTestId("status-badge")).toContainText("Live (text)");
  await expect(page.getByLabel("Type a question")).toBeEnabled();
});
