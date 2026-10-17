import { AppError } from "@/shared/errors";
import type { SessionMode } from "@/shared/schemas";

export type ConnectionState = "connecting" | "open" | "disconnected" | "failed" | "closed";

export interface RealtimeConnection {
  send(event: Record<string, unknown>): void;
  onEvent(cb: (data: string) => void): () => void;
  onStateChange(cb: (state: ConnectionState) => void): () => void;
  /** Swaps the mic track without renegotiation (device change). */
  replaceMicTrack(track: MediaStreamTrack): Promise<void>;
  close(): void;
}

export interface SecretInfo {
  clientSecret: string;
  callsUrl: string;
}

export interface ConnectOptions extends SecretInfo {
  mode: SessionMode;
  micStream?: MediaStream;
  audioEl?: HTMLAudioElement | null;
  /** Mints a fresh secret when the SDP POST returns 401 (TOKEN_EXPIRED). Called at most once. */
  getSecret: () => Promise<SecretInfo>;
  fetchFn?: typeof fetch;
  createPeerConnection?: () => RTCPeerConnection;
}

export type ConnectFn = (opts: ConnectOptions) => Promise<RealtimeConnection>;

/** Posts the SDP offer; retries once with a fresh secret on 401. Returns the answer SDP. */
export async function exchangeSdp(
  offerSdp: string,
  secret: SecretInfo,
  getSecret: () => Promise<SecretInfo>,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const post = (s: SecretInfo) =>
    fetchFn(s.callsUrl, {
      method: "POST",
      body: offerSdp,
      headers: { Authorization: `Bearer ${s.clientSecret}`, "Content-Type": "application/sdp" },
    });

  let res: Response;
  try {
    res = await post(secret);
    if (res.status === 401) {
      // TOKEN_EXPIRED: the secret lapsed before use. Mint a new one and retry once.
      res = await post(await getSecret());
    }
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError("REALTIME_UNAVAILABLE", { message: "SDP exchange failed", cause });
  }
  if (!res.ok) throw new AppError("REALTIME_UNAVAILABLE", { message: `SDP exchange returned ${res.status}` });
  return res.text();
}

export const connect: ConnectFn = async (opts) => {
  if (typeof RTCPeerConnection === "undefined" && !opts.createPeerConnection) {
    throw new AppError("WEBRTC_UNSUPPORTED");
  }
  const pc = opts.createPeerConnection?.() ?? new RTCPeerConnection();
  const eventListeners = new Set<(data: string) => void>();
  const stateListeners = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = "connecting";
  let closed = false;

  const setState = (next: ConnectionState) => {
    if (state === next || (closed && next !== "closed")) return;
    state = next;
    for (const cb of stateListeners) cb(next);
  };

  pc.ontrack = (e) => {
    if (opts.audioEl && e.streams[0]) opts.audioEl.srcObject = e.streams[0];
  };

  let micSender: RTCRtpSender | undefined;
  const micTrack = opts.micStream?.getAudioTracks()[0];
  if (opts.mode === "voice" && micTrack && opts.micStream) {
    micSender = pc.addTrack(micTrack, opts.micStream);
  } else {
    // Text mode: receive-only audio so the SDP has an audio m-line without a microphone.
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (e) => {
    for (const cb of eventListeners) cb(typeof e.data === "string" ? e.data : "");
  };
  dc.onopen = () => setState("open");
  dc.onclose = () => setState(closed ? "closed" : "disconnected");

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") setState("failed");
    else if (pc.connectionState === "disconnected") setState("disconnected");
    else if (pc.connectionState === "connected" && dc.readyState === "open") setState("open");
  };

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      dc.close();
    } catch {
      /* already closed */
    }
    pc.close();
    setState("closed");
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answer = await exchangeSdp(offer.sdp ?? "", opts, opts.getSecret, opts.fetchFn);
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  } catch (err) {
    close();
    throw err;
  }

  return {
    send(event) {
      if (dc.readyState === "open") dc.send(JSON.stringify(event));
    },
    onEvent(cb) {
      eventListeners.add(cb);
      return () => eventListeners.delete(cb);
    },
    onStateChange(cb) {
      stateListeners.add(cb);
      if (state === "open") queueMicrotask(() => cb("open"));
      return () => stateListeners.delete(cb);
    },
    async replaceMicTrack(track) {
      await micSender?.replaceTrack(track);
    },
    close,
  };
};
