import "server-only";
import { randomUUID } from "node:crypto";
import type { RelayJob, RelayResult, RelayTranscript } from "@/shared/schemas";
import type { TranscriptErrorKind } from "../types";

export type RelayOutcome =
  { ok: true; transcript: RelayTranscript } | { ok: false; kind: TranscriptErrorKind };

interface Job {
  id: string;
  videoId: string;
  leased: boolean;
  waiters: ((outcome: RelayOutcome) => void)[];
  timer: ReturnType<typeof setTimeout>;
}

interface Poller {
  resolve: (job: RelayJob | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RelayQueueOptions {
  /** How long a viewer request waits for the relay (spec FR-002). */
  jobTtlMs?: number;
  /** Max jobs in flight (FR-010). */
  maxJobs?: number;
  /** A relay counts as online this long after its last poll ended (FR-001). */
  presenceMs?: number;
}

/**
 * In-memory job queue between YouTube ingest (producer) and the outbound-only caption relay
 * (consumer, long polling). One process = one queue: the relay serves the replica it polls.
 */
export class RelayQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly byVideo = new Map<string, Job>();
  private readonly pollers: Poller[] = [];
  private lastSeenAt: number | undefined;
  private readonly jobTtlMs: number;
  private readonly maxJobs: number;
  private readonly presenceMs: number;

  constructor(opts: RelayQueueOptions = {}) {
    this.jobTtlMs = opts.jobTtlMs ?? 15_000;
    this.maxJobs = opts.maxJobs ?? 20;
    this.presenceMs = opts.presenceMs ?? 30_000;
  }

  online(): boolean {
    if (this.pollers.length > 0) return true;
    return this.lastSeenAt !== undefined && Date.now() - this.lastSeenAt <= this.presenceMs;
  }

  lastSeenSeconds(): number | null {
    if (this.pollers.length > 0) return 0;
    return this.lastSeenAt === undefined ? null : Math.floor((Date.now() - this.lastSeenAt) / 1000);
  }

  /** Queues (or joins) a job for `videoId`; resolves with the relay outcome or TRANSIENT on expiry. */
  request(videoId: string): Promise<RelayOutcome> {
    const existing = this.byVideo.get(videoId);
    if (existing) return new Promise((resolve) => existing.waiters.push(resolve));
    if (this.jobs.size >= this.maxJobs) return Promise.resolve({ ok: false, kind: "BLOCKED" });

    const job: Job = {
      id: randomUUID(),
      videoId,
      leased: false,
      waiters: [],
      timer: setTimeout(() => this.finish(job, { ok: false, kind: "TRANSIENT" }), this.jobTtlMs),
    };
    job.timer.unref?.();
    const outcome = new Promise<RelayOutcome>((resolve) => job.waiters.push(resolve));
    this.jobs.set(job.id, job);
    this.byVideo.set(videoId, job);

    const poller = this.pollers.shift();
    if (poller) {
      clearTimeout(poller.timer);
      job.leased = true;
      poller.resolve({ jobId: job.id, videoId });
    }
    return outcome;
  }

  /** Long poll: the oldest unleased job, or null after `waitMs`. Every call refreshes presence. */
  next(waitMs: number, signal?: AbortSignal): Promise<RelayJob | null> {
    this.lastSeenAt = Date.now();
    for (const job of this.jobs.values()) {
      if (!job.leased) {
        job.leased = true;
        return Promise.resolve({ jobId: job.id, videoId: job.videoId });
      }
    }
    return new Promise((resolve) => {
      const done = (job: RelayJob | null) => {
        const i = this.pollers.indexOf(poller);
        if (i >= 0) this.pollers.splice(i, 1);
        clearTimeout(poller.timer);
        this.lastSeenAt = Date.now();
        resolve(job);
      };
      const poller: Poller = { resolve: done, timer: setTimeout(() => done(null), waitMs) };
      poller.timer.unref?.();
      this.pollers.push(poller);
      signal?.addEventListener("abort", () => done(null), { once: true });
    });
  }

  /** Accepts a result once, only for a job still in flight. Returns false otherwise. */
  complete(result: RelayResult): boolean {
    const job = this.jobs.get(result.jobId);
    if (!job) return false;
    this.finish(
      job,
      result.ok ? { ok: true, transcript: result.transcript } : { ok: false, kind: result.kind },
    );
    return true;
  }

  private finish(job: Job, outcome: RelayOutcome): void {
    if (this.jobs.get(job.id) !== job) return;
    clearTimeout(job.timer);
    this.jobs.delete(job.id);
    this.byVideo.delete(job.videoId);
    for (const resolve of job.waiters) resolve(outcome);
  }
}
