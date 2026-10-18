import { describe, expect, it } from "vitest";
import { VoiceLeases } from "@/server/realtime/leases";
import { AppError } from "@/shared/errors";

function setup(max = 2) {
  let t = 1_000_000;
  const leases = new VoiceLeases({ max: () => max, now: () => t });
  return { leases, advance: (ms: number) => (t += ms) };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as AppError).code;
  }
  return "none";
};

describe("VoiceLeases", () => {
  it("refuses over the cap with VOICE_BUSY and frees on release", () => {
    const { leases } = setup(2);
    const a = leases.acquire();
    leases.acquire();
    expect(code(() => leases.acquire())).toBe("VOICE_BUSY");
    expect(leases.live()).toBe(2);
    leases.release(a);
    leases.release(a); // idempotent
    expect(leases.live()).toBe(1);
    expect(leases.acquire()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("frees a slot after 90 s without a heartbeat", () => {
    const { leases, advance } = setup(1);
    const a = leases.acquire();
    advance(60_000);
    expect(leases.heartbeat(a)).toBe("ok");
    advance(89_000);
    expect(code(() => leases.acquire())).toBe("VOICE_BUSY");
    advance(2_000);
    expect(leases.live()).toBe(0);
    leases.acquire(); // the freed slot is reusable
    expect(leases.heartbeat(a)).toBe("not_found"); // and the idle one can't take it back
  });

  it("renew keeps the same slot, even at capacity", () => {
    const { leases, advance } = setup(1);
    const a = leases.acquire();
    advance(30_000);
    expect(leases.renew(a)).toBe(a);
    expect(leases.live()).toBe(1);
  });

  it("renew of an unknown lease acquires a new one (restart), subject to the cap", () => {
    const { leases } = setup(1);
    const unknown = "00000000-0000-4000-8000-000000000000";
    const b = leases.renew(unknown);
    expect(b).not.toBe(unknown);
    expect(code(() => leases.renew(unknown))).toBe("VOICE_BUSY");
  });

  it("refuses renew and heartbeat after 15 minutes and frees the slot", () => {
    const { leases, advance } = setup(1);
    const a = leases.acquire();
    for (let i = 0; i < 30; i++) {
      advance(30_000);
      expect(leases.heartbeat(a)).toBe("ok");
    } // 900 s
    advance(14_000);
    expect(leases.heartbeat(a)).toBe("ok"); // within the 15 s grace
    advance(2_000);
    expect(leases.heartbeat(a)).toBe("cap");
    expect(leases.live()).toBe(0);

    const b = leases.acquire();
    for (let i = 0; i < 61; i++) {
      advance(15_000);
      expect(leases.renew(b)).toBe(b);
    } // 915 s
    advance(1);
    expect(code(() => leases.renew(b))).toBe("SESSION_CAP");
    expect(leases.live()).toBe(0);
  });

  it("a renewal can't restart the 15-minute clock after the slot idled out or hit the cap", () => {
    const { leases, advance } = setup(2);
    const a = leases.acquire();
    advance(200_000); // idle > 90 s: slot freed
    expect(leases.live()).toBe(0);
    expect(leases.renew(a)).toBe(a); // comes back with its original start
    for (let i = 0; i < 11; i++) {
      advance(60_000);
      expect(leases.heartbeat(a)).toBe("ok");
    } // 860 s since start
    advance(60_000);
    expect(leases.heartbeat(a)).toBe("cap");
    expect(code(() => leases.renew(a))).toBe("SESSION_CAP");
    expect(leases.heartbeat(a)).toBe("cap");
    expect(leases.live()).toBe(0);
  });

  it("a released lease stays released; an idled-out one comes back only if there is room", () => {
    const { leases, advance } = setup(1);
    const a = leases.acquire();
    leases.release(a);
    expect(leases.heartbeat(a)).toBe("not_found");
    expect(leases.live()).toBe(0);

    const b = leases.acquire();
    advance(91_000); // b idles out
    const c = leases.acquire();
    expect(code(() => leases.renew(b))).toBe("VOICE_BUSY");
    leases.release(c);
    expect(leases.renew(b)).toBe(b);
  });
});
