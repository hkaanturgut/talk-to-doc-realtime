import { describe, expect, it } from "vitest";
import { applyBudget, estimateTokens, pagesUsed } from "@/server/ingestion/budget";

describe("estimateTokens", () => {
  it("is ceil(len / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("applyBudget", () => {
  it("returns the full text when it fits (exact boundary)", () => {
    const r = applyBudget("x".repeat(100), 100);
    expect(r).toEqual({ contextText: "x".repeat(100), truncated: false, usedRatio: 1, fullTextTail: "" });
  });

  it("cuts at the last paragraph boundary", () => {
    const text = `${"a".repeat(90)}\n\n${"b".repeat(50)}`;
    const r = applyBudget(text, 100);
    expect(r.contextText).toBe("a".repeat(90));
    expect(r.truncated).toBe(true);
    expect(r.fullTextTail.startsWith("bbb")).toBe(true);
    expect(r.usedRatio).toBeCloseTo(90 / text.length);
  });

  it("falls back to a sentence boundary when no paragraph is close enough", () => {
    const text = `Intro.\n\n${"word ".repeat(16)}End here. More words follow after this point.`;
    const r = applyBudget(text, 100);
    expect(r.contextText.endsWith("End here.")).toBe(true);
  });

  it("falls back to a word boundary", () => {
    const text = "lorem ipsum ".repeat(20);
    const r = applyBudget(text, 50);
    expect(r.contextText.length).toBeLessThanOrEqual(50);
    expect(r.contextText.endsWith("lorem") || r.contextText.endsWith("ipsum")).toBe(true);
  });

  it("hard-cuts when there is no boundary at all", () => {
    const r = applyBudget("z".repeat(200), 50);
    expect(r.contextText).toBe("z".repeat(50));
    expect(r.usedRatio).toBe(0.25);
    expect(r.fullTextTail).toBe("z".repeat(150));
  });

  it("limits the tail to 500 chars", () => {
    expect(applyBudget("q".repeat(2000), 100).fullTextTail.length).toBe(500);
  });
});

describe("pagesUsed", () => {
  it("counts pages that start inside the context", () => {
    expect(pagesUsed([0, 100, 200, 300], 250)).toBe(3);
    expect(pagesUsed([0, 100], 50)).toBe(1);
  });
});
