import type { ErrorCode } from "@/shared/errors";
import type { SessionMode } from "@/shared/schemas";
import type { ServerEvent } from "./events";

export type SessionStatus =
  "idle" | "requesting_mic" | "connecting" | "live" | "reconnecting" | "disconnected" | "error";
export type Activity = "idle" | "listening" | "thinking" | "assistant_speaking";

export interface TranscriptEntry {
  id: string;
  speaker: "user" | "assistant" | "system";
  text: string;
  status: "in_progress" | "final" | "interrupted";
  at: number;
  failed?: boolean;
}

export interface SessionState {
  mode: SessionMode;
  status: SessionStatus;
  activity: Activity;
  muted: boolean;
  startedAt?: number;
  capEndsAt?: number;
  error?: { code: ErrorCode; message: string };
  notice?: string;
  /** Conversation order of entry ids (from previous_item_id), so late user transcripts sort correctly. */
  order: string[];
  entries: Record<string, TranscriptEntry>;
  /** Assistant item currently being produced or played. */
  assistantItemId?: string;
  audioPlaying: boolean;
  responding: boolean;
}

export const initialState = (mode: SessionMode = "voice"): SessionState => ({
  mode,
  status: "idle",
  activity: "idle",
  muted: false,
  order: [],
  entries: {},
  audioPlaying: false,
  responding: false,
});

export type LocalAction =
  | { type: "local/status"; status: SessionStatus }
  | { type: "local/live"; now: number; sessionMaxSeconds: number }
  | { type: "local/mode"; mode: SessionMode }
  | { type: "local/muted"; muted: boolean }
  | { type: "local/error"; code: ErrorCode; message: string; status?: SessionStatus }
  | { type: "local/notice"; notice?: string }
  | { type: "local/system"; id: string; text: string; now: number }
  | { type: "local/clear_error" }
  | { type: "local/reset_transcript" }
  | { type: "local/new_session" };

export type Action = LocalAction | { type: "server"; event: ServerEvent; now: number };

function insertAfter(order: string[], id: string, previous?: string | null): string[] {
  if (order.includes(id)) return order;
  if (previous) {
    const idx = order.indexOf(previous);
    if (idx >= 0) return [...order.slice(0, idx + 1), id, ...order.slice(idx + 1)];
  }
  return [...order, id];
}

function upsert(
  state: SessionState,
  id: string,
  speaker: TranscriptEntry["speaker"],
  now: number,
  update: (e: TranscriptEntry) => TranscriptEntry,
): SessionState {
  const existing = state.entries[id] ?? { id, speaker, text: "", status: "in_progress" as const, at: now };
  return {
    ...state,
    order: insertAfter(state.order, id),
    entries: { ...state.entries, [id]: update(existing) },
  };
}

function markInterrupted(state: SessionState): SessionState {
  const id = state.assistantItemId;
  const entry = id ? state.entries[id] : undefined;
  if (!id || !entry || entry.status === "interrupted") return state;
  if (entry.status !== "in_progress" && !state.audioPlaying) return state;
  return { ...state, entries: { ...state.entries, [id]: { ...entry, status: "interrupted" } } };
}

