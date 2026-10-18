import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors";

export const LEASE_IDLE_MS = 90_000;
/** 15-minute conversation cap plus clock grace (spec FR-011). */
export const LEASE_MAX_MS = 900_000 + 15_000;

interface Lease {
  startedAt: number;
  lastSeenAt: number;
}

export type HeartbeatResult = "ok" | "not_found" | "cap";

/**
 * Live voice conversations, one slot each (feature 003, research R5). In memory, per replica, like
 * the rate limits and the document store. Slots are freed on release or after 90 s of silence.
 */
export class VoiceLeases {
  private readonly leases = new Map<string, Lease>();
  /** Start times of leases that idled out or hit the cap, so a renewal can't restart the 15-minute clock. */
  private readonly retired = new Map<string, number>();
  private readonly max: () => number;
  private readonly now: () => number;

  constructor(opts: { max: () => number; now?: () => number }) {
    this.max = opts.max;
    this.now = opts.now ?? Date.now;
  }

  live(): number {
    this.sweep();
    return this.leases.size;
  }

  /** New slot, or VOICE_BUSY when the cap is reached. */
  acquire(): string {
    this.sweep();
    if (this.leases.size >= this.max()) throw new AppError("VOICE_BUSY");
    const id = randomUUID();
    const t = this.now();
    this.leases.set(id, { startedAt: t, lastSeenAt: t });
    return id;
  }

  /**
   * Token refresh or reconnect: keeps the slot. A lease that expired while idle (long network drop)
   * comes back with its original start time; an unknown id (restart) takes a new slot.
   */
  renew(id: string | undefined): string {
    this.sweep();
    if (!id) return this.acquire();
    const lease = this.leases.get(id) ?? this.revive(id);
    if (!lease) return this.acquire();
    if (this.overCap(lease)) {
      this.retire(id);
      throw new AppError("SESSION_CAP");
    }
    lease.lastSeenAt = this.now();
    return id;
  }

  heartbeat(id: string): HeartbeatResult {
    this.sweep();
    let lease = this.leases.get(id);
    if (!lease) {
      try {
        lease = this.revive(id);
      } catch {
        return "not_found"; // expired while idle and the cap is full now
      }
    }
    if (!lease) return "not_found";
    if (this.overCap(lease)) {
      this.retire(id);
      return "cap";
    }
    lease.lastSeenAt = this.now();
    return "ok";
  }

  /** Deliberate end: forget the lease entirely, so a late heartbeat can't bring it back. */
  release(id: string): void {
    this.leases.delete(id);
    this.retired.delete(id);
  }

  /** Brings back a retired lease with its original start, subject to the cap. */
  private revive(id: string): Lease | undefined {
    const startedAt = this.retired.get(id);
    if (startedAt === undefined) return undefined;
    const lease = { startedAt, lastSeenAt: this.now() };
    if (!this.overCap(lease) && this.leases.size >= this.max()) throw new AppError("VOICE_BUSY");
    this.retired.delete(id);
    this.leases.set(id, lease);
    return lease;
  }

  private retire(id: string): void {
    const lease = this.leases.get(id);
    if (!lease) return;
    this.leases.delete(id);
    this.retired.set(id, lease.startedAt);
  }

  /** Test seam. */
  clear(): void {
    this.leases.clear();
    this.retired.clear();
  }

  private overCap(lease: Lease): boolean {
    return this.now() - lease.startedAt > LEASE_MAX_MS;
  }

  private sweep(): void {
    const t = this.now();
    for (const [id, lease] of this.leases) if (t - lease.lastSeenAt > LEASE_IDLE_MS) this.retire(id);
    // after twice the cap a retired id is useless: renewing it would be refused anyway
    for (const [id, startedAt] of this.retired) if (t - startedAt > 2 * LEASE_MAX_MS) this.retired.delete(id);
  }
}

/** MAX_VOICE_SESSIONS, read on each call so a change needs no restart in tests; env.ts validates it. */
function maxVoiceSessions(): number {
  const n = Number(process.env.MAX_VOICE_SESSIONS);
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

const globalForLeases = globalThis as unknown as { voiceLeases?: VoiceLeases };
export const voiceLeases = (globalForLeases.voiceLeases ??= new VoiceLeases({ max: maxVoiceSessions }));
