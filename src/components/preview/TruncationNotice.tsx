import type { PreviewDTO } from "@/shared/schemas";

export function truncationText(p: PreviewDTO): string {
  const pct = Math.max(1, Math.round(p.usedRatio * 100));
  const range =
    p.kind === "pdf" && p.pagesUsed && p.pageCount ? ` (pages 1 to ${p.pagesUsed} of ${p.pageCount})` : "";
  return `Using ${pct}% of this document${range}. The rest is too long for one voice session.`;
}

export function TruncationNotice({ preview }: { preview: PreviewDTO }) {
  if (!preview.truncated) return null;
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      {truncationText(preview)}
    </p>
  );
}
