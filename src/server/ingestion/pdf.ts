import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "@/shared/errors";
import { joinPages } from "./normalize";

export interface PdfExtraction {
  text: string;
  pageCount: number;
  pageOffsets: number[];
}

/** Below this many non-whitespace chars per page (averaged), the PDF is treated as scanned. */
const MIN_CHARS_PER_PAGE = 20;
const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function hasPdfMagic(bytes: Uint8Array): boolean {
  // Some generators put junk before the header; PDF.js accepts a header within the first 1 KB.
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + MAGIC.length <= head.length; i++) {
    if (MAGIC.every((b, j) => head[i + j] === b)) return true;
  }
  return false;
}

function isPasswordError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { name?: string }).name === "PasswordException" ||
      /password/i.test(String((err as Error).message)))
  );
}

export async function extractPdf(
  bytes: Uint8Array,
  opts: { timeoutMs?: number } = {},
): Promise<PdfExtraction> {
  if (!hasPdfMagic(bytes)) throw new AppError("PDF_NOT_PDF");

  const timeoutMs = opts.timeoutMs ?? 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;

  const work = (async () => {
    try {
      // PDF.js may detach the buffer it is given; pass a copy.
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch (err) {
      if (isPasswordError(err)) throw new AppError("PDF_PASSWORD_PROTECTED", { cause: err });
      throw new AppError("PDF_INVALID", { cause: err });
    }
    try {
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      return { pages: text, totalPages };
    } catch (err) {
      throw new AppError("PDF_INVALID", { cause: err });
    }
  })();

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError("PDF_TIMEOUT")), timeoutMs);
  });

  try {
    const { pages, totalPages } = await Promise.race([work, timeout]);
    const nonWhitespace = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
    if (totalPages === 0 || nonWhitespace / totalPages < MIN_CHARS_PER_PAGE)
      throw new AppError("PDF_NO_TEXT");
    const { text, pageOffsets } = joinPages(pages);
    return { text, pageCount: totalPages, pageOffsets };
  } finally {
    clearTimeout(timer);
    work.catch(() => undefined); // a timed-out extraction may reject later
    await (pdf as { destroy?: () => Promise<void> } | undefined)?.destroy?.().catch(() => undefined);
  }
}
