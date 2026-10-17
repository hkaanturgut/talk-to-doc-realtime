import { vi } from "vitest";
import type { ConnectFn, ConnectionState, RealtimeConnection } from "@/client/realtime/connection";
import { SessionController, type ControllerDeps } from "@/client/realtime/controller";
import type { SessionResponse } from "@/shared/schemas";

const session: SessionResponse = {
  clientSecret: "ek_1",
  expiresAt: 1,
  callsUrl: "https://x/calls",
  model: "m",
  provider: "azure",
  sessionMaxSeconds: 900,
};

export function fakeTransport(autoOpen = true) {
  const conns: {
    sent: Record<string, unknown>[];
    state: (s: ConnectionState) => void;
    emit: (e: object) => void;
    closed: boolean;
  }[] = [];
  const connect: ConnectFn = vi.fn(async () => {
    let stateCb: (s: ConnectionState) => void = () => undefined;
    let eventCb: (d: string) => void = () => undefined;
    const rec = {
      sent: [] as Record<string, unknown>[],
      state: (s: ConnectionState) => stateCb(s),
      emit: (e: object) => eventCb(JSON.stringify(e)),
      closed: false,
    };
    conns.push(rec);
    const conn: RealtimeConnection = {
      send: (e) => void rec.sent.push(e),
      onEvent: (cb) => {
        eventCb = cb;
        return () => undefined;
      },
      onStateChange: (cb) => {
        stateCb = cb;
        if (autoOpen) queueMicrotask(() => cb("open"));
        return () => undefined;
      },
      replaceMicTrack: vi.fn(async () => undefined),
      close: () => void (rec.closed = true),
    };
    return conn;
  });
  return { connect, conns };
}

export function fakeTrack() {
  return { enabled: true, stop: vi.fn(), readyState: "live", kind: "audio" } as unknown as MediaStreamTrack;
}

export function fakeStream(track = fakeTrack()) {
  return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

export function makeController(overrides: Partial<ControllerDeps> = {}) {
  const transport = fakeTransport();
  const fetchSession = vi.fn(async () => session);
  const controller = new SessionController({
    documentId: "00000000-0000-4000-8000-000000000000",
    title: "Doc",
    fetchSession,
    connect: transport.connect,
    getUserMedia: vi.fn(async () => fakeStream()),
    audioEl: () => null,
    mediaEnv: () => ({ isSecureContext: true, hasMediaDevices: true, hasPeerConnection: true }),
    ...overrides,
  });
  return { controller, transport, fetchSession };
}
