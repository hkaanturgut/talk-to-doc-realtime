"use client";

import { useState, type FormEvent } from "react";
import { ingestYouTube, userMessage } from "@/client/api";
import type { ErrorCode } from "@/shared/errors";
import type { PreviewDTO } from "@/shared/schemas";
import { ErrorNotice } from "../ui/ErrorNotice";

const LOOKS_LIKE_YOUTUBE = /(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;

interface Props {
  onLoaded: (p: PreviewDTO) => void;
  /** Called on YOUTUBE_BLOCKED / YOUTUBE_NO_CAPTIONS so the paste fallback can open. */
  onNeedsPaste: (info: { url: string; message: string }) => void;
}

export function YouTubeForm({ onLoaded, onNeedsPaste }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = url.trim() && !LOOKS_LIKE_YOUTUBE.test(url) ? "Paste a youtube.com or youtu.be link." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onLoaded(await ingestYouTube(url.trim()));
    } catch (err) {
      const { code, message } = userMessage(err);
      if ((["YOUTUBE_BLOCKED", "YOUTUBE_NO_CAPTIONS"] as ErrorCode[]).includes(code)) {
        onNeedsPaste({ url: url.trim(), message });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      /* clipboard not permitted; user can paste manually */
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="yt-url" className="text-sm font-medium">
        YouTube link
      </label>
      <div className="flex gap-2">
        <input
          id="yt-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://youtu.be/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={hint ? true : undefined}
          aria-describedby={hint ? "yt-hint" : undefined}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="min-h-12 shrink-0 rounded-xl border border-neutral-300 px-3 text-sm font-medium dark:border-neutral-700"
        >
          Paste
        </button>
      </div>
      {hint && (
        <p id="yt-hint" className="text-sm text-amber-700 dark:text-amber-300">
          {hint}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="min-h-12 rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Fetching captions…" : "Load video"}
      </button>
      {error && <ErrorNotice message={error} onDismiss={() => setError(null)} />}
    </form>
  );
}
