import "server-only";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Cleans extracted text: strips control chars, joins words hyphenated across line breaks,
 * collapses runs of spaces, and keeps paragraph/page breaks as single blank lines.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n[ ]+/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalizes each page and joins them with blank lines; returns the start offset of each page. */
export function joinPages(pages: string[]): { text: string; pageOffsets: number[] } {
  const pageOffsets: number[] = [];
  let text = "";
  for (const page of pages) {
    const clean = normalizeText(page);
    if (text.length > 0 && clean.length > 0) text += "\n\n";
    pageOffsets.push(text.length);
    text += clean;
  }
  return { text, pageOffsets };
}
