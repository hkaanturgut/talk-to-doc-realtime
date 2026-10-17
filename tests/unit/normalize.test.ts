import { describe, expect, it } from "vitest";
import { joinPages, normalizeText } from "@/server/ingestion/normalize";

describe("normalizeText", () => {
  it("collapses whitespace", () => {
    expect(normalizeText("a   b\t\tc d")).toBe("a b c d");
  });
  it("joins words hyphenated across line breaks", () => {
    expect(normalizeText("infor-\nmation")).toBe("information");
  });
  it("keeps real hyphens before capitals and numbers", () => {
    expect(normalizeText("Jean-\nPaul")).toBe("Jean-\nPaul");
  });
  it("keeps paragraph breaks as one blank line", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
  it("strips control characters and trims line edges", () => {
    expect(normalizeText("  a\u0000b \n  c\u0007 ")).toBe("ab\nc");
  });
  it("normalizes CRLF", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("joinPages", () => {
  it("joins pages with blank lines and records offsets", () => {
    const { text, pageOffsets } = joinPages(["one", "two", "three"]);
    expect(text).toBe("one\n\ntwo\n\nthree");
    expect(pageOffsets).toEqual([0, 5, 10]);
  });
});
