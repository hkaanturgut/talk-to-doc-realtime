import type { SessionState } from "@/client/realtime/reducer";
import { Icon } from "../ui/Icon";

interface Props {
  state: SessionState;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onSwitchMode: () => void;
}

export function SessionControls({ state, onStart, onStop, onToggleMute, onSwitchMode }: Props) {
  const busy = state.status === "connecting" || state.status === "requesting_mic";
  const active = state.status === "live" || state.status === "reconnecting" || busy;
  const voice = state.mode === "voice";

  return (
    <div className="flex items-center gap-3">
      {active ? (
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-base font-semibold text-white shadow-sm active:bg-red-700 disabled:opacity-60"
        >
          <Icon name="stop" />
          {busy ? "Connecting…" : "Stop"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-base font-semibold text-white shadow-sm active:bg-indigo-700"
        >
          <Icon name={voice ? "mic" : "keyboard"} />
          {state.status === "disconnected" || state.status === "error"
            ? "Reconnect"
            : voice
              ? "Start voice chat"
              : "Start text chat"}
        </button>
      )}
      <button
        type="button"
        onClick={onSwitchMode}
        disabled={busy}
        aria-label={voice ? "Type instead" : "Use voice"}
        title={voice ? "Type instead" : "Use voice"}
        className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl border border-neutral-300 bg-white disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <Icon name={voice ? "keyboard" : "mic"} className="h-6 w-6" />
      </button>
      {voice && (
        <button
          type="button"
          onClick={onToggleMute}
          disabled={state.status !== "live"}
          aria-pressed={state.muted}
          aria-label={state.muted ? "Unmute microphone" : "Mute microphone"}
          className={`flex min-h-14 min-w-14 items-center justify-center rounded-2xl border text-base disabled:opacity-40 ${
            state.muted
              ? "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
              : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          }`}
        >
          <Icon name={state.muted ? "micOff" : "mic"} className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
