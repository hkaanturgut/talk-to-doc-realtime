/** Reconnect policy (spec FR-020, research R5): 1, 2, 4, 8 s, then 8 s, until 30 s after the first drop. */
export const RECONNECT_WINDOW_MS = 30_000;
export const DISCONNECT_GRACE_MS = 2_000;
export const OPEN_TIMEOUT_MS = 10_000;
export const BACKGROUND_LIMIT_MS = 30_000;

const SCHEDULE_S = [1, 2, 4, 8];

/** Delay before reconnect attempt `attempt` (0-based), in ms. */
export function nextDelay(attempt: number): number {
  return (SCHEDULE_S[Math.min(attempt, SCHEDULE_S.length - 1)] ?? 8) * 1000;
}

export function shouldGiveUp(firstDropAt: number, now: number): boolean {
  return now - firstDropAt >= RECONNECT_WINDOW_MS;
}

export type DropTrigger = "pc_disconnected" | "pc_failed" | "channel_closed" | "offline";

/** Whether a trigger reconnects now or after the grace period (ICE `disconnected` often recovers). */
export function needsGrace(trigger: DropTrigger): boolean {
  return trigger === "pc_disconnected";
}
