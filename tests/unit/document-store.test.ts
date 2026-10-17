import { describe, expect, it } from "vitest";
import { InMemoryDocumentStore, type SourceDocument } from "@/server/documents/store";

function doc(id: string, text = "hello", at = 0): SourceDocument {
  return {
    id,
    kind: "text",
    title: id,
    fullText: text,
    contextText: text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 4),
    truncated: false,
    usedRatio: 1,
    createdAt: at,
    lastUsedAt: at,
  };
}

describe("InMemoryDocumentStore", () => {
  it("stores and returns documents", () => {
    const store = new InMemoryDocumentStore({ now: () => 0 });
    store.put(doc("a"));
    expect(store.get("a")?.title).toBe("a");
    expect(store.get("missing")).toBeUndefined();
  });

  it("expires after the idle TTL, and reads refresh it", () => {
    let t = 0;
    const store = new InMemoryDocumentStore({ ttlMs: 1000, now: () => t });
    store.put(doc("a"));
    t = 900;
    expect(store.get("a")).toBeDefined(); // refreshes lastUsedAt to 900
    t = 1800;
    expect(store.get("a")).toBeDefined();
    t = 2801;
    expect(store.get("a")).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("evicts the least recently used above the document cap", () => {
    let t = 0;
    const store = new InMemoryDocumentStore({ maxDocs: 2, now: () => t });
    store.put(doc("a"));
    store.put(doc("b"));
    t = 1;
    store.get("a"); // b is now least recently used
    store.put(doc("c"));
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")).toBeDefined();
    expect(store.get("c")).toBeDefined();
  });

  it("evicts by bytes", () => {
    const store = new InMemoryDocumentStore({ maxBytes: 100, now: () => 0 });
    store.put(doc("a", "x".repeat(20))); // 80 bytes
    store.put(doc("b", "y".repeat(20))); // 160 total, a evicted
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toBeDefined();
  });
});
