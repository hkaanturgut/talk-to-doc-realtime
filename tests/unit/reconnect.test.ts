import { describe, expect, it } from "vitest";
import { needsGrace, nextDelay, shouldGiveUp } from "@/client/realtime/reconnect";

describe("reconnect policy", () => {
  it("backs off 1, 2, 4, 8, then 8 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(nextDelay)).toEqual([1000, 2000, 4000, 8000, 8000, 8000, 8000]);
  });
  it("gives up 30 s after the first drop", () => {
    expect(shouldGiveUp(0, 29_999)).toBe(false);
    expect(shouldGiveUp(0, 30_000)).toBe(true);
  });
  it("only ICE disconnected waits for the grace period", () => {
    expect(needsGrace("pc_disconnected")).toBe(true);
    expect(needsGrace("pc_failed")).toBe(false);
    expect(needsGrace("channel_closed")).toBe(false);
    expect(needsGrace("offline")).toBe(false);
  });
});
