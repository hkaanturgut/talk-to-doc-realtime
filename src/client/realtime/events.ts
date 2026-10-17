import { z } from "zod";

const ItemContent = z.object({
  type: z.string(),
  text: z.string().optional(),
  transcript: z.string().optional(),
});

const ItemAdded = z.object({
  type: z.enum(["conversation.item.added", "conversation.item.created"]),
  previous_item_id: z.string().nullish(),
  item: z.object({
    id: z.string(),
    type: z.string(),
    role: z.enum(["user", "assistant", "system"]).optional(),
    content: z.array(ItemContent).optional(),
  }),
});

const schemas = [
  z.object({ type: z.literal("session.created"), session: z.object({ id: z.string().optional() }).loose() }),
  ItemAdded,
  z.object({ type: z.literal("input_audio_buffer.speech_started"), item_id: z.string().optional() }),
  z.object({ type: z.literal("input_audio_buffer.speech_stopped"), item_id: z.string().optional() }),
  z.object({
    type: z.literal("conversation.item.input_audio_transcription.delta"),
    item_id: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("conversation.item.input_audio_transcription.completed"),
    item_id: z.string(),
    transcript: z.string(),
  }),
  z.object({ type: z.literal("conversation.item.input_audio_transcription.failed"), item_id: z.string() }),
  z.object({ type: z.literal("response.created"), response: z.object({ id: z.string() }).loose() }),
  z.object({
    type: z.enum(["response.output_audio_transcript.delta", "response.output_text.delta"]),
    response_id: z.string(),
    item_id: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("response.output_audio_transcript.done"),
    response_id: z.string(),
    item_id: z.string(),
    transcript: z.string().optional(),
  }),
  z.object({
    type: z.literal("response.output_text.done"),
    response_id: z.string(),
    item_id: z.string(),
    text: z.string().optional(),
  }),
  z.object({
    type: z.enum([
      "output_audio_buffer.started",
      "output_audio_buffer.stopped",
      "output_audio_buffer.cleared",
    ]),
    response_id: z.string().optional(),
  }),
  z.object({
    type: z.literal("response.done"),
    response: z
      .object({
        id: z.string(),
        status: z.string(),
        status_details: z.unknown().optional(),
        output: z.array(z.object({ id: z.string().optional() }).loose()).optional(),
      })
      .loose(),
  }),
  z.object({
    type: z.literal("error"),
    error: z.object({ type: z.string().optional(), code: z.string().nullish(), message: z.string() }).loose(),
  }),
] as const;

export const ServerEventSchema = z.discriminatedUnion("type", schemas);

export type ServerEvent = z.infer<typeof ServerEventSchema> | { type: "unknown"; raw: string };

const KNOWN = new Set<string>(
  schemas.flatMap((s) => {
    const t = s.shape.type;
    return "options" in t ? t.options : [...t.values];
  }),
);

/**
 * Parses a data-channel message. Unknown event types pass through as `{type:"unknown"}`;
 * malformed known types are logged and ignored (returns null).
 */
export function parseServerEvent(data: string): ServerEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const type = (json as { type?: unknown })?.type;
  if (typeof type !== "string" || !KNOWN.has(type)) return { type: "unknown", raw: String(type) };
  const parsed = ServerEventSchema.safeParse(json);
  if (!parsed.success) {
    console.warn("realtime: malformed event", type, parsed.error.issues[0]?.message);
    return null;
  }
  return parsed.data;
}
