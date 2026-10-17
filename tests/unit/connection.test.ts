import { describe, expect, it, vi } from "vitest";
import { exchangeSdp } from "@/client/realtime/connection";

const secret = { clientSecret: "ek_old", callsUrl: "https://x.openai.azure.com/openai/v1/realtime/calls" };

describe("exchangeSdp", () => {
  it("posts the offer with the bearer secret and returns the answer", async () => {
    const fetchFn = vi.fn(async () => new Response("answer-sdp", { status: 201 }));
    const getSecret = vi.fn();
    await expect(exchangeSdp("offer", secret, getSecret, fetchFn)).resolves.toBe("answer-sdp");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(secret.callsUrl);
    expect(init.body).toBe("offer");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ek_old");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/sdp");
    expect(getSecret).not.toHaveBeenCalled();
  });

  it("on 401 mints a fresh secret once and retries (TOKEN_EXPIRED)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("answer-2", { status: 201 }));
    const getSecret = vi.fn(async () => ({ ...secret, clientSecret: "ek_new" }));
    await expect(exchangeSdp("offer", secret, getSecret, fetchFn)).resolves.toBe("answer-2");
    expect(getSecret).toHaveBeenCalledTimes(1);
    const second = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect((second[1].headers as Record<string, string>).Authorization).toBe("Bearer ek_new");
  });

  it("a second 401 surfaces REALTIME_UNAVAILABLE", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 401 }));
    const getSecret = vi.fn(async () => secret);
    await expect(exchangeSdp("offer", secret, getSecret, fetchFn)).rejects.toMatchObject({
      code: "REALTIME_UNAVAILABLE",
    });
    expect(getSecret).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("maps network errors and other statuses to REALTIME_UNAVAILABLE", async () => {
    await expect(
      exchangeSdp(
        "o",
        secret,
        vi.fn(),
        vi.fn(async () => Promise.reject(new TypeError("offline"))),
      ),
    ).rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE" });
    await expect(
      exchangeSdp(
        "o",
        secret,
        vi.fn(),
        vi.fn(async () => new Response("", { status: 500 })),
      ),
    ).rejects.toMatchObject({ code: "REALTIME_UNAVAILABLE" });
  });
});
