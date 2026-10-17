import "server-only";

/** Document budget per provider, in chars (~4 chars per token). Azure: 20k of a 32k window. */
export const MAX_CONTEXT_CHARS = { azure: 80_000, openai: 360_000 } as const;
export const TAIL_CHARS = 500;

export type ProviderName = keyof typeof MAX_CONTEXT_CHARS;

export function currentProvider(): ProviderName {
  return process.env.REALTIME_PROVIDER === "openai" ? "openai" : "azure";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BudgetResult {
  contextText: string;
  truncated: boolean;
  usedRatio: number;
  /** First 500 chars after the cut, shown in the preview to mark where truncation happened. */
  fullTextTail: string;
}

/** A boundary only counts if it keeps at least this share of the budget. */
const MIN_KEEP = 0.8;

function cutPoint(text: string, maxChars: number): number {
  const window = text.slice(0, maxChars + 1);
  const floor = Math.floor(maxChars * MIN_KEEP);

  const para = window.lastIndexOf("\n\n", maxChars);
  if (para >= floor) return para;

  let sentence = -1;
  for (const m of window.matchAll(/[.!?]["')\]]?(?=\s)/g)) {
    const end = m.index + m[0].length;
    if (end <= maxChars) sentence = end;
  }
  if (sentence >= floor) return sentence;

  const space = window.lastIndexOf(" ", maxChars);
  const newline = window.lastIndexOf("\n", maxChars);
  const word = Math.max(space, newline);
  if (word > 0) return word;

  return maxChars;
}

export function applyBudget(text: string, maxChars: number): BudgetResult {
  if (text.length <= maxChars) {
    return { contextText: text, truncated: false, usedRatio: 1, fullTextTail: "" };
  }
  const cut = cutPoint(text, maxChars);
  const contextText = text.slice(0, cut).trimEnd();
  return {
    contextText,
    truncated: true,
    usedRatio: text.length === 0 ? 1 : contextText.length / text.length,
    fullTextTail: text.slice(cut).trimStart().slice(0, TAIL_CHARS),
  };
}

/** Number of pages that are fully or partly inside the context text. */
export function pagesUsed(pageOffsets: number[], contextLength: number): number {
  return Math.max(1, pageOffsets.filter((offset) => offset < contextLength).length);
}
