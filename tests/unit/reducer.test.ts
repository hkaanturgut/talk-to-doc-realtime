import { describe, expect, it } from "vitest";
import { parseServerEvent, type ServerEvent } from "@/client/realtime/events";
import { initialState, reducer, transcript, type SessionState } from "@/client/realtime/reducer";

function run(events: Record<string, unknown>[], state: SessionState = initialState()): SessionState {
  return events.reduce<SessionState>((s, e) => {
    const event = parseServerEvent(JSON.stringify(e));
    if (!event) throw new Error(`unparsed ${JSON.stringify(e)}`);
    return reducer(s, { type: "server", event: event as ServerEvent, now: 1 });
  }, state);
}

const userTurn = (id: string, prev: string | null, text: string) => [
  { type: "input_audio_buffer.speech_started", item_id: id },
  { type: "input_audio_buffer.speech_stopped", item_id: id },
  { type: "conversation.item.added", previous_item_id: prev, item: { id, type: "message", role: "user" } },
  { type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: text },
];

const assistantTurn = (id: string, prev: string, resp: string, parts: string[]) => [
  { type: "response.created", response: { id: resp } },
  {
    type: "conversation.item.added",
    previous_item_id: prev,
    item: { id, type: "message", role: "assistant" },
  },
  { type: "output_audio_buffer.started", response_id: resp },
  ...parts.map((delta) => ({
    type: "response.output_audio_transcript.delta",
    response_id: resp,
    item_id: id,
    delta,
  })),
];

describe("parseServerEvent", () => {
  it("passes unknown types through", () => {
    expect(parseServerEvent(JSON.stringify({ type: "rate_limits.updated" }))).toEqual({
      type: "unknown",
      raw: "rate_limits.updated",
    });
  });
  it("ignores malformed known events and bad JSON", () => {
    expect(parseServerEvent(JSON.stringify({ type: "response.output_text.delta" }))).toBeNull();
    expect(parseServerEvent("{nope")).toBeNull();
  });
});

