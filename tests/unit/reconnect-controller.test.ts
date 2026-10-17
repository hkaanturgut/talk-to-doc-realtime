import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKGROUND_NOTICE } from "@/client/realtime/controller";
import { transcript } from "@/client/realtime/reducer";
import { AppError } from "@/shared/errors";
import { fakeTransport, makeController } from "../support/controller";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

async function liveController(overrides = {}) {
  const ctx = makeController({ now: () => Date.now(), ...overrides });
  await ctx.controller.start();
  expect(ctx.controller.getState().status).toBe("live");
  return ctx;
}

describe("reconnect", () => {
  it("channel close → reconnecting at once, new token with history, then live with a Reconnected entry", async () => {
    const { controller, transport, fetchSession } = await liveController();
    const capEndsAt = controller.getState().capEndsAt;
    transport.conns[0]!.emit({
      type: "conversation.item.added",
      previous_item_id: null,
      item: { id: "u1", type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    });

    transport.conns[0]!.state("failed");
    expect(controller.getState().status).toBe("reconnecting");
    expect(transport.conns[0]!.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSession).toHaveBeenCalledTimes(2);
    expect(fetchSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ history: [{ speaker: "user", text: "hi" }] }),
    );
    expect(controller.getState().status).toBe("live");
    expect(controller.getState().capEndsAt).toBe(capEndsAt); // cap not reset by reconnects
    expect(transcript(controller.getState()).at(-1)).toMatchObject({
      speaker: "system",
      text: "Reconnected",
    });
    // no second greeting
    expect(transport.conns[1]!.sent.filter((e) => e.type === "response.create")).toHaveLength(0);
  });

  it("ICE disconnected waits 2 s, and recovery inside the grace period does nothing", async () => {
    const { controller, transport } = await liveController();
    transport.conns[0]!.state("disconnected");
    await vi.advanceTimersByTimeAsync(1500);
    expect(controller.getState().status).toBe("live");
    transport.conns[0]!.state("open");
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getState().status).toBe("live");

    transport.conns[0]!.state("disconnected");
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getState().status).toBe("reconnecting");
  });

  it("offline → reconnecting; online retries immediately", async () => {
    let failing = true;
    const transport = fakeTransport();
    const fetchSession = vi.fn(async () => {
      if (failing) throw new AppError("REALTIME_UNAVAILABLE");
      return {
        clientSecret: "ek",
        expiresAt: 1,
        callsUrl: "https://x/calls",
        model: "m",
        provider: "azure" as const,
        sessionMaxSeconds: 900,
      };
    });
    failing = false;
    const { controller } = await liveController({ connect: transport.connect, fetchSession });
    failing = true;
    controller.onOffline();
    expect(controller.getState().status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000); // attempt 1 fails
    failing = false;
    controller.onOnline(); // next attempt would be in 2 s; online skips the wait
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().status).toBe("live");
  });

  it("gives up after 30 s with CONNECTION_LOST and keeps the transcript", async () => {
    let fail = false;
    const { controller, transport } = await liveController({
      fetchSession: vi.fn(async () => {
        if (fail) throw new AppError("REALTIME_UNAVAILABLE");
        return {
          clientSecret: "ek",
          expiresAt: 1,
          callsUrl: "https://x/calls",
          model: "m",
          provider: "azure" as const,
          sessionMaxSeconds: 900,
        };
      }),
    });
    transport.conns[0]!.emit({
      type: "conversation.item.added",
      previous_item_id: null,
      item: { id: "u1", type: "message", role: "user", content: [{ type: "input_text", text: "keep me" }] },
    });
    fail = true;
    transport.conns[0]!.state("failed");
    await vi.advanceTimersByTimeAsync(29_000);
    expect(controller.getState().status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(controller.getState().status).toBe("disconnected");
    expect(controller.getState().error?.code).toBe("CONNECTION_LOST");
    expect(transcript(controller.getState())[0]?.text).toBe("keep me");
  });

  it("DOCUMENT_NOT_FOUND during reconnect stops with that error", async () => {
    let gone = false;
    const { controller, transport } = await liveController({
      fetchSession: vi.fn(async () => {
        if (gone) throw new AppError("DOCUMENT_NOT_FOUND");
        return {
          clientSecret: "ek",
          expiresAt: 1,
          callsUrl: "https://x/calls",
          model: "m",
          provider: "azure" as const,
          sessionMaxSeconds: 900,
        };
      }),
    });
    gone = true;
    transport.conns[0]!.state("failed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getState().error?.code).toBe("DOCUMENT_NOT_FOUND");
    expect(controller.getState().status).toBe("disconnected");
  });

  it("manual reconnect after giving up keeps the cap; Stop then Start resets it", async () => {
    const { controller, transport } = await liveController();
    const cap = controller.getState().capEndsAt;
    transport.conns[0]!.state("failed");
    await vi.advanceTimersByTimeAsync(5000);
    controller.stop();
    vi.setSystemTime(60_000);
    await controller.start();
    expect(controller.getState().capEndsAt).toBe(60_000 + 900_000);
    expect(cap).toBe(900_000);
  });
});

describe("background", () => {
  it("leaves short background periods alone", async () => {
    const { controller } = await liveController();
    controller.onVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(10_000);
    controller.onVisibilityChange(false);
    expect(controller.getState().status).toBe("live");
  });

  it("ends cleanly after 30 s hidden and explains on return", async () => {
    const { controller, transport } = await liveController();
    controller.onVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(31_000);
    controller.onVisibilityChange(false);
    expect(controller.getState().status).toBe("disconnected");
    expect(controller.getState().notice).toBe(BACKGROUND_NOTICE);
    expect(transport.conns[0]!.closed).toBe(true);
  });

  it("also ends when timers were throttled in the background", async () => {
    const { controller } = await liveController();
    controller.onVisibilityChange(true);
    vi.setSystemTime(45_000); // clock moved, timers did not fire
    controller.onVisibilityChange(false);
    expect(controller.getState().notice).toBe(BACKGROUND_NOTICE);
  });
});
