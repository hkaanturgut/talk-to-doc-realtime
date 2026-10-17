import { describe, expect, it, vi } from "vitest";
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

export function fakeTransport() {
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
        return () => undefined;
      },
      replaceMicTrack: vi.fn(async () => undefined),
      close: () => void (rec.closed = true),
    };
    return conn;
  });
  return { connect, conns };
}

function fakeTrack() {
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

describe("SessionController", () => {
  it("starts voice, goes live on open, and sends the greeting once", async () => {
    const { controller, transport } = makeController();
    await controller.start();
    expect(controller.getState().status).toBe("connecting");
    transport.conns[0]!.state("open");
    expect(controller.getState().status).toBe("live");
    expect(transport.conns[0]!.sent.filter((e) => e.type === "response.create")).toHaveLength(1);
  });

  it("ignores a double start", async () => {
    const { controller, fetchSession } = makeController();
    await Promise.all([controller.start(), controller.start()]);
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("mic denied → text mode with the explanation", async () => {
    const { controller, fetchSession } = makeController({
      getUserMedia: vi.fn(async () => Promise.reject(new DOMException("no", "NotAllowedError"))),
    });
    await controller.start();
    expect(controller.getState().mode).toBe("text");
    expect(controller.getState().notice).toMatch(/Microphone access was denied/);
    expect(fetchSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "text" }));
  });

  it("insecure context → MIC_UNAVAILABLE text fallback; no WebRTC → error", async () => {
    const a = makeController({
      mediaEnv: () => ({ isSecureContext: false, hasMediaDevices: false, hasPeerConnection: true }),
    });
    await a.controller.start();
    expect(a.controller.getState().mode).toBe("text");
    expect(a.controller.getState().notice).toMatch(/No microphone/);

    const b = makeController({
      mediaEnv: () => ({ isSecureContext: true, hasMediaDevices: true, hasPeerConnection: false }),
    });
    await b.controller.start();
    expect(b.controller.getState().error?.code).toBe("WEBRTC_UNSUPPORTED");
    expect(b.fetchSession).not.toHaveBeenCalled();
  });

  it("stop cancels an in-flight response and releases the mic", async () => {
    const track = fakeTrack();
    const { controller, transport } = makeController({ getUserMedia: vi.fn(async () => fakeStream(track)) });
    await controller.start();
    const conn = transport.conns[0]!;
    conn.state("open");
    conn.emit({ type: "response.created", response: { id: "r1" } });
    controller.stop();
    expect(conn.sent.map((e) => e.type)).toEqual(
      expect.arrayContaining(["response.cancel", "output_audio_buffer.clear"]),
    );
    expect(conn.closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(controller.getState().status).toBe("idle");
  });

  it("mute flips track.enabled", async () => {
    const track = fakeTrack();
    const { controller, transport } = makeController({ getUserMedia: vi.fn(async () => fakeStream(track)) });
    await controller.start();
    transport.conns[0]!.state("open");
    controller.toggleMute();
    expect(track.enabled).toBe(false);
    expect(controller.getState().muted).toBe(true);
    controller.toggleMute();
    expect(track.enabled).toBe(true);
  });

  it("sendText sends an input_text item plus response.create", async () => {
    const { controller, transport } = makeController({ initialMode: "text" });
    await controller.start();
    transport.conns[0]!.state("open");
    expect(controller.sendText("  hello  ")).toBe(true);
    const sent = transport.conns[0]!.sent.slice(-2);
    expect(sent[0]).toMatchObject({
      type: "conversation.item.create",
      item: { role: "user", content: [{ type: "input_text", text: "hello" }] },
    });
    expect(sent[1]).toEqual({ type: "response.create" });
    expect(controller.sendText("   ")).toBe(false);
  });

  it("switching mode while live restarts the session in the new mode", async () => {
    const { controller, transport, fetchSession } = makeController();
    await controller.start();
    transport.conns[0]!.state("open");
    await controller.setMode("text");
    expect(transport.conns[0]!.closed).toBe(true);
    expect(fetchSession).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "text" }));
  });

  it("endForCap stops with SESSION_CAP", async () => {
    const { controller, transport } = makeController();
    await controller.start();
    transport.conns[0]!.state("open");
    controller.endForCap();
    expect(controller.getState().status).toBe("disconnected");
    expect(controller.getState().error?.code).toBe("SESSION_CAP");
  });

  it("maps session errors (e.g. expired document)", async () => {
    const { AppError } = await import("@/shared/errors");
    const { controller } = makeController({
      fetchSession: vi.fn(async () => Promise.reject(new AppError("DOCUMENT_NOT_FOUND"))),
    });
    await controller.start();
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error?.code).toBe("DOCUMENT_NOT_FOUND");
  });
});
