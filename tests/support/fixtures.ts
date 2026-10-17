import type { SourceDocument } from "@/server/documents/store";

export function makeDoc(overrides: Partial<SourceDocument> = {}): SourceDocument {
  const text = overrides.contextText ?? "The capital of Atlantis is Poseidonia.";
  return {
    id: crypto.randomUUID(),
    kind: "pdf",
    title: "Atlantis Facts",
    fullText: text,
    contextText: text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 4),
    truncated: false,
    usedRatio: 1,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    ...overrides,
  };
}

let ipCounter = 0;
/** Unique client IP per test so module-level rate limiters don't leak between tests. */
export function freshIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}
