import { AppError, type ErrorCode } from "@/shared/errors";
import { MESSAGES } from "@/shared/messages";
import type { HistoryItem, SessionMode, SessionRequest, SessionResponse } from "@/shared/schemas";
import type { ConnectFn, ConnectionState, RealtimeConnection, SecretInfo } from "./connection";
import { parseServerEvent } from "./events";
import {
  currentMediaEnv,
  FALLBACK_TO_TEXT,
  mapMediaError,
  preflightVoice,
  type MediaEnv,
} from "./mic-errors";
import { initialState, reducer, transcript, type Action, type SessionState } from "./reducer";

export interface ControllerDeps {
  documentId: string;
  title: string;
  fetchSession: (req: SessionRequest) => Promise<SessionResponse>;
  connect: ConnectFn;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  audioEl: () => HTMLAudioElement | null;
  now?: () => number;
  initialMode?: SessionMode;
  mediaEnv?: () => MediaEnv;
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

const STARTABLE = new Set(["idle", "disconnected", "error"]);

/**
 * Owns one conversation: microphone, peer connection, and the transcript state machine.
 * Framework-free so it can be unit tested; `useVoiceSession` binds it to React.
 */
export class SessionController {
  protected state: SessionState;
  private readonly listeners = new Set<() => void>();
  protected conn?: RealtimeConnection;
  protected mic?: MediaStream;
  protected readonly deps: ControllerDeps;
  protected readonly now: () => number;
  private greeted = false;
  private connectSeq = 0;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.state = initialState(deps.initialMode ?? "voice");
  }

  getState = (): SessionState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  protected dispatch(action: Action): void {
    this.state = reducer(this.state, action);
    for (const cb of this.listeners) cb();
  }

  protected fail(code: ErrorCode, status: SessionState["status"] = "error", message = MESSAGES[code]): void {
    this.dispatch({ type: "local/error", code, message, status });
  }

  /** Switches voice ⇄ text. An active conversation is restarted in the new mode (transcript kept). */
  async setMode(mode: SessionMode): Promise<void> {
    if (mode === this.state.mode) return;
    const wasActive = !STARTABLE.has(this.state.status);
    if (wasActive) {
      this.connectSeq++;
      this.teardown();
    }
    this.dispatch({ type: "local/mode", mode });
    this.dispatch({ type: "local/status", status: "idle" });
    if (wasActive) await this.start();
  }

  /** Must be called from a tap handler (iOS requires a user gesture for the mic and audio). */
  async start(): Promise<void> {
    if (!STARTABLE.has(this.state.status)) return; // double-tap guard
    if (this.state.status !== "idle" || this.state.error) this.dispatch({ type: "local/clear_error" });
    const seq = ++this.connectSeq;
    try {
      if (this.state.mode === "voice") {
        this.dispatch({ type: "local/status", status: "requesting_mic" });
        const micError = await this.tryAcquireMic();
        if (seq !== this.connectSeq) return this.releaseMic();
        if (micError === "WEBRTC_UNSUPPORTED") {
          this.fail(micError, "error");
          return;
        }
        if (micError) {
          // US3: no microphone → same conversation in text mode, with an explanation.
          this.dispatch({ type: "local/mode", mode: "text" });
          this.dispatch({ type: "local/notice", notice: MESSAGES[micError] });
        }
      } else if (preflightVoice(this.mediaEnv()) === "WEBRTC_UNSUPPORTED") {
        this.fail("WEBRTC_UNSUPPORTED", "error");
        return;
      }
      this.dispatch({ type: "local/status", status: "connecting" });
      await this.openConnection(seq);
    } catch (err) {
      if (seq !== this.connectSeq) return;
      this.teardown();
      this.handleStartError(err);
    }
  }

  protected mediaEnv(): MediaEnv {
    return (this.deps.mediaEnv ?? currentMediaEnv)();
  }

