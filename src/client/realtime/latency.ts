import type { ServerEvent } from "./events";

/** Nearest-rank percentile. Returns undefined for an empty sample. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export interface LatencyStats {
  replyStart: number[];
  interruptStop: number[];
}

/**
 * Measures, from data-channel events:
 * - reply start (SC-003): speech_stopped → output_audio_buffer.started
 * - interrupt stop (SC-004): speech_started while audio plays → output_audio_buffer.cleared
 */
export class LatencyTracker {
  readonly stats: LatencyStats = { replyStart: [], interruptStop: [] };
  private speechStoppedAt?: number;
  private bargeInAt?: number;
  private playing = false;

  record(event: ServerEvent, now: number): void {
    switch (event.type) {
      case "input_audio_buffer.speech_stopped":
        this.speechStoppedAt = now;
        break;
      case "input_audio_buffer.speech_started":
        if (this.playing) this.bargeInAt = now;
        break;
      case "output_audio_buffer.started":
        this.playing = true;
        if (this.speechStoppedAt !== undefined) {
          this.stats.replyStart.push(now - this.speechStoppedAt);
          this.speechStoppedAt = undefined;
        }
        break;
      case "output_audio_buffer.cleared":
        this.playing = false;
        if (this.bargeInAt !== undefined) {
          this.stats.interruptStop.push(now - this.bargeInAt);
          this.bargeInAt = undefined;
        }
        break;
      case "output_audio_buffer.stopped":
        this.playing = false;
        break;
    }
  }
}
