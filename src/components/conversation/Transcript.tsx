"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/client/realtime/reducer";

const LABEL = { user: "You", assistant: "Assistant", system: "" } as const;

export function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const last = entries.at(-1);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, last?.text]);

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        The conversation will appear here.
      </p>
    );
  }

  return (
    <div
      ref={scroller}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto overscroll-contain py-2"
      aria-label="Conversation transcript"
      role="log"
      data-testid="transcript"
    >
      {entries.map((e) =>
        e.speaker === "system" ? (
          <p
            key={e.id}
            className="text-center text-xs text-neutral-500 dark:text-neutral-400"
            data-testid="system-entry"
          >
            {e.text}
          </p>
        ) : (
          <div
            key={e.id}
            className={`flex flex-col gap-1 ${e.speaker === "user" ? "items-end" : "items-start"}`}
            data-testid={`entry-${e.speaker}`}
            data-status={e.status}
          >
            <span className="px-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {LABEL[e.speaker]}
              {e.status === "interrupted" && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  interrupted
                </span>
              )}
            </span>
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed whitespace-pre-wrap ${
                e.speaker === "user"
                  ? "rounded-br-sm bg-indigo-600 text-white"
                  : "rounded-bl-sm bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
              } ${e.status === "in_progress" ? "motion-safe:animate-pulse" : ""}`}
            >
              {e.failed ? <em className="opacity-80">(not transcribed)</em> : e.text || "…"}
            </p>
          </div>
        ),
      )}
    </div>
  );
}
