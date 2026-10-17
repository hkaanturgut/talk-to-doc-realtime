import { describe, expect, it } from "vitest";
import { LatencyTracker, percentile } from "@/client/realtime/latency";

describe("percentile", () => {
  it("uses nearest rank", () => {
    const v = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
    expect(percentile(v, 50)).toBe(5);
    expect(percentile(v, 90)).toBe(9);
    expect(percentile(v, 100)).toBe(10);
    expect(percentile([42], 90)).toBe(42);
    expect(percentile([], 50)).toBeUndefined();
  });
});

describe("LatencyTracker", () => {
  it("measures reply start and interrupt stop", () => {
    const t = new LatencyTracker();
    t.record({ type: "input_audio_buffer.speech_stopped" }, 1000);
    t.record({ type: "output_audio_buffer.started" }, 1800);
    t.record({ type: "input_audio_buffer.speech_started" }, 3000);
    t.record({ type: "output_audio_buffer.cleared" }, 3250);
    expect(t.stats).toEqual({ replyStart: [800], interruptStop: [250] });
  });

  it("ignores speech_started when nothing is playing", () => {
    const t = new LatencyTracker();
    t.record({ type: "input_audio_buffer.speech_started" }, 0);
    t.record({ type: "output_audio_buffer.cleared" }, 100);
    expect(t.stats.interruptStop).toEqual([]);
  });
});
