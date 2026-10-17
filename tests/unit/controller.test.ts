import { describe, expect, it, vi } from "vitest";
import { fakeStream, fakeTrack, makeController } from "../support/controller";

describe("SessionController", () => {
  it("starts voice, goes live on open, and sends the greeting once", async () => {
    const { controller, transport } = makeController();
    const started = controller.start();
    expect(controller.getState().status).toBe("requesting_mic");
    await started;
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
    controller.toggleMute();
    expect(track.enabled).toBe(false);
    expect(controller.getState().muted).toBe(true);
    controller.toggleMute();
    expect(track.enabled).toBe(true);
  });

  it("sendText sends an input_text item plus response.create", async () => {
    const { controller, transport } = makeController({ initialMode: "text" });
    await controller.start();
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
    await controller.setMode("text");
    expect(transport.conns[0]!.closed).toBe(true);
    expect(fetchSession).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "text" }));
  });

  it("endForCap stops with SESSION_CAP", async () => {
    const { controller } = makeController();
    await controller.start();
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
