"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../ui/Icon";

interface Props {
  onSend: (text: string) => boolean;
  disabled: boolean;
  busy: boolean;
}

/** Typed questions; works in both voice and text sessions (US3 scenario 3). */
export function TextComposer({ onSend, disabled, busy }: Props) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || disabled) return;
    if (onSend(text)) setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2" aria-label="Message composer">
      <label htmlFor="composer" className="sr-only">
        Type a question
      </label>
      <input
        id="composer"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        enterKeyHint="send"
        autoComplete="off"
        maxLength={2000}
        placeholder={disabled ? "Start a chat to type" : "Type a question…"}
        className="min-h-12 flex-1 rounded-2xl border border-neutral-300 bg-white px-4 text-base outline-none placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={disabled || busy || text.trim().length === 0}
        aria-label={busy ? "Waiting for the answer" : "Send"}
        className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
      >
        <Icon name="send" />
      </button>
    </form>
  );
}
