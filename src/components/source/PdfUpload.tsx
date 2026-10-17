"use client";

import { useRef, useState } from "react";
import { uploadPdf, userMessage, type UploadHandle } from "@/client/api";
import { formatMb, MAX_PDF_BYTES } from "@/shared/messages";
import type { PreviewDTO } from "@/shared/schemas";
import { Icon } from "../ui/Icon";
import { ErrorNotice } from "../ui/ErrorNotice";

type Phase = { kind: "idle" } | { kind: "uploading"; ratio: number } | { kind: "extracting" };

export function PdfUpload({ onLoaded, disabled }: { onLoaded: (p: PreviewDTO) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_PDF_BYTES) {
      setError(`This PDF is ${formatMb(file.size)}. The limit is 25 MB.`);
      return;
    }
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("This file is not a valid PDF.");
      return;
    }
    setPhase({ kind: "uploading", ratio: 0 });
    const handle = uploadPdf(file, (ratio, p) =>
      setPhase(p === "extracting" ? { kind: "extracting" } : { kind: "uploading", ratio }),
    );
    handleRef.current = handle;
    try {
      onLoaded(await handle.promise);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(userMessage(err).message);
    } finally {
      handleRef.current = null;
      setPhase({ kind: "idle" });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = phase.kind !== "idle";

  return (
    <div className="flex flex-col gap-3">
      <label
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
          busy || disabled
            ? "cursor-not-allowed border-neutral-200 opacity-60 dark:border-neutral-800"
            : "border-neutral-300 hover:border-indigo-400 active:bg-indigo-50 dark:border-neutral-700 dark:active:bg-indigo-950/40"
        }`}
      >
        <Icon name="upload" className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
        <span className="text-base font-medium">Choose a PDF</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Text-based PDF, up to 25 MB</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy || disabled}
          onChange={(e) => onFile(e.target.files?.[0])}
          data-testid="pdf-input"
        />
      </label>

      {busy && (
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={`h-full bg-indigo-600 transition-all ${phase.kind === "extracting" ? "w-full animate-pulse" : ""}`}
              style={phase.kind === "uploading" ? { width: `${Math.round(phase.ratio * 100)}%` } : undefined}
            />
          </div>
          <span className="w-36 text-right text-sm text-neutral-600 dark:text-neutral-300">
            {phase.kind === "uploading" ? `Uploading ${Math.round(phase.ratio * 100)}%` : "Extracting text…"}
          </span>
          <button
            type="button"
            onClick={() => handleRef.current?.cancel()}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-neutral-700 underline dark:text-neutral-200"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <ErrorNotice message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
