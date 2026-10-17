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
import {
  BACKGROUND_LIMIT_MS,
  DISCONNECT_GRACE_MS,
  needsGrace,
  nextDelay,
  OPEN_TIMEOUT_MS,
  shouldGiveUp,
  type DropTrigger,
} from "./reconnect";

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
const ACTIVE = new Set(["live", "reconnecting"]);

export const BACKGROUND_NOTICE =
  "Session paused while the app was in the background. Tap Reconnect to continue.";

type Timer = ReturnType<typeof setTimeout>;

/**
 * Owns one conversation: microphone, peer connection, the transcript state machine, reconnects,
 * background handling and device changes. Framework-free so it can be unit tested;
 * `useVoiceSession` binds it to React and the browser events.
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
  /** True when the next start begins a new session (new 15-minute cap, new greeting). */
  private freshNext = true;
  private drop?: { firstAt: number; attempt: number; timer?: Timer };
  private graceTimer?: Timer;
  private backgroundTimer?: Timer;
  private hiddenAt?: number;

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
      this.clearTimers();
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
    if (this.freshNext) {
      this.freshNext = false;
      this.greeted = false;
      this.dispatch({ type: "local/new_session" });
    }
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
      const history = this.history();
      await this.openConnection(seq, history.length > 0 ? history : undefined);
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
      this.setMic(await this.deps.getUserMedia(MIC_CONSTRAINTS));
      return null;
    } catch (err) {
      const code = mapMediaError(err);
      return FALLBACK_TO_TEXT.has(code) ? code : "MIC_UNAVAILABLE";
    }
  }

  private setMic(stream: MediaStream): void {
    this.mic = stream;
    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => void this.onMicLost();
  }

  protected handleStartError(err: unknown): void {
    const code = err instanceof AppError ? err.code : "REALTIME_UNAVAILABLE";
    const message = err instanceof AppError && err.userMessage ? err.userMessage : MESSAGES[code];
    this.fail(code, "error", message);
  }

  /** Last finalized turns, oldest first, ≤ 40 items and ≤ 8,000 chars (oldest dropped first). */
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

  /** Mints a secret, connects, and resolves once the data channel is open (throws otherwise). */
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
      if (this.conn !== conn) return;
      const event = parseServerEvent(data);
      if (event && event.type !== "unknown") this.dispatch({ type: "server", event, now: this.now() });
    });

    await new Promise<void>((resolve, reject) => {
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) reject(new AppError("REALTIME_UNAVAILABLE", { message: "data channel did not open" }));
      }, OPEN_TIMEOUT_MS);
      conn.onStateChange((s) => {
        if (this.conn !== conn) return;
        if (!opened) {
          if (s === "open") {
            opened = true;
            clearTimeout(timer);
            this.onOpen(session.sessionMaxSeconds);
            resolve();
          } else if (s === "failed" || s === "closed") {
            clearTimeout(timer);
            reject(new AppError("REALTIME_UNAVAILABLE", { message: `connection ${s} before open` }));
          }
          return;
        }
        this.onConnectionState(s);
      });
    });
  }

  private onOpen(sessionMaxSeconds: number): void {
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
  }

  /** State changes after the channel opened. */
  protected onConnectionState(s: ConnectionState): void {
    if (s === "open") {
      clearTimeout(this.graceTimer); // ICE recovered on its own
      this.graceTimer = undefined;
    } else if (s === "disconnected") {
      this.onDrop("pc_disconnected");
    } else if (s === "failed") {
      this.onDrop("channel_closed");
    }
  }

  // ---------- US4: reconnect ----------

  onOffline(): void {
    this.onDrop("offline");
  }

  onOnline(): void {
    if (this.drop?.timer) {
      clearTimeout(this.drop.timer);
      this.drop.timer = undefined;
      void this.attemptReconnect();
    }
  }

  private onDrop(trigger: DropTrigger): void {
    if (this.state.status !== "live") return;
    if (needsGrace(trigger)) {
      this.graceTimer ??= setTimeout(() => {
        this.graceTimer = undefined;
        this.beginReconnect();
      }, DISCONNECT_GRACE_MS);
      return;
    }
    this.beginReconnect();
  }

  private beginReconnect(): void {
    if (this.state.status !== "live") return;
    clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
    this.connectSeq++;
    this.conn?.close();
    this.conn = undefined;
    this.drop = { firstAt: this.now(), attempt: 0 };
    this.dispatch({ type: "local/status", status: "reconnecting" });
    this.scheduleAttempt();
  }

  private scheduleAttempt(): void {
    if (!this.drop) return;
    this.drop.timer = setTimeout(() => void this.attemptReconnect(), nextDelay(this.drop.attempt));
  }

  private async attemptReconnect(): Promise<void> {
    const drop = this.drop;
    if (!drop) return;
    drop.timer = undefined;
    if (shouldGiveUp(drop.firstAt, this.now())) return this.giveUp("CONNECTION_LOST");
    const seq = ++this.connectSeq;
    try {
      const history = this.history();
      await this.openConnection(seq, history.length > 0 ? history : undefined);
      if (seq !== this.connectSeq) return;
      this.drop = undefined;
      this.dispatch({ type: "local/system", id: `sys-${this.now()}`, text: "Reconnected", now: this.now() });
    } catch (err) {
      if (seq !== this.connectSeq || this.drop !== drop) return;
      this.conn?.close();
      this.conn = undefined;
      if (err instanceof AppError && err.code === "DOCUMENT_NOT_FOUND")
        return this.giveUp("DOCUMENT_NOT_FOUND");
      drop.attempt += 1;
      if (shouldGiveUp(drop.firstAt, this.now())) return this.giveUp("CONNECTION_LOST");
      this.scheduleAttempt();
    }
  }

  private giveUp(code: ErrorCode): void {
    this.connectSeq++;
    this.clearTimers();
    this.teardown();
    this.fail(code, "disconnected");
  }

  // ---------- US4: background and device changes ----------

  onVisibilityChange(hidden: boolean): void {
    if (hidden) {
      if (!ACTIVE.has(this.state.status)) return;
      this.hiddenAt = this.now();
      this.backgroundTimer = setTimeout(() => this.pauseForBackground(), BACKGROUND_LIMIT_MS);
      return;
    }
    clearTimeout(this.backgroundTimer);
    this.backgroundTimer = undefined;
    const hiddenFor = this.hiddenAt === undefined ? 0 : this.now() - this.hiddenAt;
    this.hiddenAt = undefined;
    if (hiddenFor >= BACKGROUND_LIMIT_MS && ACTIVE.has(this.state.status)) this.pauseForBackground();
  }

  private pauseForBackground(): void {
    this.backgroundTimer = undefined;
    if (!ACTIVE.has(this.state.status)) return;
    this.stop();
    this.freshNext = false; // continuation: keep the 15-minute cap and history
    this.dispatch({ type: "local/status", status: "disconnected" });
    this.dispatch({ type: "local/notice", notice: BACKGROUND_NOTICE });
  }

  /** `devicechange` fires for many reasons; act only if our mic track actually ended. */
  onDeviceChange(): void {
    const track = this.mic?.getAudioTracks()[0];
    if (track && track.readyState === "ended") void this.onMicLost();
  }

  private async onMicLost(): Promise<void> {
    if (!ACTIVE.has(this.state.status) || this.state.mode !== "voice") return;
    this.dispatch({ type: "local/notice", notice: MESSAGES.MIC_LOST });
    const old = this.mic;
    try {
      const stream = await this.deps.getUserMedia(MIC_CONSTRAINTS);
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("no audio track");
      await this.conn?.replaceMicTrack(track); // no renegotiation
      for (const t of old?.getTracks() ?? []) t.stop();
      this.setMic(stream);
      this.applyMute();
      this.dispatch({ type: "local/notice", notice: undefined });
    } catch {
      await this.setMode("text");
      this.dispatch({ type: "local/notice", notice: MESSAGES.MIC_UNAVAILABLE });
    }
  }

  // ---------- controls ----------

  stop(): void {
    this.connectSeq++;
    this.clearTimers();
    if (this.conn && (this.state.responding || this.state.audioPlaying)) {
      this.conn.send({ type: "response.cancel" });
      this.conn.send({ type: "output_audio_buffer.clear" });
    }
    this.teardown();
    this.freshNext = true;
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
    for (const track of this.mic?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    this.mic = undefined;
  }

  private clearTimers(): void {
    clearTimeout(this.graceTimer);
    clearTimeout(this.drop?.timer);
    clearTimeout(this.backgroundTimer);
    this.graceTimer = undefined;
    this.backgroundTimer = undefined;
    this.drop = undefined;
  }

  protected teardown(): void {
    this.conn?.close();
    this.conn = undefined;
    this.releaseMic();
  }

  dispose(): void {
    this.connectSeq++;
    this.clearTimers();
    this.teardown();
    this.listeners.clear();
  }
}
