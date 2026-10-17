"use client";

import { useState, type ReactNode } from "react";
import type { PreviewDTO } from "@/shared/schemas";
import { Icon, type IconName } from "../ui/Icon";
import { PdfUpload } from "./PdfUpload";

export type SourceTab = "pdf" | "youtube" | "text";

const TABS: { id: SourceTab; label: string; icon: IconName }[] = [
  { id: "pdf", label: "PDF", icon: "pdf" },
  { id: "youtube", label: "YouTube", icon: "youtube" },
  { id: "text", label: "Paste text", icon: "text" },
];

interface Props {
  onLoaded: (p: PreviewDTO) => void;
  /** Extra tabs are rendered by the caller so this stays a thin shell. */
  renderTab?: (
    tab: SourceTab,
    controls: { onLoaded: (p: PreviewDTO) => void; switchTo: (t: SourceTab) => void },
  ) => ReactNode;
  enabledTabs?: SourceTab[];
}

export function SourcePicker({ onLoaded, renderTab, enabledTabs = ["pdf"] }: Props) {
  const [tab, setTab] = useState<SourceTab>("pdf");
  const tabs = TABS.filter((t) => enabledTabs.includes(t.id));

  return (
    <section aria-label="Choose a source" className="flex flex-col gap-3">
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="Source type"
          className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900"
        >
          {tabs.map((t) => (
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
      )}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "pdf" ? <PdfUpload onLoaded={onLoaded} /> : renderTab?.(tab, { onLoaded, switchTo: setTab })}
      </div>
    </section>
  );
}
