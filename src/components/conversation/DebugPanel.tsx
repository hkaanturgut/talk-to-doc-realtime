"use client";

import { useEffect, useState } from "react";
import type { SessionController } from "@/client/realtime/controller";
import { LatencyTracker, percentile } from "@/client/realtime/latency";

const fmt = (ms: number | undefined) => (ms === undefined ? "–" : `${Math.round(ms)} ms`);

/** Shown with ?debug=1. Latency targets: reply start p90 ≤ 1.5 s (SC-003), interrupt stop p90 ≤ 500 ms (SC-004). */
export function DebugPanel({ controller }: { controller: SessionController | null }) {
  const [tracker] = useState(() => new LatencyTracker());
  const [, force] = useState(0);

  useEffect(() => {
    if (!controller) return;
    return controller.onServerEvent((event, now) => {
      tracker.record(event, now);
      force((n) => n + 1);
    });
  }, [controller, tracker]);

  const rows = [
    { label: "Reply start", values: tracker.stats.replyStart, target: 1500 },
    { label: "Interrupt stop", values: tracker.stats.interruptStop, target: 500 },
  ];

  return (
    <section
      aria-label="Latency debug panel"
      className="rounded-xl border border-dashed border-neutral-300 p-3 font-mono text-xs dark:border-neutral-700"
    >
      <table className="w-full text-left">
        <thead>
          <tr className="text-neutral-500">
            <th className="font-normal">metric</th>
            <th className="font-normal">n</th>
            <th className="font-normal">p50</th>
            <th className="font-normal">p90</th>
            <th className="font-normal">target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p90 = percentile(r.values, 90);
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.values.length}</td>
                <td>{fmt(percentile(r.values, 50))}</td>
                <td className={p90 !== undefined && p90 > r.target ? "text-red-600" : ""}>{fmt(p90)}</td>
                <td>≤ {r.target} ms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
