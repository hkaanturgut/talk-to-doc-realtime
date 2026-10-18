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
    const { controller } = makeController({ getUserMedia: vi.fn(async () => fakeStream(track)) });
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

describe("SessionController voice leases (feature 003)", () => {
  const LEASE = "11111111-1111-4111-8111-111111111111";
  const base = {
    clientSecret: "ek_1",
    expiresAt: 1,
    callsUrl: "https://x/calls",
    model: "m",
    provider: "azure" as const,
    sessionMaxSeconds: 900,
  };

  it("keeps the lease across token refreshes, heartbeats, and releases it on stop", async () => {
    vi.useFakeTimers();
    try {
      const heartbeat = vi.fn(async () => "ok" as const);
      const releaseLease = vi.fn();
      const fetchSession = vi.fn(async () => ({ ...base, leaseId: LEASE }));
      const { controller, transport } = makeController({ fetchSession, heartbeat, releaseLease });
      const started = controller.start();
      await vi.advanceTimersByTimeAsync(0);
      await started;
      expect(fetchSession).toHaveBeenLastCalledWith(expect.objectContaining({ leaseId: undefined }));

      // token refresh path uses the held lease
      const getSecret = vi.mocked(transport.connect).mock.calls[0]![0].getSecret!;
      await getSecret();
      expect(fetchSession).toHaveBeenLastCalledWith(expect.objectContaining({ leaseId: LEASE }));

      await vi.advanceTimersByTimeAsync(30_000);
      expect(heartbeat).toHaveBeenCalledWith(LEASE);

      controller.stop();
      expect(releaseLease).toHaveBeenCalledWith(LEASE);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(heartbeat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends with SESSION_CAP when the server refuses the heartbeat", async () => {
    vi.useFakeTimers();
    try {
      const releaseLease = vi.fn();
      const { controller } = makeController({
        fetchSession: vi.fn(async () => ({ ...base, leaseId: LEASE })),
        heartbeat: vi.fn(async () => "cap" as const),
        releaseLease,
      });
      const started = controller.start();
      await vi.advanceTimersByTimeAsync(0);
      await started;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(controller.getState().error?.code).toBe("SESSION_CAP");
      expect(controller.getState().status).toBe("disconnected");
      expect(releaseLease).toHaveBeenCalledWith(LEASE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to text with a notice when voice is at capacity", async () => {
    const { AppError } = await import("@/shared/errors");
    const fetchSession = vi.fn(async (req: { mode: string }) => {
      if (req.mode === "voice") throw new AppError("VOICE_BUSY");
      return base;
    });
    const track = fakeTrack();
    const { controller } = makeController({
      fetchSession,
      getUserMedia: vi.fn(async () => fakeStream(track)),
    });
    await controller.start();
    expect(controller.getState().mode).toBe("text");
    expect(controller.getState().status).toBe("live");
    expect(controller.getState().notice).toMatch(/Voice chat is at capacity/);
    expect(track.stop).toHaveBeenCalled(); // mic released
  });

  it("text mode never sends a lease", async () => {
    const fetchSession = vi.fn(async () => base);
    const { controller } = makeController({ initialMode: "text", fetchSession });
    await controller.start();
    expect(fetchSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "text", leaseId: undefined }));
  });
});

describe("SessionController lease on stop during mint (feature 003)", () => {
  it("gives the slot back when stopped while the session is being minted", async () => {
    let resolve!: (v: unknown) => void;
    const fetchSession = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const releaseLease = vi.fn();
    const { controller, transport } = makeController({
      fetchSession: fetchSession as never,
      releaseLease,
    });
    const started = controller.start();
    await vi.waitFor(() => expect(fetchSession).toHaveBeenCalled());
    controller.stop();
    resolve({
      clientSecret: "ek_1",
      expiresAt: 1,
      callsUrl: "https://x/calls",
      model: "m",
      provider: "azure",
      sessionMaxSeconds: 900,
      leaseId: "22222222-2222-4222-8222-222222222222",
    });
    await started;
    expect(releaseLease).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(transport.connect).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("idle");
  });
});
