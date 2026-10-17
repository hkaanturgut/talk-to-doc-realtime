"use client";

import { useCallback, useState } from "react";
import { transcript } from "@/client/realtime/reducer";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { PreviewDTO } from "@/shared/schemas";
import { SessionControls } from "./conversation/SessionControls";
import { SessionTimer } from "./conversation/SessionTimer";
import { StatusBadge } from "./conversation/StatusBadge";
import { Transcript } from "./conversation/Transcript";
import { DocumentPreview } from "./preview/DocumentPreview";
import { SourcePicker } from "./source/SourcePicker";
import { ErrorNotice } from "./ui/ErrorNotice";

export function App() {
  const [preview, setPreview] = useState<PreviewDTO | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const { state, audioRef, start, stop, toggleMute, endForCap } = useVoiceSession(
    preview ? { documentId: preview.documentId, title: preview.title } : null,
  );
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
                <p role="status" className="text-sm text-neutral-600 dark:text-neutral-300">
                  {state.notice}
                </p>
              )}
              <Transcript entries={transcript(state)} />
            </section>
          </>
        )}
      </main>

      {preview && (
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <SessionControls state={state} onStart={start} onStop={stop} onToggleMute={toggleMute} />
        </div>
      )}
      {/* Remote model audio. playsInline + autoPlay are required on iOS. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </div>
  );
}
