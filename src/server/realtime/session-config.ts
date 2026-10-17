import "server-only";
import type { SessionMode } from "@/shared/schemas";

export interface SessionConfigInput {
  mode: SessionMode;
  model: string;
  transcribeModel: string;
  instructions: string;
}

/** Realtime GA session object (contracts/realtime-events.md). */
export function buildSessionConfig({ mode, model, transcribeModel, instructions }: SessionConfigInput) {
  const base = {
    type: "realtime" as const,
    model,
    instructions,
    truncation: "auto" as const,
    max_output_tokens: 1024,
  };

  if (mode === "text") {
    return {
      ...base,
      output_modalities: ["text"],
      audio: { input: { turn_detection: null } },
    };
  }

  return {
    ...base,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: transcribeModel },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" },
    },
  };
}

export type SessionConfig = ReturnType<typeof buildSessionConfig>;
