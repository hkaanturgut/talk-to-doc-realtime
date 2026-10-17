"use client";

import { useState, type FormEvent } from "react";
import { ingestText, userMessage } from "@/client/api";
import { MAX_TEXT_CHARS } from "@/shared/messages";
import type { PreviewDTO } from "@/shared/schemas";
import { ErrorNotice } from "../ui/ErrorNotice";

interface Props {
  onLoaded: (p: PreviewDTO) => void;
  /** Explanation shown when this tab opened because YouTube captions could not be fetched. */
  reason?: string;
  sourceUrl?: string;
}

export function PasteTranscript({ onLoaded, reason, sourceUrl }: Props) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = text.length > MAX_TEXT_CHARS;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !text.trim() || over) return;
    setBusy(true);
    setError(null);
    try {
      onLoaded(await ingestText({ text, title: title.trim() || undefined, sourceUrl }));
    } catch (err) {
      setError(userMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {reason && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {reason} On YouTube, open the video&apos;s description → <strong>Show transcript</strong>, select it
          all, and paste it here.
        </p>
      )}
      <label htmlFor="paste-title" className="text-sm font-medium">
        Title (optional)
      </label>
      <input
        id="paste-title"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <label htmlFor="paste-text" className="text-sm font-medium">
        Transcript or text
      </label>
      <textarea
        id="paste-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <p
        className={`text-right text-xs ${over ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`}
        aria-live="polite"
      >
        {text.length.toLocaleString("en-US")} / {MAX_TEXT_CHARS.toLocaleString("en-US")} characters
      </p>
      <button
        type="submit"
        disabled={busy || !text.trim() || over}
        className="min-h-12 rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Loading…" : "Use this text"}
      </button>
      {error && <ErrorNotice message={error} onDismiss={() => setError(null)} />}
    </form>
  );
}