function reduceServer(state: SessionState, event: ServerEvent, now: number): SessionState {
  switch (event.type) {
    case "conversation.item.added":
    case "conversation.item.created": {
      const { item } = event;
      if (item.type !== "message" || !item.role || item.role === "system") return state;
      const typed = item.content?.find((c) => c.type === "input_text")?.text;
      const order = insertAfter(state.order, item.id, event.previous_item_id);
      const existing = state.entries[item.id];
      const entry: TranscriptEntry = existing ?? {
        id: item.id,
        speaker: item.role,
        text: typed ?? "",
        status: typed !== undefined ? "final" : "in_progress",
        at: now,
      };
      return {
        ...state,
        order,
        entries: { ...state.entries, [item.id]: entry },
        assistantItemId: item.role === "assistant" ? item.id : state.assistantItemId,
      };
    }
    case "input_audio_buffer.speech_started":
      return { ...markInterrupted(state), activity: "listening" };
    case "input_audio_buffer.speech_stopped":
      return { ...state, activity: "thinking" };
    case "conversation.item.input_audio_transcription.delta":
      return upsert(state, event.item_id, "user", now, (e) => ({ ...e, text: e.text + event.delta }));
    case "conversation.item.input_audio_transcription.completed":
      return upsert(state, event.item_id, "user", now, (e) => ({
        ...e,
        text: event.transcript.trim() || e.text,
        status: "final",
      }));
    case "conversation.item.input_audio_transcription.failed":
      return upsert(state, event.item_id, "user", now, (e) => ({ ...e, status: "final", failed: true }));
    case "response.created":
      return {
        ...state,
        responding: true,
        activity: state.activity === "listening" ? "listening" : "thinking",
      };
    case "response.output_audio_transcript.delta":
    case "response.output_text.delta": {
      const next = upsert(state, event.item_id, "assistant", now, (e) =>
        e.status === "interrupted" ? e : { ...e, text: e.text + event.delta },
      );
      return { ...next, assistantItemId: event.item_id };
    }
    case "response.output_audio_transcript.done":
    case "response.output_text.done": {
      const final = event.type === "response.output_audio_transcript.done" ? event.transcript : event.text;
      return upsert(state, event.item_id, "assistant", now, (e) =>
        e.status === "interrupted" ? e : { ...e, text: final ?? e.text, status: "final" },
      );
    }
    case "output_audio_buffer.started":
      return { ...state, audioPlaying: true, activity: "assistant_speaking" };
    case "output_audio_buffer.stopped":
      return {
        ...state,
        audioPlaying: false,
        activity: state.activity === "listening" ? "listening" : "idle",
      };
    case "output_audio_buffer.cleared":
      return { ...markInterrupted(state), audioPlaying: false };
    case "response.done": {
      const { status } = event.response;
      let next: SessionState = { ...state, responding: false };
      if (!state.audioPlaying && next.activity === "thinking") next.activity = "idle";
      const id = state.assistantItemId;
      const entry = id ? next.entries[id] : undefined;
      if (status === "cancelled" && id && entry && entry.status === "in_progress") {
        next = { ...next, entries: { ...next.entries, [id]: { ...entry, status: "interrupted" } } };
      } else if (status === "failed") {
        next = { ...next, notice: "The assistant could not answer that. Try asking again." };
      } else if (status === "completed" && id && entry && entry.status === "in_progress") {
        next = { ...next, entries: { ...next.entries, [id]: { ...entry, status: "final" } } };
      }
      return next;
    }
    case "error":
      return { ...state, notice: event.error.message };
    default:
      return state;
  }
}

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "server":
      return reduceServer(state, action.event, action.now);
    case "local/status":
      return {
        ...state,
        status: action.status,
        activity: action.status === "live" ? state.activity : "idle",
        ...(action.status === "idle" ? { audioPlaying: false, responding: false } : {}),
      };
    case "local/live":
      return {
        ...state,
        status: "live",
        error: undefined,
        startedAt: state.startedAt ?? action.now,
        capEndsAt: state.capEndsAt ?? action.now + action.sessionMaxSeconds * 1000,
      };
    case "local/mode":
      return { ...state, mode: action.mode };
    case "local/muted":
      return { ...state, muted: action.muted };
    case "local/error":
      return {
        ...state,
        error: { code: action.code, message: action.message },
        status: action.status ?? state.status,
      };
    case "local/clear_error":
      return { ...state, error: undefined, notice: undefined };
    case "local/notice":
      return { ...state, notice: action.notice };
    case "local/system":
      return {
        ...state,
        order: [...state.order, action.id],
        entries: {
          ...state.entries,
          [action.id]: {
            id: action.id,
            speaker: "system",
            text: action.text,
            status: "final",
            at: action.now,
          },
        },
      };
    case "local/reset_transcript":
      return { ...initialState(state.mode) };
    case "local/new_session":
      return { ...state, startedAt: undefined, capEndsAt: undefined };
  }
}

export function transcript(state: SessionState): TranscriptEntry[] {
  return state.order.map((id) => state.entries[id]).filter((e): e is TranscriptEntry => e !== undefined);
}
