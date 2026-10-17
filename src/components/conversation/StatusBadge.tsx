import type { SessionState } from "@/client/realtime/reducer";

export function statusLabel(state: Pick<SessionState, "status" | "activity" | "muted" | "mode">): string {
  switch (state.status) {
    case "idle":
      return "Ready";
    case "requesting_mic":
      return "Waiting for microphone…";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    case "live":
      if (state.mode === "voice" && state.muted) return "Muted";
      if (state.activity === "listening") return "Listening";
      if (state.activity === "thinking") return "Thinking…";
      if (state.activity === "assistant_speaking") return "Speaking";
      return state.mode === "text" ? "Live (text)" : "Live";
  }
}

const DOT: Record<SessionState["status"], string> = {
  idle: "bg-neutral-400",
  requesting_mic: "bg-amber-500 animate-pulse",
  connecting: "bg-amber-500 animate-pulse",
  live: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-neutral-500",
  error: "bg-red-500",
};

export function StatusBadge({ state }: { state: SessionState }) {
  const label = statusLabel(state);
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium dark:bg-neutral-800"
      data-testid="status-badge"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${state.muted && state.status === "live" ? "bg-amber-500" : DOT[state.status]}`}
      />
      <span aria-live="polite" aria-atomic="true">
        {label}
      </span>
    </div>
  );
}
