"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { transcript } from "@/client/realtime/reducer";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { PreviewDTO } from "@/shared/schemas";
import { DebugPanel } from "./conversation/DebugPanel";
import { SessionControls } from "./conversation/SessionControls";
import { SessionTimer } from "./conversation/SessionTimer";
import { StatusBadge } from "./conversation/StatusBadge";
import { TextComposer } from "./conversation/TextComposer";
import { Transcript } from "./conversation/Transcript";
import { DocumentPreview } from "./preview/DocumentPreview";
import { SourcePicker } from "./source/SourcePicker";
import { ErrorNotice } from "./ui/ErrorNotice";

export function App() {
  const [preview, setPreview] = useState<PreviewDTO | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  // ?debug=1 shows the latency panel; the server snapshot is false so hydration matches.
  const debug = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("debug") === "1",
    () => false,
  );
  const { state, audioRef, start, stop, toggleMute, endForCap, sendText, setMode, controller } =
    useVoiceSession(preview ? { documentId: preview.documentId, title: preview.title } : null);
  const live = state.status === "live" || state.status === "reconnecting" || state.status === "connecting";

  const replace = useCallback(() => {
    if (live) {
      setConfirmReplace(true);
      return;
    }
    setPreview(null);
  }, [live]);

  const onCap = useCallback(() => endForCap(), [endForCap]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <h1 className="text-xl font-semibold tracking-tight">Talk to a Doc</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Load a PDF or a YouTube video, then ask questions out loud.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-4">
        {!preview ? (
          <SourcePicker onLoaded={setPreview} />
        ) : (
          <>
            <DocumentPreview preview={preview} onReplace={replace} />

            {confirmReplace && (
              <div
                role="alertdialog"
                aria-label="Replace document"
                className="flex flex-col gap-3 rounded-xl border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <p className="text-sm">Changing the document ends the current conversation.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="min-h-11 flex-1 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white"
                    onClick={() => {
                      stop();
                      setConfirmReplace(false);
                      setPreview(null);
                    }}
                  >
                    End and change
                  </button>
                  <button
                    type="button"
                    className="min-h-11 flex-1 rounded-lg border border-neutral-300 px-3 text-sm font-medium dark:border-neutral-700"
                    onClick={() => setConfirmReplace(false)}
                  >
                    Keep talking
                  </button>
                </div>
              </div>
            )}

            <section aria-label="Conversation" className="flex flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge state={state} />
                <SessionTimer capEndsAt={state.capEndsAt} active={state.status === "live"} onCap={onCap} />
              </div>
              {state.error && <ErrorNotice message={state.error.message} />}
              {state.notice && !state.error && (
                <p
                  role="status"
                  className="rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                  data-testid="notice"
                >
                  {state.notice}
                </p>
              )}
              <Transcript entries={transcript(state)} />
              {debug && <DebugPanel controller={controller} />}
            </section>
          </>
        )}
      </main>

      {preview && (
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <div className="flex flex-col gap-3">
            {(state.mode === "text" || state.status === "live") && (
              <TextComposer onSend={sendText} disabled={state.status !== "live"} busy={state.responding} />
            )}
            <SessionControls
              state={state}
              onStart={start}
              onStop={stop}
              onToggleMute={toggleMute}
              onSwitchMode={() => void setMode(state.mode === "voice" ? "text" : "voice")}
            />
          </div>
        </div>
      )}
      {/* Remote model audio. playsInline + autoPlay are required on iOS. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </div>
  );
}

const noopSubscribe = () => () => undefined;
