import "server-only";
import type { RelayQueue } from "../relay/queue";
import { TranscriptError, type Transcript, type TranscriptProvider } from "../types";

/**
 * Hands blocked videos to the outbound-only caption relay (feature 002): the owner's machine on a
 * residential IP long-polls the app, fetches captions there and posts them back. Fails fast when no
 * relay is online, so viewers get the paste fallback without waiting.
 */
export class RelayProvider implements TranscriptProvider {
  readonly name = "relay" as const;
  constructor(private readonly queue: RelayQueue) {}

  async fetch(videoId: string): Promise<Transcript> {
    if (!this.queue.online()) throw new TranscriptError("BLOCKED", "no relay online");
    const outcome = await this.queue.request(videoId);
    if (!outcome.ok) throw new TranscriptError(outcome.kind, `relay ${outcome.kind}`);
    return { ...outcome.transcript, source: "relay" };
  }
}
