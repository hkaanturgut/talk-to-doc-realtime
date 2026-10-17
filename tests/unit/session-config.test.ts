import { describe, expect, it } from "vitest";
import { buildSessionConfig } from "@/server/realtime/session-config";

const input = { model: "gpt-realtime-2.1", transcribeModel: "gpt-4o-mini-transcribe", instructions: "x" };

describe("buildSessionConfig", () => {
  it("voice mode: semantic VAD with barge-in, near-field noise reduction, transcription, marin", () => {
    const cfg = buildSessionConfig({ ...input, mode: "voice" });
    expect(cfg).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      truncation: "auto",
      max_output_tokens: 1024,
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
    });
  });

  it("text mode: text output and no turn detection", () => {
    const cfg = buildSessionConfig({ ...input, mode: "text" });
    expect(cfg.output_modalities).toEqual(["text"]);
    expect(cfg.audio.input.turn_detection).toBeNull();
  });
});
