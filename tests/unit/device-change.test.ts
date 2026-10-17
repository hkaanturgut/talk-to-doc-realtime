import { describe, expect, it, vi } from "vitest";
import { fakeStream, fakeTrack, makeController } from "../support/controller";

describe("device change", () => {
  it("re-acquires the mic and swaps the track without renegotiation when the track ends", async () => {
    const first = fakeTrack();
    const second = fakeTrack();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(fakeStream(first))
      .mockResolvedValueOnce(fakeStream(second));
    const { controller, transport } = makeController({ getUserMedia });
    await controller.start();

    (first as { readyState: string }).readyState = "ended";
    controller.onDeviceChange();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    const conn = await (
      transport.connect as unknown as {
        mock: { results: { value: Promise<{ replaceMicTrack: unknown }> }[] };
      }
    ).mock.results[0]!.value;
    await vi.waitFor(() => expect(conn.replaceMicTrack).toHaveBeenCalledWith(second));
    expect(first.stop).toHaveBeenCalled();
    expect(controller.getState().status).toBe("live");
    expect(controller.getState().notice).toBeUndefined();
  });

  it("ignores devicechange while the current track is fine", async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const { controller } = makeController({ getUserMedia });
    await controller.start();
    controller.onDeviceChange();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("falls back to text mode when the mic cannot be re-acquired", async () => {
    const track = fakeTrack();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(fakeStream(track))
      .mockRejectedValue(new DOMException("gone", "NotFoundError"));
    const { controller, fetchSession } = makeController({ getUserMedia });
    await controller.start();
    (track as { readyState: string }).readyState = "ended";
    controller.onDeviceChange();
    await vi.waitFor(() => expect(controller.getState().mode).toBe("text"));
    await vi.waitFor(() => expect(controller.getState().status).toBe("live"));
    expect(fetchSession).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "text" }));
    expect(controller.getState().notice).toMatch(/No microphone/);
  });
});
