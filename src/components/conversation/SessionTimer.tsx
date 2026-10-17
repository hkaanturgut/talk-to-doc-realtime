"use client";

import { useEffect, useState } from "react";

export const WARN_BEFORE_MS = 2 * 60_000;

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Shows a countdown in the last 2 minutes and ends the session at the 15-minute cap (FR-030). */
export function SessionTimer({
  capEndsAt,
  active,
  onCap,
}: {
  capEndsAt?: number;
  active: boolean;
  onCap: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !capEndsAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= capEndsAt) onCap();
    }, 1000);
    return () => clearInterval(id);
  }, [active, capEndsAt, onCap]);

  if (!active || !capEndsAt) return null;
  const remaining = capEndsAt - now;
  if (remaining > WARN_BEFORE_MS) return null;
  return (
    <p role="timer" aria-live="polite" className="text-sm font-medium text-amber-700 dark:text-amber-300">
      Session ends in {formatRemaining(remaining)}
    </p>
  );
}