  /** Gets the mic, or returns the error code explaining why voice is not possible. */
  protected async tryAcquireMic(): Promise<ErrorCode | null> {
    const pre = preflightVoice(this.mediaEnv());
    if (pre) return pre;
    try {
      this.mic = await this.deps.getUserMedia(MIC_CONSTRAINTS);
      return null;
    } catch (err) {
      const code = mapMediaError(err);
      return FALLBACK_TO_TEXT.has(code) ? code : "MIC_UNAVAILABLE";
    }
  }

  protected handleStartError(err: unknown): void {
    const code = err instanceof AppError ? err.code : "REALTIME_UNAVAILABLE";
    const message = err instanceof AppError && err.userMessage ? err.userMessage : MESSAGES[code];
    this.fail(code, "error", message);
  }

  protected history(): HistoryItem[] {
    const items: HistoryItem[] = [];
    let chars = 0;
    for (const entry of [...transcript(this.state)].reverse()) {
      if (entry.speaker === "system" || entry.status === "in_progress" || !entry.text.trim()) continue;
      if (items.length >= 40 || chars + entry.text.length > 8000) break;
      chars += entry.text.length;
      items.unshift({ speaker: entry.speaker, text: entry.text });
    }
    return items;
  }

  protected async openConnection(seq: number, history?: HistoryItem[]): Promise<void> {
    const request: SessionRequest = { documentId: this.deps.documentId, mode: this.state.mode, history };
    const session = await this.deps.fetchSession(request);
    const getSecret = async (): Promise<SecretInfo> => {
      const fresh = await this.deps.fetchSession(request);
      return { clientSecret: fresh.clientSecret, callsUrl: fresh.callsUrl };
    };
    const conn = await this.deps.connect({
      clientSecret: session.clientSecret,
      callsUrl: session.callsUrl,
      mode: this.state.mode,
      micStream: this.mic,
      audioEl: this.deps.audioEl(),
      getSecret,
    });
    if (seq !== this.connectSeq) {
      conn.close();
      return;
    }
    this.conn = conn;
    conn.onEvent((data) => {
      const event = parseServerEvent(data);
      if (event && event.type !== "unknown") this.dispatch({ type: "server", event, now: this.now() });
    });
    conn.onStateChange((s) => this.onConnectionState(s, session.sessionMaxSeconds));
  }

  protected onConnectionState(s: ConnectionState, sessionMaxSeconds: number): void {
    if (s === "open") {
      this.dispatch({ type: "local/live", now: this.now(), sessionMaxSeconds });
      if (this.mic) this.applyMute();
      if (!this.greeted) {
        this.greeted = true;
        this.conn?.send({
          type: "response.create",
          response: {
            instructions: `Greet the user in one short sentence and mention that you have read "${this.deps.title}". Then wait for their question.`,
          },
        });
      }
    } else if (s === "failed" || s === "disconnected") {
      this.onConnectionLost();
    }
  }

  /** US1: a lost connection ends the session. Reconnect (US4) overrides this. */
  protected onConnectionLost(): void {
    this.teardown();
    this.fail("CONNECTION_LOST", "disconnected");
  }

  stop(): void {
    this.connectSeq++;
    if (this.conn && (this.state.responding || this.state.audioPlaying)) {
      this.conn.send({ type: "response.cancel" });
      this.conn.send({ type: "output_audio_buffer.clear" });
    }
    this.teardown();
    this.dispatch({ type: "local/status", status: "idle" });
  }

  /** 15-minute cap reached (FR-030). */
  endForCap(): void {
    this.stop();
    this.fail("SESSION_CAP", "disconnected");
  }

  toggleMute(): void {
    this.dispatch({ type: "local/muted", muted: !this.state.muted });
    this.applyMute();
  }

  protected applyMute(): void {
    for (const track of this.mic?.getAudioTracks() ?? []) track.enabled = !this.state.muted;
  }

  sendText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || !this.conn || this.state.status !== "live") return false;
    this.conn.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: trimmed }] },
    });
    this.conn.send({ type: "response.create" });
    return true;
  }

  protected releaseMic(): void {
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    this.mic = undefined;
  }

  protected teardown(): void {
    this.conn?.close();
    this.conn = undefined;
    this.releaseMic();
  }

  dispose(): void {
    this.connectSeq++;
    this.teardown();
    this.listeners.clear();
  }
}
