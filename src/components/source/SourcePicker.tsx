"use client";

import { useState } from "react";
import type { PreviewDTO } from "@/shared/schemas";
import { Icon, type IconName } from "../ui/Icon";
import { PasteTranscript } from "./PasteTranscript";
import { PdfUpload } from "./PdfUpload";
import { YouTubeForm } from "./YouTubeForm";

export type SourceTab = "pdf" | "youtube" | "text";

const TABS: { id: SourceTab; label: string; icon: IconName }[] = [
  { id: "pdf", label: "PDF", icon: "pdf" },
  { id: "youtube", label: "YouTube", icon: "youtube" },
  { id: "text", label: "Paste text", icon: "text" },
];

export function SourcePicker({ onLoaded }: { onLoaded: (p: PreviewDTO) => void }) {
  const [tab, setTab] = useState<SourceTab>("pdf");
  const [paste, setPaste] = useState<{ url: string; message: string } | null>(null);

  return (
    <section aria-label="Choose a source" className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Source type"
        className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.id
                ? "bg-white shadow-sm dark:bg-neutral-800"
                : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "pdf" && <PdfUpload onLoaded={onLoaded} />}
        {tab === "youtube" && (
          <YouTubeForm
            onLoaded={onLoaded}
            onNeedsPaste={(info) => {
              setPaste(info);
              setTab("text");
            }}
          />
        )}
        {tab === "text" && (
          <PasteTranscript onLoaded={onLoaded} reason={paste?.message} sourceUrl={paste?.url} />
        )}
      </div>
    </section>
  );
}