describe("reducer", () => {
  it("accumulates deltas and finalizes a normal exchange", () => {
    const s = run([
      ...userTurn("u1", null, "What is the capital?"),
      ...assistantTurn("a1", "u1", "r1", ["Poseid", "onia."]),
      {
        type: "response.output_audio_transcript.done",
        response_id: "r1",
        item_id: "a1",
        transcript: "Poseidonia.",
      },
      { type: "response.done", response: { id: "r1", status: "completed" } },
      { type: "output_audio_buffer.stopped", response_id: "r1" },
    ]);
    expect(transcript(s).map((e) => [e.speaker, e.text, e.status])).toEqual([
      ["user", "What is the capital?", "final"],
      ["assistant", "Poseidonia.", "final"],
    ]);
    expect(s.activity).toBe("idle");
  });

  it("orders a late user transcript before the assistant reply (previous_item_id)", () => {
    const s = run([
      {
        type: "conversation.item.added",
        previous_item_id: null,
        item: { id: "u1", type: "message", role: "user" },
      },
      ...assistantTurn("a1", "u1", "r1", ["Answer"]),
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "u1",
        transcript: "Late question",
      },
    ]);
    expect(transcript(s).map((e) => e.id)).toEqual(["u1", "a1"]);
  });

  it("inserts by previous_item_id even when items arrive out of order", () => {
    const s = run([
      {
        type: "conversation.item.added",
        previous_item_id: null,
        item: { id: "u1", type: "message", role: "user" },
      },
      {
        type: "conversation.item.added",
        previous_item_id: "u1",
        item: { id: "a1", type: "message", role: "assistant" },
      },
      {
        type: "conversation.item.added",
        previous_item_id: "u1",
        item: { id: "x", type: "message", role: "user" },
      },
    ]);
    expect(s.order).toEqual(["u1", "x", "a1"]);
  });

  it("marks the assistant entry interrupted on barge-in and keeps the partial text", () => {
    const s = run([
      ...userTurn("u1", null, "Tell me everything"),
      ...assistantTurn("a1", "u1", "r1", ["Atlantis was founded"]),
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
      { type: "output_audio_buffer.cleared", response_id: "r1" },
      { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "a1", delta: " LATE" },
      { type: "response.done", response: { id: "r1", status: "cancelled" } },
    ]);
    const a1 = s.entries.a1!;
    expect(a1.status).toBe("interrupted");
    expect(a1.text).toBe("Atlantis was founded");
    expect(s.activity).toBe("listening");
    expect(s.audioPlaying).toBe(false);
  });

  it("marks interrupted when audio is still playing after the transcript finished", () => {
    const s = run([
      ...assistantTurn("a1", "u0", "r1", ["Done text"]),
      {
        type: "response.output_audio_transcript.done",
        response_id: "r1",
        item_id: "a1",
        transcript: "Done text",
      },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
    ]);
    expect(s.entries.a1!.status).toBe("interrupted");
  });

  it("does not mark a finished, silent answer as interrupted", () => {
    const s = run([
      ...assistantTurn("a1", "u0", "r1", ["Hi"]),
      { type: "response.output_audio_transcript.done", response_id: "r1", item_id: "a1", transcript: "Hi" },
      { type: "output_audio_buffer.stopped", response_id: "r1" },
      { type: "input_audio_buffer.speech_started", item_id: "u2" },
    ]);
    expect(s.entries.a1!.status).toBe("final");
  });

  it("handles text mode output and typed user messages", () => {
    const s = run([
      {
        type: "conversation.item.added",
        previous_item_id: null,
        item: { id: "u1", type: "message", role: "user", content: [{ type: "input_text", text: "typed q" }] },
      },
      { type: "response.output_text.delta", response_id: "r1", item_id: "a1", delta: "typed " },
      { type: "response.output_text.delta", response_id: "r1", item_id: "a1", delta: "answer" },
      { type: "response.output_text.done", response_id: "r1", item_id: "a1", text: "typed answer" },
    ]);
    expect(transcript(s).map((e) => [e.speaker, e.text, e.status])).toEqual([
      ["user", "typed q", "final"],
      ["assistant", "typed answer", "final"],
    ]);
  });

  it("shows failed transcriptions and failed responses", () => {
    const s = run([
      {
        type: "conversation.item.added",
        previous_item_id: null,
        item: { id: "u1", type: "message", role: "user" },
      },
      { type: "conversation.item.input_audio_transcription.failed", item_id: "u1" },
      { type: "response.done", response: { id: "r1", status: "failed" } },
    ]);
    expect(s.entries.u1!.failed).toBe(true);
    expect(s.notice).toMatch(/could not answer/);
  });

  it("tracks status sub-states", () => {
    let s = run([{ type: "input_audio_buffer.speech_started" }]);
    expect(s.activity).toBe("listening");
    s = run([{ type: "input_audio_buffer.speech_stopped" }], s);
    expect(s.activity).toBe("thinking");
    s = run([{ type: "output_audio_buffer.started" }], s);
    expect(s.activity).toBe("assistant_speaking");
  });

  it("local/live sets the cap once and reconnects do not reset it", () => {
    let s = reducer(initialState(), { type: "local/live", now: 1000, sessionMaxSeconds: 900 });
    expect(s.capEndsAt).toBe(901_000);
    s = reducer(s, { type: "local/status", status: "reconnecting" });
    s = reducer(s, { type: "local/live", now: 50_000, sessionMaxSeconds: 900 });
    expect(s.capEndsAt).toBe(901_000);
  });

  it("adds system entries", () => {
    const s = reducer(initialState(), { type: "local/system", id: "sys1", text: "Reconnected", now: 5 });
    expect(transcript(s)).toEqual([
      { id: "sys1", speaker: "system", text: "Reconnected", status: "final", at: 5 },
    ]);
  });
});
